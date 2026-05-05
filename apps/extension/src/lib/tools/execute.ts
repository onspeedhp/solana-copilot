import { getDefiYields, type GetYieldsArgs } from '../defillama';
import {
  extractTweetsFromActiveTab,
  performPageAction,
  readActiveTabDom,
  runCustomExtractor,
  scrollActiveTab,
  scrollAllAndCollect,
  xExtractCurrentTweet,
  xLikeTweet,
  xPostTweet,
  xReplyTweet,
  xRetweetTweet,
} from '../dom-bridge';
import { jupiterQuoteBySymbol } from '../skills/jupiter';
import { executeHttpGet, executeHttpPost } from '../http-tool';
import { getIntegrationForUrl } from '../skills';
import { loadKeypair } from '../solana/keypair';
import {
  getRecentSignatures,
  getSolBalance,
  getTokenAccounts,
} from '../solana/rpc';
import {
  jupiterSwapTxn,
  sendSolTxn,
  signAndSendVersionedTx,
} from '../solana/sign';
import type { ToolKind } from '../../types';

export type ToolExecCtx = {
  pubkey: string;
  currentUrl?: string | undefined;
};

export async function executeReadTool(
  kind: ToolKind,
  args: Record<string, unknown>,
  ctx: ToolExecCtx,
): Promise<unknown> {
  switch (kind) {
    case 'getBalance': {
      const sol = await getSolBalance(ctx.pubkey);
      return { sol };
    }
    case 'getTokenAccounts': {
      const accounts = await getTokenAccounts(ctx.pubkey);
      return { accounts };
    }
    case 'getRecentTransactions': {
      const limit = Math.min(
        Math.max(typeof args.limit === 'number' ? args.limit : 10, 1),
        25,
      );
      const sigs = await getRecentSignatures(ctx.pubkey, limit);
      return { transactions: sigs };
    }
    case 'getPageContext': {
      if (!ctx.currentUrl) {
        return { url: null, context: null, integration: null };
      }
      let parsed: URL;
      try {
        parsed = new URL(ctx.currentUrl);
      } catch {
        return { url: ctx.currentUrl, error: 'invalid URL' };
      }
      const integration = getIntegrationForUrl(ctx.currentUrl);
      const context = integration?.extractContext?.(parsed) ?? null;
      // Prefer site-specific extractor when available — clean structured data
      // instead of the generic snapshot. Fallback to generic on any failure.
      let dom: unknown = null;
      let domSource: 'site-adapter' | 'generic' = 'generic';
      if (integration?.extractDom) {
        const sitedata = await runCustomExtractor(integration.extractDom).catch(
          () => null,
        );
        if (sitedata !== null && sitedata !== undefined) {
          dom = sitedata;
          domSource = 'site-adapter';
        }
      }
      if (dom === null) {
        dom = await readActiveTabDom().catch(() => null);
      }
      return {
        url: ctx.currentUrl,
        domain: parsed.hostname,
        path: parsed.pathname,
        integration: integration?.id ?? null,
        integrationName: integration?.name ?? null,
        domSource,
        context,
        dom,
      };
    }
    case 'getDefiYields': {
      const yieldArgs: GetYieldsArgs = {
        asset:
          typeof args.asset === 'string' ? args.asset : undefined,
        minTvl:
          typeof args.minTvl === 'number' ? args.minTvl : undefined,
        stablecoinOnly:
          typeof args.stablecoinOnly === 'boolean'
            ? args.stablecoinOnly
            : undefined,
      };
      return getDefiYields(yieldArgs);
    }
    case 'httpGet': {
      const url = String(args.url ?? '');
      return executeHttpGet(url, ctx.currentUrl);
    }
    case 'httpPost': {
      const url = String(args.url ?? '');
      const body = args.body ?? {};
      return executeHttpPost(url, body, ctx.currentUrl);
    }
    case 'scrollPage': {
      const direction = String(args.direction ?? 'down');
      const pixels =
        typeof args.pixels === 'number' ? args.pixels : null;
      if (direction === 'all') {
        return scrollAllAndCollect();
      }
      return scrollActiveTab(direction, pixels);
    }
    case 'extractTweets': {
      return extractTweetsFromActiveTab();
    }
    case 'xExtractCurrentTweet': {
      return xExtractCurrentTweet();
    }
    case 'navigateTab': {
      const url = String(args.url ?? '').trim();
      if (!url) throw new Error('Missing url');
      let target: URL;
      try {
        target = new URL(url, ctx.currentUrl);
      } catch {
        throw new Error('Invalid url');
      }
      // Same-host check — refuse cross-domain navigation as a safety guard
      if (ctx.currentUrl) {
        try {
          const current = new URL(ctx.currentUrl);
          if (target.host !== current.host) {
            throw new Error(
              `Cross-domain navigation refused (current: ${current.host}, target: ${target.host}). Tell user to navigate manually.`,
            );
          }
        } catch (e) {
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tabId = tabs[0]?.id;
      if (!tabId) throw new Error('No active tab');
      await chrome.tabs.update(tabId, { url: target.href });

      // Wait for the navigation to complete so the next tool call sees the
      // new DOM. Listen for tabs.onUpdated until status === 'complete'.
      // SPA pushState routes won't fire 'complete' (no real navigation), so
      // also fall back to a fixed delay for that case.
      const SOFT_DELAY_MS = 1500; // give SPA hydration time to render
      const HARD_TIMEOUT_MS = 8000;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(softTimer);
          clearTimeout(hardTimer);
          resolve();
        };
        const listener = (
          updatedTabId: number,
          info: chrome.tabs.TabChangeInfo,
        ) => {
          if (updatedTabId !== tabId) return;
          if (info.status === 'complete') {
            // Real navigation completed — give SPA an extra beat to hydrate
            setTimeout(finish, 600);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // SPA-only fallback: most pushState navigations finish hydrating
        // within ~1.5s
        const softTimer = setTimeout(finish, SOFT_DELAY_MS);
        // Hard ceiling: never block more than 8s
        const hardTimer = setTimeout(finish, HARD_TIMEOUT_MS);
      });

      return { ok: true, url: target.href, waited: true };
    }
    default:
      throw new Error(`Tool ${kind} is not a read tool`);
  }
}

function enrichRpcError(err: unknown): Error {
  const msg = String(err);
  const lower = msg.toLowerCase();
  if (msg.includes('403') || lower.includes('forbidden')) {
    return new Error(
      `${msg}\n\n→ Public mainnet RPC is rate-limited. Open Settings → Cluster → Custom, paste a Helius/Triton URL (or any private RPC) for both read and write.`,
    );
  }
  if (lower.includes('blockhash') || lower.includes('expired')) {
    return new Error(
      `${msg}\n\n→ Transaction expired during confirmation. Try again — the RPC may be slow.`,
    );
  }
  if (lower.includes('insufficient')) {
    return new Error(
      `${msg}\n\n→ Wallet doesn't have enough SOL for the amount + fees. Top up the wallet.`,
    );
  }
  if (err instanceof Error) return err;
  return new Error(msg);
}

export async function executeWriteTool(
  kind: ToolKind,
  args: Record<string, unknown>,
): Promise<unknown> {
  // pageAction doesn't need a Solana keypair — it just interacts with DOM.
  if (kind === 'pageAction') {
    const action = String(args.action ?? '');
    const selector = String(args.selector ?? '');
    const value = typeof args.value === 'string' ? args.value : '';
    const label = String(args.label ?? '');
    return performPageAction(action, selector, value, label);
  }
  // X macros — DOM-only, no Solana keypair needed
  if (kind === 'xPostTweet') {
    const text = String(args.text ?? '').trim();
    if (!text) throw new Error('Missing tweet text');
    if (text.length > 280) {
      throw new Error(`Tweet too long (${text.length} chars, max 280)`);
    }
    return xPostTweet(text);
  }
  if (kind === 'xLikeTweet') {
    return xLikeTweet();
  }
  if (kind === 'xReplyTweet') {
    const text = String(args.text ?? '').trim();
    if (!text) throw new Error('Missing reply text');
    if (text.length > 280)
      throw new Error(`Reply too long (${text.length}/280)`);
    return xReplyTweet(text);
  }
  if (kind === 'xRetweetTweet') {
    return xRetweetTweet();
  }
  const keypair = await loadKeypair();
  if (!keypair) {
    return executeWriteToolMock(kind, args);
  }
  try {
    return await runWriteTool(kind, args, keypair);
  } catch (err) {
    throw enrichRpcError(err);
  }
}

async function runWriteTool(
  kind: ToolKind,
  args: Record<string, unknown>,
  keypair: NonNullable<Awaited<ReturnType<typeof loadKeypair>>>,
): Promise<unknown> {
  switch (kind) {
    case 'sendSol': {
      const result = await sendSolTxn(
        {
          to: String(args.to),
          amount: Number(args.amount),
        },
        keypair,
      );
      return { ...result, simulated: false };
    }
    case 'swapJupiter': {
      const result = await jupiterSwapTxn(
        {
          inputMint:
            typeof args.inputMint === 'string' ? args.inputMint : undefined,
          outputMint: String(args.outputMint),
          amountIn: Number(args.amountIn),
          slippageBps:
            typeof args.slippageBps === 'number'
              ? args.slippageBps
              : undefined,
        },
        keypair,
      );
      return { ...result, simulated: false };
    }
    case 'jupiterSwapBySymbol': {
      // Resolve symbols → mints, fetch a final quote (so the result card
      // reflects the executed swap), then sign + send.
      const inputSymbol =
        typeof args.inputSymbol === 'string' ? args.inputSymbol : 'SOL';
      const outputSymbol = String(args.outputSymbol ?? '').trim();
      if (!outputSymbol) throw new Error('Missing outputSymbol');
      const amountIn = Number(args.amountIn ?? 0);
      if (!Number.isFinite(amountIn) || amountIn <= 0)
        throw new Error('Invalid amountIn');
      const slippageBps =
        typeof args.slippageBps === 'number' ? args.slippageBps : 50;
      const quote = await jupiterQuoteBySymbol({
        inputSymbol,
        outputSymbol,
        amountIn,
        slippageBps,
      });
      const result = await jupiterSwapTxn(
        {
          inputMint: quote.inputMint,
          outputMint: quote.outputMint,
          amountIn,
          slippageBps,
        },
        keypair,
      );
      return {
        ...result,
        inputSymbol: quote.inputSymbol,
        outputSymbol: quote.outputSymbol,
        amountIn,
        amountOut: quote.amountOut,
        priceImpactPct: quote.priceImpactPct,
        route: quote.route,
        simulated: false,
      };
    }
    case 'signAndSendTx': {
      const base64Tx = String(args.base64Tx ?? '');
      if (!base64Tx) throw new Error('Missing base64Tx');
      const result = await signAndSendVersionedTx(base64Tx, keypair);
      return { ...result, simulated: false };
    }
    default:
      throw new Error(`Tool ${kind} is not a write tool`);
  }
}

export async function executeWriteToolMock(
  kind: ToolKind,
  args: Record<string, unknown>,
): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 800));
  switch (kind) {
    case 'sendSol':
      return {
        simulated: true,
        signature: `SIM-${Date.now().toString(36)}`,
        amount: args.amount,
        to: args.to,
        note: 'Mock execution — set VITE_SOLANA_SECRET in .env.local for real signing',
      };
    case 'jupiterSwapBySymbol':
      return {
        simulated: true,
        signature: `SIM-${Date.now().toString(36)}`,
        inputSymbol: args.inputSymbol ?? 'SOL',
        outputSymbol: args.outputSymbol,
        amountIn: args.amountIn,
        note: 'Mock — no wallet secret stored',
      };
    case 'swapJupiter':
      return {
        simulated: true,
        signature: `SIM-${Date.now().toString(36)}`,
        inputMint: args.inputMint,
        outputMint: args.outputMint,
        amountIn: args.amountIn,
        note: 'Mock execution — set VITE_SOLANA_SECRET in .env.local for real signing',
      };
    case 'signAndSendTx':
      return {
        simulated: true,
        signature: `SIM-${Date.now().toString(36)}`,
        intent: args.intent,
        note: 'Mock execution — set VITE_SOLANA_SECRET in .env.local for real signing',
      };
    default:
      throw new Error(`Tool ${kind} is not a write tool`);
  }
}
