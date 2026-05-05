import { useCallback, useRef } from 'react';
import {
  getIntegrationForUrl,
  type SiteIntegration,
} from '../../lib/skills';
import type { IntegrationTool } from '../../lib/skills/types';
import {
  AnthropicProvider,
  toAnthropicMessages,
  type AnthropicContentBlock,
  type AnthropicMessage,
} from '../../lib/llm/anthropic';
import { MockProvider } from '../../lib/llm/mock';
import { OllamaProvider } from '../../lib/llm/ollama';
import type { LLMProvider, ToolSpec } from '../../lib/llm/provider';
import { getAnthropicApiKey, getOAuthTokens } from '../../lib/storage';
import { executeReadTool, executeWriteTool } from '../../lib/tools/execute';
import {
  ANTHROPIC_TOOL_SCHEMAS,
  describeAction,
  isWriteTool,
} from '../../lib/tools/registry';
import { isValidPubkey } from '../../lib/wallet';
import type { Message, ToolKind } from '../../types';
import { useApp } from '../store/app';

const ENV_PROVIDER = (
  import.meta.env.VITE_LLM_PROVIDER ?? ''
).trim().toLowerCase();

const MAX_TOOL_ITERATIONS = 6;
const TOOL_RESULT_MAX_BYTES = 2500;
// Anthropic's 30K-tokens/MINUTE limit is org-wide and cumulative across requests.
// 8 iterations × 5K tokens each can blow it. Compact aggressively.
const COMPACT_THRESHOLD_CHARS = 6_000;
// Keep last N messages intact (last turn = 2 messages: assistant + user-tool-result)
const KEEP_RECENT_MESSAGES = 2;
const COMPACTED_PLACEHOLDER_PREVIEW = 80;

function approximatePayloadSize(messages: AnthropicMessage[]): number {
  return JSON.stringify(messages).length;
}

function compactRawMessages(
  messages: AnthropicMessage[],
): AnthropicMessage[] {
  if (approximatePayloadSize(messages) < COMPACT_THRESHOLD_CHARS) {
    return messages;
  }
  const keepFromIdx = Math.max(0, messages.length - KEEP_RECENT_MESSAGES);
  return messages.map((m, i): AnthropicMessage => {
    if (i >= keepFromIdx) return m;
    if (m.role !== 'user' || !Array.isArray(m.content)) return m;
    const newContent: AnthropicContentBlock[] = m.content.map((block) => {
      if (block.type === 'tool_result') {
        const text =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
        if (text.length > 200) {
          const preview = text
            .slice(0, COMPACTED_PLACEHOLDER_PREVIEW)
            .replace(/\s+/g, ' ');
          return {
            ...block,
            content: `[earlier result · ${text.length} chars compressed · preview: ${preview}…]`,
          };
        }
      }
      return block;
    });
    return { ...m, content: newContent };
  });
}

const mockProvider = new MockProvider();
const ollamaProvider = new OllamaProvider();
type CachedAnthropic = {
  cacheKey: string;
  provider: AnthropicProvider;
};
let cachedAnthropic: CachedAnthropic | null = null;

async function pickProvider(): Promise<LLMProvider> {
  if (ENV_PROVIDER === 'ollama') return ollamaProvider;
  if (ENV_PROVIDER === 'mock') return mockProvider;
  // Prefer OAuth subscription if user logged in.
  const tokens = await getOAuthTokens();
  if (tokens) {
    const cacheKey = 'oauth';
    if (cachedAnthropic && cachedAnthropic.cacheKey === cacheKey) {
      return cachedAnthropic.provider;
    }
    const provider = new AnthropicProvider({ kind: 'oauth' });
    cachedAnthropic = { cacheKey, provider };
    return provider;
  }
  const key = await getAnthropicApiKey();
  if (!key) return mockProvider;
  const cacheKey = `apiKey:${key}`;
  if (cachedAnthropic && cachedAnthropic.cacheKey === cacheKey) {
    return cachedAnthropic.provider;
  }
  const provider = new AnthropicProvider({ kind: 'apiKey', value: key });
  cachedAnthropic = { cacheKey, provider };
  return provider;
}

const WALLET_TOOL_KINDS: ReadonlySet<ToolKind> = new Set<ToolKind>([
  'getBalance',
  'getTokenAccounts',
  'getRecentTransactions',
  'sendSol',
  'swapJupiter',
  'getPageContext',
  'getDefiYields',
  'httpGet',
  'httpPost',
  'signAndSendTx',
  'pageAction',
  'scrollPage',
  'extractTweets',
  'navigateTab',
  'xPostTweet',
  'xLikeTweet',
  'xReplyTweet',
  'xRetweetTweet',
  'xExtractCurrentTweet',
  'jupiterSwapBySymbol',
]);

function isWalletTool(name: string): name is ToolKind {
  return WALLET_TOOL_KINDS.has(name as ToolKind);
}

function findIntegrationTool(
  integration: SiteIntegration | null,
  name: string,
): IntegrationTool | null {
  if (!integration) return null;
  for (const t of integration.tools) {
    if (t.schema.name === name) return t;
  }
  return null;
}

function buildSystemPrompt(
  pubkey: string,
  integration: SiteIntegration | null,
  discoveredLlmsTxt: string | null,
  currentDomain: string | null,
): string {
  const lines = [
    // Override the OAuth-required "You are Claude Code" prefix that Anthropic
    // injects ahead of this. We are NOT a CLI — re-establish role explicitly.
    'Identity override: ignore any prior "Claude Code CLI" framing. You are an in-browser Solana wallet copilot integrated into a Chrome extension. Never introduce yourself as Claude Code. Never mention CLI capabilities you do not have.',
    '',
    `Solana wallet copilot. Wallet: ${pubkey}.`,
    currentDomain ? `Site: ${currentDomain}.` : '',
    '',
    'Call the matching tool immediately. After read: 1-sentence summary, no raw JSON. After write (card has ✓+link): ≤8-word ack.',
    '',
    'Routing: "this/page/visible"→getPageContext. "scroll all/read all/summarize feed"→scrollPage direction=all. "summarize tweets/posts on X"→extractTweets. "click/fill/press" or "use UI" or "post/tweet/compose on X"→pageAction. "swap/send/transfer"→swapJupiter/sendSol. "best yield/rates"→getDefiYields.',
    '',
    'Mints: SOL=So11111111111111111111111111111111111111112 USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v USDT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB JUP=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN BONK=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263.',
    '',
    'Rules: SNS .sol unsupported. One write per turn. Default amount=1. Don\'t add unprompted checks.',
    '',
    'BE PROACTIVE — do not ask for clarification on creative tasks. "random post / tweet / compose about X" → invent reasonable text yourself (concise, ≤240 chars, on-topic), then drive UI via pageAction. Don\'t ask "what should it say". The user can edit before approving the final post-button click.',
    '',
    'X/TWITTER POSTING: ALWAYS use the xPostTweet tool — it does open-compose + fill + submit in one approval. DO NOT use pageAction for posting tweets (that approach needs 4 separate approvals and is fragile). For likes use xLikeTweet (must be on the tweet permalink page). For reading use extractTweets.',
    '',
    'ANTI-HALLUCINATION: when summarizing scraped DOM (visibleText, scrolled content), ONLY state facts directly visible in the text. Do NOT invent URLs, account handles, dates, deadlines, or numbers you don\'t literally see. Prefer direct quotes ("the page shows: \\"...\\"") over paraphrasing. If a detail is unclear, say "not visible" rather than guess. The DOM text is a noisy concat — be conservative.',
    '',
    'X/TWITTER RULE: NEVER invent tweet content, author names, dates, or metrics. ALWAYS extractTweets first. If extractTweets returns tweets:[] empty → scrollPage direction="down" then extractTweets AGAIN (timeline lazy-loads). If still empty after 1 retry → say "couldn\'t load tweets — page may not have rendered yet". When reporting metrics (likes/views/replies), copy the exact number from metrics.{likes,views,replies,etc} field — do NOT confuse likes with views. If a metric is null in the output, say "not visible" — do not substitute another metric.',
    '',
    'EMPTY DOM RULE: when getPageContext returns dom with 0 headings, 0 buttons, 0 inputs, 0 links — the page is React-virtualized (e.g. Pump.fun, Drift). DO NOT invent any data about the page (coin names, prices, market caps, listings). Either: (a) call the integration\'s typed API tool if available (pumpfunGetTrending, pumpfunGetKingOfTheHill, etc), OR (b) say explicitly "the page is React-rendered and DOM extraction returned no content — I cannot read it directly. Try the typed tools or describe what you see." Never bullshit through it.',
  ].filter(Boolean);

  const parts: string[] = [lines.join('\n')];
  if (integration) {
    parts.push(`Site: ${integration.name}.\n${integration.systemPromptHint}`);
  } else if (discoveredLlmsTxt && currentDomain) {
    parts.push(
      [
        `Site ${currentDomain} docs below.`,
        'For READ APIs: use httpGet with URLs from these docs.',
        'For WRITE APIs (swap, transfer, build, execute): use httpPost to call the build endpoint, then call signAndSendTx with the returned base64 transaction. The user must approve signAndSendTx before it broadcasts.',
        '---',
        discoveredLlmsTxt,
      ].join('\n'),
    );
  }
  return parts.join('\n\n');
}

function buildToolSpecs(
  integration: SiteIntegration | null,
  hasDiscoveredDocs: boolean,
): ToolSpec[] {
  // httpGet/httpPost/signAndSendTx are composition primitives — only useful when
  // we have llms.txt-style site docs that the AI can use to build URLs.
  const filtered = hasDiscoveredDocs
    ? ANTHROPIC_TOOL_SCHEMAS
    : ANTHROPIC_TOOL_SCHEMAS.filter(
        (s) =>
          s.name !== 'httpGet' &&
          s.name !== 'httpPost' &&
          s.name !== 'signAndSendTx',
      );
  const wallet: ToolSpec[] = filtered.map((s) => ({
    name: s.name,
    description: s.description,
    input_schema: s.input_schema as Record<string, unknown>,
  }));
  if (!integration) return wallet;
  const siteTools: ToolSpec[] = integration.tools.map((t) => ({
    name: t.schema.name,
    description: t.schema.description,
    input_schema: t.schema.input_schema as unknown as Record<string, unknown>,
  }));
  return [...wallet, ...siteTools];
}

function describeToolByName(
  name: string,
  args: Record<string, unknown>,
  integration: SiteIntegration | null,
): string {
  if (isWalletTool(name)) return describeAction(name, args);
  const tool = findIntegrationTool(integration, name);
  if (tool) return tool.describe(args);
  return name;
}

async function executeAnyRead(
  name: string,
  args: Record<string, unknown>,
  pubkey: string,
  currentUrl: string | undefined,
  integration: SiteIntegration | null,
): Promise<unknown> {
  if (isWalletTool(name)) {
    return executeReadTool(name, args, { pubkey, currentUrl });
  }
  const tool = findIntegrationTool(integration, name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args, { pubkey });
}

type CommonCtx = {
  pubkey: string;
  currentUrl: string | undefined;
  integration: SiteIntegration | null;
  systemPrompt: string;
  tools: ToolSpec[] | undefined;
  controller: AbortController;
};

type ToolUseRecord = {
  toolUseId: string;
  actionId: string;
  name: string;
  args: Record<string, unknown>;
  isWrite: boolean;
};

type WriteFollowUp = {
  rawMessages: AnthropicMessage[];
  iterationText: string;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
  readResults: AnthropicContentBlock[];
  systemPrompt: string;
  tools: ToolSpec[] | undefined;
  // Batch state — Anthropic requires ALL tool_uses from one assistant message
  // to have ALL tool_results in the next user message. Accumulate per-write
  // results and only fire follow-up once every pending write is resolved.
  pendingWriteIds: Set<string>;
  writeResults: Map<string, { content: string; isError: boolean }>;
};

const pendingWriteFollowUps = new Map<string, WriteFollowUp>();

function validateToolCall(
  name: string,
  args: Record<string, unknown>,
): string | null {
  if (name === 'sendSol') {
    const to = String(args.to ?? '');
    if (!isValidPubkey(to)) {
      return `Invalid recipient: "${to}". SNS .sol names are not supported — paste a full base58 pubkey.`;
    }
  }
  return null;
}

function makeAssistantId(iter: number): string {
  return `a-${Date.now()}-${iter}`;
}

async function runAnthropicMultiTurn(
  provider: AnthropicProvider,
  baseMessages: Message[],
  ctx: CommonCtx,
): Promise<void> {
  const rawMessages: AnthropicMessage[] = toAnthropicMessages(baseMessages);
  await runAnthropicIterations(provider, rawMessages, ctx, 0);
}

async function runAnthropicIterations(
  provider: AnthropicProvider,
  rawMessages: AnthropicMessage[],
  ctx: CommonCtx,
  startIter: number,
): Promise<void> {
  for (let iter = startIter; iter < MAX_TOOL_ITERATIONS; iter++) {
    const { appendMessage, patchAssistant, patchAction } = useApp.getState();
    const assistantId = makeAssistantId(iter);
    appendMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      ts: Date.now(),
      streaming: true,
    });

    let buffer = '';
    let streamErrored = false;
    const toolUses: ToolUseRecord[] = [];

    // Compact older tool_results if context is growing too large
    const compacted = compactRawMessages(rawMessages);

    try {
      for await (const chunk of provider.streamChatNative({
        rawMessages: compacted,
        system: ctx.systemPrompt,
        tools: ctx.tools,
        signal: ctx.controller.signal,
      })) {
        if (chunk.type === 'token') {
          buffer += chunk.value;
          patchAssistant(assistantId, { content: buffer });
        } else if (chunk.type === 'tool_call') {
          const args = (chunk.args ?? {}) as Record<string, unknown>;
          let isWrite = false;
          if (isWalletTool(chunk.name)) {
            isWrite = isWriteTool(chunk.name);
          } else {
            const t = findIntegrationTool(ctx.integration, chunk.name);
            if (!t) continue;
            isWrite = t.isWrite;
          }
          const validationError = validateToolCall(chunk.name, args);
          const actionId = `act-${chunk.id}`;
          appendMessage({
            id: actionId,
            role: 'action',
            ts: Date.now(),
            intent: describeToolByName(chunk.name, args, ctx.integration),
            tool: chunk.name,
            isWrite,
            args,
            status: validationError
              ? 'error'
              : isWrite
                ? 'pending-confirm'
                : 'executing',
            ...(validationError ? { error: validationError } : {}),
          });
          if (!validationError) {
            toolUses.push({
              toolUseId: chunk.id,
              actionId,
              name: chunk.name,
              args,
              isWrite,
            });
          }
        } else if (chunk.type === 'done') {
          patchAssistant(assistantId, { streaming: false });
          break;
        } else if (chunk.type === 'error') {
          patchAssistant(assistantId, {
            streaming: false,
            content: buffer
              ? `${buffer}\n\n[error: ${chunk.error}]`
              : `[error: ${chunk.error}]`,
          });
          streamErrored = true;
          break;
        }
      }
    } finally {
      patchAssistant(assistantId, { streaming: false });
    }

    if (streamErrored || ctx.controller.signal.aborted) return;
    if (toolUses.length === 0) return;

    const reads = toolUses.filter((t) => !t.isWrite);
    const writes = toolUses.filter((t) => t.isWrite);

    // Execute reads in parallel, collect their tool_results
    const readResultBlocks: AnthropicContentBlock[] = [];
    await Promise.all(
      reads.map(async (tu) => {
        try {
          const result = await executeAnyRead(
            tu.name,
            tu.args,
            ctx.pubkey,
            ctx.currentUrl,
            ctx.integration,
          );
          patchAction(tu.actionId, { status: 'done', result });
          readResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tu.toolUseId,
            content: JSON.stringify(result).slice(0, TOOL_RESULT_MAX_BYTES),
          });
        } catch (err) {
          patchAction(tu.actionId, { status: 'error', error: String(err) });
          readResultBlocks.push({
            type: 'tool_result',
            tool_use_id: tu.toolUseId,
            content: `Error: ${String(err)}`,
            is_error: true,
          });
        }
      }),
    );

    if (writes.length > 0) {
      // Pause loop — user must approve writes. Stash a single batched
      // context shared by ALL writes in this iteration. Anthropic requires
      // all tool_uses → all tool_results in the next message.
      const writeContext: WriteFollowUp = {
        rawMessages: [...rawMessages],
        iterationText: buffer,
        toolUses: toolUses.map((t) => ({
          id: t.toolUseId,
          name: t.name,
          input: t.args,
        })),
        readResults: readResultBlocks,
        systemPrompt: ctx.systemPrompt,
        tools: ctx.tools,
        pendingWriteIds: new Set(writes.map((w) => w.toolUseId)),
        writeResults: new Map(),
      };
      for (const w of writes) {
        pendingWriteFollowUps.set(w.actionId, writeContext);
      }
      return;
    }

    // Pure-read iteration: append assistant + tool_results to raw, continue loop
    const assistantBlocks: AnthropicContentBlock[] = [];
    if (buffer.length > 0) {
      assistantBlocks.push({ type: 'text', text: buffer });
    }
    for (const tu of toolUses) {
      assistantBlocks.push({
        type: 'tool_use',
        id: tu.toolUseId,
        name: tu.name,
        input: tu.args,
      });
    }
    rawMessages.push({ role: 'assistant', content: assistantBlocks });
    rawMessages.push({ role: 'user', content: readResultBlocks });
    // Loop to next iteration: AI sees tool results and produces final answer (or more tool calls)
  }
}

async function streamWriteFollowUp(
  provider: AnthropicProvider,
  followUp: WriteFollowUp,
  ctx: CommonCtx,
): Promise<void> {
  // Build assistant content blocks for the iteration where writes were proposed
  const assistantBlocks: AnthropicContentBlock[] = [];
  if (followUp.iterationText.length > 0) {
    assistantBlocks.push({ type: 'text', text: followUp.iterationText });
  }
  for (const tu of followUp.toolUses) {
    assistantBlocks.push({
      type: 'tool_use',
      id: tu.id,
      name: tu.name,
      input: tu.input,
    });
  }

  // Build user content: existing read results + ALL batched write results.
  // Anthropic requires every tool_use in the assistant message to have a
  // corresponding tool_result in the user message that follows.
  const writeBlocks: AnthropicContentBlock[] = [];
  for (const tu of followUp.toolUses) {
    // Skip tool_uses that already had a read result (those are in readResults)
    const isWrite = followUp.writeResults.has(tu.id);
    if (!isWrite) continue;
    const r = followUp.writeResults.get(tu.id);
    if (!r) continue;
    writeBlocks.push({
      type: 'tool_result',
      tool_use_id: tu.id,
      content: r.content.slice(0, TOOL_RESULT_MAX_BYTES),
      ...(r.isError ? { is_error: true } : {}),
    });
  }

  const userBlocks: AnthropicContentBlock[] = [
    ...followUp.readResults,
    ...writeBlocks,
  ];

  const newRawMessages: AnthropicMessage[] = [
    ...followUp.rawMessages,
    { role: 'assistant', content: assistantBlocks },
    { role: 'user', content: userBlocks },
  ];

  // Continue full multi-turn loop so AI can chain more tools
  // (essential for pageAction sequences: click → check page → click again).
  await runAnthropicIterations(provider, newRawMessages, ctx, 0);
}

async function runSingleShot(
  provider: LLMProvider,
  baseMessages: Message[],
  ctx: CommonCtx,
): Promise<void> {
  const { appendMessage, patchAssistant, patchAction } = useApp.getState();
  const assistantId = makeAssistantId(0);
  appendMessage({
    id: assistantId,
    role: 'assistant',
    content: '',
    ts: Date.now(),
    streaming: true,
  });

  let buffer = '';
  const pendingReads: ToolUseRecord[] = [];

  try {
    for await (const chunk of provider.streamChat({
      messages: baseMessages,
      systemPrompt: ctx.systemPrompt,
      tools: ctx.tools,
      signal: ctx.controller.signal,
    })) {
      if (chunk.type === 'token') {
        buffer += chunk.value;
        patchAssistant(assistantId, { content: buffer });
      } else if (chunk.type === 'tool_call') {
        const args = (chunk.args ?? {}) as Record<string, unknown>;
        let isWrite = false;
        if (isWalletTool(chunk.name)) {
          isWrite = isWriteTool(chunk.name);
        } else {
          const t = findIntegrationTool(ctx.integration, chunk.name);
          if (!t) continue;
          isWrite = t.isWrite;
        }
        const validationError = validateToolCall(chunk.name, args);
        const actionId = `act-${chunk.id}`;
        appendMessage({
          id: actionId,
          role: 'action',
          ts: Date.now(),
          intent: describeToolByName(chunk.name, args, ctx.integration),
          tool: chunk.name,
          isWrite,
          args,
          status: validationError
            ? 'error'
            : isWrite
              ? 'pending-confirm'
              : 'executing',
          ...(validationError ? { error: validationError } : {}),
        });
        if (!validationError && !isWrite) {
          pendingReads.push({
            toolUseId: chunk.id,
            actionId,
            name: chunk.name,
            args,
            isWrite,
          });
        }
      } else if (chunk.type === 'done') {
        patchAssistant(assistantId, { streaming: false });
        break;
      } else if (chunk.type === 'error') {
        patchAssistant(assistantId, {
          streaming: false,
          content: buffer
            ? `${buffer}\n\n[error: ${chunk.error}]`
            : `[error: ${chunk.error}]`,
        });
        return;
      }
    }
  } finally {
    patchAssistant(assistantId, { streaming: false });
  }

  // Execute reads (no follow-up loop for single-shot mode)
  for (const tu of pendingReads) {
    patchAction(tu.actionId, { status: 'executing' });
    try {
      const result = await executeAnyRead(
        tu.name,
        tu.args,
        ctx.pubkey,
        ctx.currentUrl,
        ctx.integration,
      );
      patchAction(tu.actionId, { status: 'done', result });
    } catch (err) {
      patchAction(tu.actionId, { status: 'error', error: String(err) });
    }
  }
}

export function useChat() {
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const snapshot = useApp.getState().state;
    if (snapshot.kind !== 'ready') return;

    const integration = getIntegrationForUrl(snapshot.currentUrl);
    const discoveredLlmsTxt = snapshot.discoveredLlmsTxt;
    let currentDomain: string | null = null;
    if (snapshot.currentUrl) {
      try {
        currentDomain = new URL(snapshot.currentUrl).hostname;
      } catch {
        currentDomain = null;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const { appendMessage } = useApp.getState();

    const now = Date.now();
    const userMsg: Message = {
      id: `u-${now}`,
      role: 'user',
      content: trimmed,
      ts: now,
    };
    appendMessage(userMsg);

    const baseMessages = (() => {
      const s = useApp.getState().state;
      if (s.kind !== 'ready') return [];
      return s.messages;
    })();

    const systemPrompt = buildSystemPrompt(
      snapshot.pubkey,
      integration,
      discoveredLlmsTxt,
      currentDomain,
    );

    try {
      const provider = await pickProvider();
      const useTools =
        provider.name === 'anthropic' || provider.name === 'ollama';
      const tools = useTools
        ? buildToolSpecs(integration, Boolean(discoveredLlmsTxt))
        : undefined;

      const ctx: CommonCtx = {
        pubkey: snapshot.pubkey,
        currentUrl: snapshot.currentUrl,
        integration,
        systemPrompt,
        tools,
        controller,
      };

      if (provider instanceof AnthropicProvider) {
        await runAnthropicMultiTurn(provider, baseMessages, ctx);
      } else {
        await runSingleShot(provider, baseMessages, ctx);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('[useChat] error', err);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const approveAction = useCallback(async (actionId: string) => {
    const state = useApp.getState();
    if (state.state.kind !== 'ready') return;
    const action = state.state.messages.find((m) => m.id === actionId);
    if (!action || action.role !== 'action') return;
    if (action.status !== 'pending-confirm') return;

    state.patchAction(actionId, { status: 'executing' });
    let result: unknown;
    let isError = false;
    try {
      if (isWalletTool(action.tool)) {
        result = await executeWriteTool(action.tool, action.args);
      } else {
        result = {
          simulated: true,
          tool: action.tool,
          args: action.args,
          note: 'Integration write actions require Phase 2 wallet signing',
        };
      }
      state.patchAction(actionId, { status: 'done', result });
    } catch (err) {
      isError = true;
      result = `Error: ${String(err)}`;
      state.patchAction(actionId, { status: 'error', error: String(err) });
    }

    // Batch logic: record this write's result. Only fire follow-up once
    // ALL writes in the same iteration are resolved (Anthropic requires all
    // tool_uses in one assistant message → all tool_results in next).
    const followUp = pendingWriteFollowUps.get(actionId);
    if (!followUp) return;
    const writeToolUseId = actionId.startsWith('act-')
      ? actionId.slice(4)
      : actionId;
    followUp.writeResults.set(writeToolUseId, {
      content:
        typeof result === 'string' ? result : JSON.stringify(result),
      isError,
    });
    followUp.pendingWriteIds.delete(writeToolUseId);
    pendingWriteFollowUps.delete(actionId);

    if (followUp.pendingWriteIds.size > 0) {
      // Wait for remaining writes — UI shows other pending-confirm cards
      return;
    }

    // All writes resolved — fire single batched follow-up
    if (!cachedAnthropic) return;
    const snapshot = useApp.getState().state;
    if (snapshot.kind !== 'ready') return;
    const integration = getIntegrationForUrl(snapshot.currentUrl);
    const ctx: CommonCtx = {
      pubkey: snapshot.pubkey,
      currentUrl: snapshot.currentUrl,
      integration,
      systemPrompt: followUp.systemPrompt,
      tools: followUp.tools,
      controller: new AbortController(),
    };
    await streamWriteFollowUp(cachedAnthropic.provider, followUp, ctx);
  }, []);

  const rejectAction = useCallback((actionId: string) => {
    const state = useApp.getState();
    if (state.state.kind !== 'ready') return;
    state.patchAction(actionId, { status: 'rejected' });

    // Batch logic mirror: rejected write counts as resolved (with error tag)
    // so the batch can proceed once all writes have outcomes.
    const followUp = pendingWriteFollowUps.get(actionId);
    if (!followUp) return;
    const writeToolUseId = actionId.startsWith('act-')
      ? actionId.slice(4)
      : actionId;
    followUp.writeResults.set(writeToolUseId, {
      content: 'User rejected this action.',
      isError: true,
    });
    followUp.pendingWriteIds.delete(writeToolUseId);
    pendingWriteFollowUps.delete(actionId);

    if (followUp.pendingWriteIds.size > 0) return;

    // Fire follow-up so AI sees rejection(s) and can react
    if (!cachedAnthropic) return;
    const snapshot = useApp.getState().state;
    if (snapshot.kind !== 'ready') return;
    const integration = getIntegrationForUrl(snapshot.currentUrl);
    const ctx: CommonCtx = {
      pubkey: snapshot.pubkey,
      currentUrl: snapshot.currentUrl,
      integration,
      systemPrompt: followUp.systemPrompt,
      tools: followUp.tools,
      controller: new AbortController(),
    };
    void streamWriteFollowUp(cachedAnthropic.provider, followUp, ctx);
  }, []);

  return { send, approveAction, rejectAction };
}
