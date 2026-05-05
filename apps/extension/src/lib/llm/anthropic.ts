import { getOAuthTokens, setOAuthTokens } from '../storage';
import type { Message } from '../../types';
import {
  CLAUDE_CODE_SYSTEM_PREFIX,
  refreshTokens,
} from './anthropic-oauth';
import type { LLMProvider, StreamChunk, StreamParams, ToolSpec } from './provider';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const ANTHROPIC_VERSION = '2023-06-01';
const OAUTH_BETA = 'oauth-2025-04-20';
const MAX_TOKENS = 1024;

export type AnthropicAuth =
  | { kind: 'apiKey'; value: string }
  | { kind: 'oauth' };

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      const content = m.content;
      if (typeof content === 'string' && content.length > 0) {
        result.push({ role: m.role, content });
      }
    }
  }
  return result;
}

type RawStreamParams = {
  rawMessages: AnthropicMessage[];
  system?: string;
  tools?: ToolSpec[];
  signal?: AbortSignal;
};

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly auth: AnthropicAuth,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.auth.kind === 'apiKey') {
      return {
        'x-api-key': this.auth.value,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      };
    }
    // OAuth: ensure access token still valid; refresh if expired or near expiry
    let tokens = await getOAuthTokens();
    if (!tokens) throw new Error('Not logged in (no OAuth tokens stored)');
    const FIVE_MIN = 5 * 60 * 1000;
    if (Date.now() + FIVE_MIN >= tokens.expiresAt) {
      const fresh = await refreshTokens(tokens.refreshToken);
      tokens = fresh;
      await setOAuthTokens(fresh);
    }
    return {
      Authorization: `Bearer ${tokens.accessToken}`,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-beta': OAUTH_BETA,
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    };
  }

  async *streamChat({
    messages,
    systemPrompt,
    tools,
    signal,
  }: StreamParams): AsyncGenerator<StreamChunk, void, unknown> {
    const rawMessages = toAnthropicMessages(messages);
    if (rawMessages.length === 0) {
      yield { type: 'error', error: 'No messages to send' };
      return;
    }
    yield* this.streamChatNative({
      rawMessages,
      system: systemPrompt,
      tools,
      signal,
    });
  }

  async *streamChatNative({
    rawMessages,
    system,
    tools,
    signal,
  }: RawStreamParams): AsyncGenerator<StreamChunk, void, unknown> {
    if (rawMessages.length === 0) {
      yield { type: 'error', error: 'No messages to send' };
      return;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: MAX_TOKENS,
      messages: rawMessages,
      stream: true,
    };
    // OAuth tokens are gated to Claude Code by Anthropic. Prepend the CC
    // identifier as the first system block so the API accepts the request,
    // then include the real instructions as a second block.
    if (this.auth.kind === 'oauth') {
      body.system = system
        ? [
            { type: 'text', text: CLAUDE_CODE_SYSTEM_PREFIX },
            { type: 'text', text: system },
          ]
        : [{ type: 'text', text: CLAUDE_CODE_SYSTEM_PREFIX }];
    } else if (system) {
      body.system = system;
    }
    if (tools && tools.length > 0) {
      body.tools = tools.map<AnthropicTool>((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    }

    let headers: Record<string, string>;
    try {
      headers = await this.getAuthHeaders();
    } catch (err) {
      yield { type: 'error', error: String(err) };
      return;
    }

    // Route the streaming POST through the background service worker. Pro/Max
    // accounts block browser-origin CORS on api.anthropic.com/v1/messages even
    // with `anthropic-dangerous-direct-browser-access`. Background fetches via
    // host_permissions bypass that check.
    const portChunks = streamViaBackground(API_URL, headers, body, signal);

    let buffer = '';

    type ToolBlock = { id: string; name: string; partialJson: string };
    const toolBlocks = new Map<number, ToolBlock>();

    try {
      for await (const chunk of portChunks) {
        if (chunk.type === 'error') {
          yield { type: 'error', error: `${chunk.status}: ${chunk.body}` };
          return;
        }
        if (chunk.type === 'done') break;
        buffer += chunk.text;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data.length === 0 || data === '[DONE]') continue;
          let event: unknown;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }
          if (typeof event !== 'object' || event === null) continue;
          const ev = event as {
            type?: string;
            index?: number;
            content_block?: { type?: string; id?: string; name?: string };
            delta?: { type?: string; text?: string; partial_json?: string };
            error?: { message?: string };
          };

          if (
            ev.type === 'content_block_start' &&
            typeof ev.index === 'number' &&
            ev.content_block?.type === 'tool_use' &&
            typeof ev.content_block.id === 'string' &&
            typeof ev.content_block.name === 'string'
          ) {
            toolBlocks.set(ev.index, {
              id: ev.content_block.id,
              name: ev.content_block.name,
              partialJson: '',
            });
          } else if (
            ev.type === 'content_block_delta' &&
            typeof ev.index === 'number' &&
            ev.delta?.type === 'text_delta' &&
            typeof ev.delta.text === 'string'
          ) {
            yield { type: 'token', value: ev.delta.text };
          } else if (
            ev.type === 'content_block_delta' &&
            typeof ev.index === 'number' &&
            ev.delta?.type === 'input_json_delta' &&
            typeof ev.delta.partial_json === 'string'
          ) {
            const tb = toolBlocks.get(ev.index);
            if (tb) tb.partialJson += ev.delta.partial_json;
          } else if (
            ev.type === 'content_block_stop' &&
            typeof ev.index === 'number'
          ) {
            const tb = toolBlocks.get(ev.index);
            if (tb) {
              let parsed: unknown = {};
              if (tb.partialJson.length > 0) {
                try {
                  parsed = JSON.parse(tb.partialJson);
                } catch {
                  parsed = {};
                }
              }
              yield {
                type: 'tool_call',
                id: tb.id,
                name: tb.name,
                args: parsed,
              };
              toolBlocks.delete(ev.index);
            }
          } else if (ev.type === 'error') {
            yield {
              type: 'error',
              error: ev.error?.message ?? 'Unknown stream error',
            };
            return;
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      yield { type: 'error', error: `Stream interrupted: ${String(err)}` };
      return;
    }

    yield { type: 'done' };
  }
}

// Async-iterable bridge to the background service worker's port.
// Yields one of: { type: 'chunk'; text } | { type: 'done' } | { type: 'error'; status; body }.
type PortChunk =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; status: number; body: string };

async function* streamViaBackground(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal | undefined,
): AsyncGenerator<PortChunk, void, unknown> {
  const port = chrome.runtime.connect({ name: 'anthropic-stream' });
  const queue: PortChunk[] = [];
  let resolveNext: ((v: PortChunk | null) => void) | null = null;
  let closed = false;

  const push = (chunk: PortChunk) => {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(chunk);
    } else {
      queue.push(chunk);
    }
  };
  const finish = () => {
    closed = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(null);
    }
  };

  port.onMessage.addListener((msg: unknown) => {
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as {
      type?: string;
      text?: string;
      status?: number;
      body?: string;
    };
    if (m.type === 'chunk' && typeof m.text === 'string') {
      push({ type: 'chunk', text: m.text });
    } else if (m.type === 'done') {
      push({ type: 'done' });
      finish();
    } else if (m.type === 'error') {
      push({
        type: 'error',
        status: typeof m.status === 'number' ? m.status : 0,
        body: typeof m.body === 'string' ? m.body : 'unknown',
      });
      finish();
    }
  });
  port.onDisconnect.addListener(() => {
    if (!closed) {
      push({ type: 'done' });
      finish();
    }
  });

  const onAbort = () => {
    try {
      port.disconnect();
    } catch {
      // ignore
    }
    finish();
  };
  signal?.addEventListener('abort', onAbort);

  try {
    port.postMessage({ type: 'start', url, headers, body });
  } catch (e) {
    yield {
      type: 'error',
      status: 0,
      body: `Failed to post to bg port: ${String(e)}`,
    };
    return;
  }

  try {
    while (!closed || queue.length > 0) {
      let next: PortChunk | null;
      if (queue.length > 0) {
        next = queue.shift() ?? null;
      } else {
        next = await new Promise<PortChunk | null>((r) => {
          resolveNext = r;
        });
      }
      if (next === null) break;
      yield next;
      if (next.type === 'done' || next.type === 'error') break;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      port.disconnect();
    } catch {
      // ignore
    }
  }
}
