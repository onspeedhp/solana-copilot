import { INTEGRATIONS } from '../skills';
import type { IntegrationTool } from '../skills/types';

const integrationToolMap = new Map<string, IntegrationTool>();
for (const integ of INTEGRATIONS) {
  for (const tool of integ.tools) {
    integrationToolMap.set(tool.schema.name, tool);
  }
}

const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  So11111111111111111111111111111111111111112: { symbol: 'SOL', decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', decimals: 6 },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', decimals: 6 },
};

function shortAddr(s: string, n = 4): string {
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

// Summarize structured fields returned by site adapters so the action card
// shows useful info instead of "0 buttons". Detects common field names across
// adapters (coins, vaults, tweets, rates, stats, pageType, walletState, ...).
function summarizeSiteAdapter(dom: Record<string, unknown>): string[] {
  const parts: string[] = [];
  const arrLen = (key: string): number =>
    Array.isArray(dom[key]) ? (dom[key] as unknown[]).length : 0;

  const coins = arrLen('coins');
  if (coins > 0) parts.push(`${coins} coins`);
  const vaults = arrLen('vaults');
  if (vaults > 0) parts.push(`${vaults} vaults`);
  const tweets = arrLen('tweets');
  if (tweets > 0) parts.push(`${tweets} tweets`);
  const rates = arrLen('rates');
  if (rates > 0) parts.push(`${rates} rates`);
  const stats = arrLen('stats');
  if (stats > 0) parts.push(`${stats} stats`);
  const featured = arrLen('featuredCards');
  if (featured > 0) parts.push(`${featured} featured`);
  const formFields = arrLen('formFields');
  if (formFields > 0) parts.push(`${formFields} form fields`);
  const buttons = arrLen('buttons');
  if (buttons > 0) parts.push(`${buttons} buttons`);
  const pageType =
    typeof dom['pageType'] === 'string' ? (dom['pageType'] as string) : null;
  if (pageType && pageType !== 'unknown') parts.push(`page=${pageType}`);
  const wallet =
    typeof dom['walletState'] === 'string'
      ? (dom['walletState'] as string)
      : null;
  if (wallet) parts.push(`wallet=${wallet.slice(0, 20)}`);
  const tokenName =
    typeof dom['tokenName'] === 'string'
      ? (dom['tokenName'] as string)
      : null;
  if (tokenName) parts.push(`token=${tokenName.slice(0, 30)}`);
  return parts;
}

function fmtMint(mint: string): string {
  const known = KNOWN_MINTS[mint];
  return known ? known.symbol : shortAddr(mint);
}

function fmtNum(n: number, max = 4): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

function formatHttpResult(result: unknown): string {
  const r = result as {
    ok?: boolean;
    status?: number;
    error?: string;
    data?: unknown;
    text?: string;
    truncated?: boolean;
  };
  if (!r.ok) return `HTTP error: ${r.error ?? `${r.status ?? '?'}`}`;
  if (r.data !== undefined) {
    const json = JSON.stringify(r.data, null, 2);
    const preview = json.length > 600 ? `${json.slice(0, 600)}\n…` : json;
    return `${r.status ?? 200} OK\n\n${preview}${r.truncated ? '\n(truncated)' : ''}`;
  }
  const t = r.text ?? '';
  return `${r.status ?? 200} OK\n\n${t.slice(0, 400)}${r.truncated || t.length > 400 ? '\n(truncated)' : ''}`;
}

function fmtTimeAgo(ts: number | null): string {
  if (!ts) return 'unknown time';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type WalletFormatter = (
  result: unknown,
  args: Record<string, unknown>,
) => string;

const WALLET_FORMATTERS: Record<string, WalletFormatter> = {
  getBalance(result) {
    const sol = (result as { sol?: number }).sol ?? 0;
    return `${fmtNum(sol)} SOL`;
  },
  getTokenAccounts(result) {
    const accounts = (result as { accounts?: Array<{ mint: string; uiAmount: number }> })
      .accounts ?? [];
    if (accounts.length === 0) return 'No SPL token holdings.';
    const lines = accounts
      .sort((a, b) => b.uiAmount - a.uiAmount)
      .slice(0, 10)
      .map((a) => `• ${fmtNum(a.uiAmount)} ${fmtMint(a.mint)}`);
    if (accounts.length > 10) lines.push(`…and ${accounts.length - 10} more`);
    return lines.join('\n');
  },
  getRecentTransactions(result) {
    const txs = (result as { transactions?: Array<{ signature: string; blockTime: number | null; err: unknown }> })
      .transactions ?? [];
    if (txs.length === 0) return 'No recent transactions.';
    return txs
      .slice(0, 8)
      .map(
        (t) =>
          `${t.err ? '✗' : '✓'} ${shortAddr(t.signature, 6)} · ${fmtTimeAgo(t.blockTime)}`,
      )
      .join('\n');
  },
  sendSol(result, args) {
    const r = result as {
      simulated?: boolean;
      signature?: string;
      explorer?: string;
    };
    return [
      `Sent ${args.amount} SOL → ${shortAddr(String(args.to))}`,
      r.signature ? `Signature: ${shortAddr(r.signature, 6)}` : '',
      r.explorer ? `View: ${r.explorer}` : '',
      r.simulated ? '(simulated — set VITE_SOLANA_SECRET for real txn)' : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
  swapJupiter(result, args) {
    const r = result as {
      simulated?: boolean;
      signature?: string;
      explorer?: string;
    };
    return [
      `Swap ${args.amountIn} ${fmtMint(String(args.inputMint))} → ${fmtMint(String(args.outputMint))}`,
      r.signature ? `Signature: ${shortAddr(r.signature, 6)}` : '',
      r.explorer ? `View: ${r.explorer}` : '',
      r.simulated ? '(simulated — set VITE_SOLANA_SECRET for real txn)' : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
  getPageContext(result) {
    const r = result as {
      url?: string | null;
      domain?: string;
      integrationName?: string | null;
      domSource?: 'site-adapter' | 'generic';
      context?: Record<string, unknown> | null;
      dom?: Record<string, unknown> | null;
    };
    if (!r.url) return 'No active page detected.';
    const lines: string[] = [`Page: ${r.domain ?? '?'}`];
    const domTitle =
      r.dom && typeof r.dom['title'] === 'string'
        ? (r.dom['title'] as string)
        : null;
    if (domTitle) lines.push(`Title: ${domTitle}`);
    if (r.integrationName) lines.push(`Integration: ${r.integrationName}`);
    if (r.context && Object.keys(r.context).length > 0) {
      lines.push('Context:');
      for (const [k, v] of Object.entries(r.context)) {
        lines.push(`  ${k}: ${String(v)}`);
      }
    }
    if (r.dom) {
      // Site-adapter output: detect known structured fields and summarize
      if (r.domSource === 'site-adapter') {
        const summary = summarizeSiteAdapter(r.dom);
        if (summary.length > 0) {
          lines.push(`DOM (site-adapter): ${summary.join(' · ')}`);
        } else {
          lines.push('DOM (site-adapter): structured data');
        }
      } else {
        // Generic snapshot
        const dom = r.dom as {
          headings?: unknown[];
          inputs?: unknown[];
          buttons?: unknown[];
          links?: unknown[];
        };
        const h = Array.isArray(dom.headings) ? dom.headings.length : 0;
        const i = Array.isArray(dom.inputs) ? dom.inputs.length : 0;
        const b = Array.isArray(dom.buttons) ? dom.buttons.length : 0;
        const l = Array.isArray(dom.links) ? dom.links.length : 0;
        lines.push(
          `DOM: ${h} headings, ${i} inputs, ${b} buttons, ${l} links`,
        );
      }
    } else {
      lines.push('DOM: not readable (chrome:// or content script not loaded)');
    }
    return lines.join('\n');
  },
  httpGet(result) {
    return formatHttpResult(result);
  },
  httpPost(result) {
    return formatHttpResult(result);
  },
  scrollPage(result) {
    const r = result as {
      ok?: boolean;
      atBottom?: boolean;
      scrollY?: number;
      newContent?: string;
      totalTextLen?: number;
      error?: string;
    };
    if (!r.ok) return `Scroll failed: ${r.error ?? 'unknown'}`;
    const lines: string[] = [
      `Scrolled · pos ${r.scrollY ?? 0}px${r.atBottom ? ' (at bottom)' : ''}`,
    ];
    if (r.newContent && r.newContent.length > 0) {
      const preview =
        r.newContent.length > 240
          ? `${r.newContent.slice(0, 240)}…`
          : r.newContent;
      lines.push(`+${r.newContent.length} chars new content: ${preview}`);
    } else {
      lines.push('No new content (already seen).');
    }
    return lines.join('\n');
  },
  pageAction(result, args) {
    const r = result as { ok?: boolean; action?: string; error?: string };
    if (!r.ok) return `Failed: ${r.error ?? 'unknown error'}`;
    const label = String(args.label ?? args.selector ?? 'element');
    if (r.action === 'clicked') return `✓ Clicked "${label}"`;
    if (r.action === 'filled') return `✓ Filled "${label}" with "${args.value ?? ''}"`;
    if (r.action === 'submitted') return `✓ Submitted ${label}`;
    if (r.action === 'selected') return `✓ Selected "${args.value ?? ''}" in ${label}`;
    return `✓ Done`;
  },
  signAndSendTx(result, args) {
    const r = result as {
      simulated?: boolean;
      signature?: string;
      explorer?: string;
    };
    return [
      args.intent ? `Tx: ${args.intent}` : 'Transaction submitted',
      r.signature ? `Signature: ${shortAddr(r.signature, 6)}` : '',
      r.explorer ? `View: ${r.explorer}` : '',
      r.simulated ? '(simulated — set VITE_SOLANA_SECRET for real signing)' : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
  getDefiYields(result, args) {
    const r = result as {
      pools?: Array<{
        project: string;
        symbol: string;
        apy: number;
        tvlUsd: number;
        stablecoin: boolean;
      }>;
      totalMatched?: number;
      filterAsset?: string | null;
      stablecoinOnly?: boolean;
    };
    const pools = r.pools ?? [];
    if (pools.length === 0) {
      const a = args.asset ? ` for ${String(args.asset).toUpperCase()}` : '';
      return `No matching DeFi pools found on Solana${a}.`;
    }
    const header = `Top Solana yields${
      r.filterAsset ? ` for ${r.filterAsset}` : ''
    }${r.stablecoinOnly ? ' (stables only)' : ''}:`;
    const lines = pools.slice(0, 8).map((p) => {
      const proj = p.project.padEnd(14).slice(0, 14);
      const sym = p.symbol.padEnd(14).slice(0, 14);
      const apy = `${p.apy.toFixed(2)}%`.padStart(8);
      const tvl =
        p.tvlUsd > 1_000_000
          ? `$${(p.tvlUsd / 1_000_000).toFixed(1)}M`
          : `$${(p.tvlUsd / 1000).toFixed(0)}k`;
      return `${proj} ${sym}${apy}  ${tvl}`;
    });
    return [header, ...lines].join('\n');
  },
  extractTweets(result) {
    const r = result as {
      ok?: boolean;
      tweets?: Array<{
        author?: string;
        handle?: string;
        text?: string;
        time?: string;
        link?: string;
        pinned?: boolean;
        isRetweet?: boolean;
        metrics?: {
          replies?: number | null;
          reposts?: number | null;
          likes?: number | null;
          views?: number | null;
        };
      }>;
      error?: string;
    };
    if (!r.ok) return r.error ?? 'Could not extract tweets.';
    const tweets = r.tweets ?? [];
    if (tweets.length === 0) {
      return 'No tweets found on this page (scroll then try again).';
    }
    const fmtNum = (n: number | null | undefined): string => {
      if (typeof n !== 'number') return '—';
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return String(n);
    };
    const lines = tweets.slice(0, 8).map((t) => {
      const text = (t.text ?? '').slice(0, 140);
      const m = t.metrics ?? {};
      const meta = [
        `${fmtNum(m.likes)}♥`,
        `${fmtNum(m.replies)}💬`,
        `${fmtNum(m.reposts)}🔁`,
        `${fmtNum(m.views)}👁`,
      ].join('  ');
      const tag =
        t.pinned ? ' · pinned' : t.isRetweet ? ' · retweet' : '';
      return `${t.handle ?? '?'}${tag}\n${text}\n${meta}`;
    });
    const more =
      tweets.length > 8 ? `\n…and ${tweets.length - 8} more` : '';
    return lines.join('\n\n') + more;
  },
  xExtractCurrentTweet(result) {
    const r = result as {
      ok?: boolean;
      tweet?: {
        author?: string;
        handle?: string;
        text?: string;
        metrics?: {
          replies?: number | null;
          reposts?: number | null;
          likes?: number | null;
          views?: number | null;
        };
      };
      error?: string;
    };
    if (!r.ok || !r.tweet) return r.error ?? 'No tweet found.';
    const t = r.tweet;
    const m = t.metrics ?? {};
    const fmt = (n: number | null | undefined): string =>
      typeof n === 'number' ? n.toLocaleString() : '—';
    return [
      `${t.author ?? '?'} ${t.handle ?? ''}`,
      t.text ?? '',
      `${fmt(m.likes)} likes · ${fmt(m.replies)} replies · ${fmt(m.reposts)} reposts · ${fmt(m.views)} views`,
    ].join('\n');
  },
  xPostTweet(result, args) {
    const r = result as { ok?: boolean; step?: string; error?: string };
    const text = String(args.text ?? '');
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    if (r.ok) return `Posted: "${preview}"`;
    return `Could not post (${r.step ?? '?'}): ${r.error ?? 'unknown error'}`;
  },
  xReplyTweet(result, args) {
    const r = result as { ok?: boolean; step?: string; error?: string };
    const text = String(args.text ?? '');
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    if (r.ok) return `Replied: "${preview}"`;
    return `Could not reply (${r.step ?? '?'}): ${r.error ?? 'unknown error'}`;
  },
  xLikeTweet(result) {
    const r = result as { ok?: boolean; error?: string };
    if (r.ok) return r.error === 'already liked' ? 'Already liked.' : 'Liked ❤';
    return `Could not like: ${r.error ?? '?'}`;
  },
  xRetweetTweet(result) {
    const r = result as { ok?: boolean; error?: string };
    if (r.ok)
      return r.error === 'already retweeted' ? 'Already reposted.' : 'Reposted 🔁';
    return `Could not repost: ${r.error ?? '?'}`;
  },
  navigateTab(result) {
    const r = result as { ok?: boolean; url?: string; error?: string };
    if (!r.ok) return `Navigation failed: ${r.error ?? '?'}`;
    try {
      const u = new URL(r.url ?? '');
      return `Navigated to ${u.pathname || '/'}`;
    } catch {
      return `Navigated to ${r.url ?? '?'}`;
    }
  },
  jupiterSwapBySymbol(result, args) {
    const r = result as {
      simulated?: boolean;
      signature?: string;
      explorer?: string;
      inputSymbol?: string;
      outputSymbol?: string;
      amountIn?: number;
      amountOut?: number;
      priceImpactPct?: number;
      route?: string;
    };
    const inSym =
      r.inputSymbol ?? String(args.inputSymbol ?? 'SOL').toUpperCase();
    const outSym =
      r.outputSymbol ?? String(args.outputSymbol ?? '?').toUpperCase();
    const amountOut =
      typeof r.amountOut === 'number'
        ? r.amountOut.toLocaleString(undefined, { maximumFractionDigits: 4 })
        : '?';
    const lines = [
      `Swap ${args.amountIn ?? r.amountIn} ${inSym} → ${amountOut} ${outSym}`,
    ];
    if (r.route) lines.push(`Route: ${r.route}`);
    if (typeof r.priceImpactPct === 'number')
      lines.push(`Impact: ${r.priceImpactPct.toFixed(3)}%`);
    if (r.signature) lines.push(`Sig: ${shortAddr(r.signature, 6)}`);
    if (r.simulated) lines.push('(simulated)');
    return lines.join('\n');
  },
};

export function formatToolResult(
  tool: string,
  result: unknown,
  args: Record<string, unknown>,
): string | null {
  const wallet = WALLET_FORMATTERS[tool];
  if (wallet) return wallet(result, args);
  const integ = integrationToolMap.get(tool);
  if (integ?.formatResult) return integ.formatResult(result, args);
  return null;
}
