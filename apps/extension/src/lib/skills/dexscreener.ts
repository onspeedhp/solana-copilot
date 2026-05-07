import type { SkillTool, Skill } from './types';

const DS_API_BASE = 'https://api.dexscreener.com/latest';

async function dsGet(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DEX Screener ${res.status}: ${await res.text()}`);
  return res.json();
}

type Pair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
};

const searchTokenTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'dexscreenerSearch',
    description:
      "Search DEX Screener for a token by symbol or pair address. Returns top Solana pairs with price, liquidity, 24h volume, market cap, age. Use when user asks 'price of X', 'what's the liquidity', 'is X legit'.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Token symbol (e.g. "JUP"), token mint address, or pair address.',
        },
      },
      required: ['query'],
    },
  },
  describe: (args) => `Search DEX Screener for "${String(args.query ?? '')}"`,
  async execute(args) {
    const q = encodeURIComponent(String(args.query ?? ''));
    const data = (await dsGet(`${DS_API_BASE}/dex/search?q=${q}`)) as {
      pairs?: Pair[];
    };
    const pairs = (data.pairs ?? [])
      .filter((p) => p.chainId === 'solana')
      .slice(0, 5)
      .map((p) => ({
        symbol: p.baseToken?.symbol ?? '?',
        name: p.baseToken?.name ?? '?',
        pair: `${p.baseToken?.symbol}/${p.quoteToken?.symbol ?? '?'}`,
        dex: p.dexId ?? '?',
        priceUsd: Number(p.priceUsd ?? 0),
        change24h: p.priceChange?.h24 ?? null,
        liquidityUsd: p.liquidity?.usd ?? null,
        volume24hUsd: p.volume?.h24 ?? null,
        fdv: p.fdv ?? null,
        marketCap: p.marketCap ?? null,
        ageDays: p.pairCreatedAt
          ? Math.floor((Date.now() - p.pairCreatedAt) / 86_400_000)
          : null,
        mint: p.baseToken?.address ?? null,
        pairAddress: p.pairAddress ?? null,
      }));
    return { pairs };
  },
  formatResult(result) {
    const pairs = (result as { pairs?: Array<Record<string, unknown>> })
      .pairs ?? [];
    if (pairs.length === 0) return 'No pairs found.';
    return pairs
      .slice(0, 3)
      .map((p) => {
        const price =
          typeof p.priceUsd === 'number' ? `$${p.priceUsd}` : '?';
        const change =
          typeof p.change24h === 'number'
            ? `${p.change24h > 0 ? '+' : ''}${p.change24h.toFixed(1)}%`
            : '?';
        const liq =
          typeof p.liquidityUsd === 'number'
            ? `$${(p.liquidityUsd / 1000).toFixed(1)}K`
            : '?';
        const vol =
          typeof p.volume24hUsd === 'number'
            ? `$${(p.volume24hUsd / 1000).toFixed(1)}K`
            : '?';
        const age =
          typeof p.ageDays === 'number' ? `${p.ageDays}d` : '?';
        return `${p.symbol} (${p.dex}): ${price} ${change} · liq ${liq} · vol24h ${vol} · age ${age}`;
      })
      .join('\n');
  },
};

// Site adapter — extract DEX Screener token chart page DOM.
// On a token page like dexscreener.com/solana/<pair>, the page shows price,
// stats, charts. We extract the structured data.
function extractDexScreenerDom(): unknown {
  // DEX Screener heavily uses TradingView iframe for chart — skip that.
  const root = document.querySelector('main') ?? document.body;
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'iframe, header, nav, aside, footer, [role="banner"], [aria-hidden="true"], script, style, svg',
    )
    .forEach((el) => el.remove());
  const cleanText = (clone.innerText ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  // Try to extract structured stats by pattern matching the cleaned text.
  // DS shows: "PRICE USD\n$0.00012", "LIQUIDITY\n$45.2K", "FDV\n$1.2M", etc.
  const statBlocks = cleanText.match(
    /(PRICE USD|LIQUIDITY|FDV|MKT CAP|MARKET CAP|VOLUME|24H|CHG|TXNS|HOLDERS|MAKERS)[\s\S]{0,40}?[\$\d.,KMB%+\-]+/gi,
  );

  return {
    title: document.title,
    url: location.href,
    text: cleanText.slice(0, 1500),
    stats: statBlocks?.slice(0, 20) ?? [],
    hint: 'DEX Screener site adapter. For authoritative data, use dexscreenerSearch tool with the token symbol.',
  };
}

export const skill: Skill = {
  id: 'dexscreener',
  name: 'DEX Screener',
  domains: ['dexscreener.com'],
  systemPromptHint: [
    'User is on DEX Screener, a token chart and liquidity tracker.',
    'For factual token data (price, liquidity, volume, age, market cap),',
    'use the dexscreenerSearch tool — it queries the API directly. The DOM',
    "extractor returns rough text and may have stale numbers. Solana chain only.",
  ].join('\n'),
  suggestions: [
    { icon: 'search', text: 'Search BONK on DEX Screener' },
    { icon: 'trending', text: 'Top SOL pairs by volume' },
    { icon: 'dollar', text: "What's JUP's liquidity?" },
  ],
  tools: [searchTokenTool],
  extractDom: extractDexScreenerDom,
};
