import type { SkillTool, Skill } from './types';

const JUP_QUOTE_BASE = 'https://lite-api.jup.ag/swap/v1';
const JUP_PRICE_BASE = 'https://lite-api.jup.ag/price/v3';
const JUP_TOKENS_BASE = 'https://lite-api.jup.ag/tokens/v2';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function jget(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jupiter ${res.status}: ${await res.text()}`);
  return res.json();
}

const getQuoteTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'jupiterGetQuote',
    description:
      "Get a swap route quote from Jupiter aggregator. Use when user asks for swap price, route, or 'best way to swap X to Y'. ALWAYS call this when user says things like 'best route SOL → USDC' even if no amount is given — use a reference amount of 1 input unit. Returns expected output amount, price impact, route.",
    input_schema: {
      type: 'object',
      properties: {
        inputMint: {
          type: 'string',
          description: `Input token mint. Defaults to SOL (${SOL_MINT}). Common: USDC=${USDC_MINT}.`,
        },
        outputMint: {
          type: 'string',
          description: 'Output token mint address.',
        },
        amountIn: {
          type: 'number',
          description:
            'Amount of input token in UI units (e.g. 1.5 for 1.5 SOL). If user did not specify, USE 1 as reference.',
        },
        slippageBps: {
          type: 'number',
          description: 'Slippage tolerance in basis points (50 = 0.5%). Default 50.',
        },
      },
      required: ['outputMint'],
    },
  },
  describe: (args) =>
    `Quote: ${args.amountIn} ${shortMint(String(args.inputMint ?? SOL_MINT))} → ${shortMint(String(args.outputMint))}`,
  formatResult: (result) => {
    const r = result as {
      amountIn: number;
      amountOut: number;
      inputMint: string;
      outputMint: string;
      route: string;
      priceImpactPct: number;
      slippageBps: number;
    };
    const amountOut = r.amountOut.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
    return [
      `${r.amountIn} ${shortMint(r.inputMint)} → ${amountOut} ${shortMint(r.outputMint)}`,
      `Route: ${r.route}`,
      `Price impact: ${r.priceImpactPct.toFixed(3)}% · slippage: ${(r.slippageBps / 100).toFixed(2)}%`,
    ].join('\n');
  },
  async execute(args) {
    const inputMint = String(args.inputMint ?? SOL_MINT);
    const outputMint = String(args.outputMint);
    const amount = Number(args.amountIn ?? 1);
    const slippage = Number(args.slippageBps ?? 50);
    const decimals = inputMint === SOL_MINT ? 9 : 6;
    const rawAmount = Math.floor(amount * 10 ** decimals);
    const url = `${JUP_QUOTE_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippage}`;
    const data = (await jget(url)) as {
      outAmount?: string;
      priceImpactPct?: string;
      routePlan?: Array<{ swapInfo?: { label?: string } }>;
    };
    const outDecimals = outputMint === SOL_MINT ? 9 : 6;
    const outUi =
      Number(data.outAmount ?? 0) / 10 ** outDecimals;
    const route = (data.routePlan ?? [])
      .map((p) => p.swapInfo?.label)
      .filter(Boolean)
      .join(' → ');
    return {
      inputMint,
      outputMint,
      amountIn: amount,
      amountOut: outUi,
      priceImpactPct: Number(data.priceImpactPct ?? 0) * 100,
      route: route || 'direct',
      slippageBps: slippage,
    };
  },
};

const getPriceTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'jupiterGetPrice',
    description:
      'Get current USD price for one or more SPL tokens via Jupiter price API. Use when user asks "what is X price" or "how much is X worth".',
    input_schema: {
      type: 'object',
      properties: {
        mints: {
          type: 'array',
          description: 'Array of SPL token mint addresses (max 5).',
        },
      },
      required: ['mints'],
    },
  },
  describe: (args) => `Price: ${(args.mints as string[])?.length ?? 0} tokens`,
  async execute(args) {
    const mints = Array.isArray(args.mints)
      ? (args.mints as string[]).slice(0, 5)
      : [];
    if (mints.length === 0) return { prices: {} };
    const url = `${JUP_PRICE_BASE}?ids=${mints.join(',')}`;
    return jget(url);
  },
  formatResult: (result) => {
    const data = result as Record<string, { usdPrice?: number } | undefined>;
    const lines: string[] = [];
    for (const [mint, info] of Object.entries(data)) {
      if (info && typeof info.usdPrice === 'number') {
        lines.push(`${shortMint(mint)}: $${info.usdPrice.toFixed(4)}`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : 'No price data.';
  },
};

const searchTokenTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'jupiterSearchToken',
    description:
      "Search for a token by symbol or name (e.g. 'JUP', 'BONK'). Returns mint address, decimals, name. Use when user mentions a token by name and you need its mint.",
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol or partial name (e.g. "JUP", "bonk").',
        },
      },
      required: ['symbol'],
    },
  },
  describe: (args) => `Search token: ${String(args.symbol ?? '?')}`,
  async execute(args) {
    const query = String(args.symbol ?? '').trim();
    if (!query) return { matches: [] };
    const url = `${JUP_TOKENS_BASE}/search?query=${encodeURIComponent(query)}`;
    const list = (await jget(url)) as Array<{
      id: string;
      symbol: string;
      name: string;
      decimals: number;
    }>;
    return { matches: list.slice(0, 5) };
  },
  formatResult: (result) => {
    const matches = (result as { matches?: Array<{ symbol: string; name: string; id: string }> }).matches ?? [];
    if (matches.length === 0) return 'No matching tokens found.';
    return matches
      .map((m) => `• ${m.symbol} (${m.name}) — ${m.id.slice(0, 8)}…`)
      .join('\n');
  },
};

const KNOWN_SYMBOLS: Record<string, string> = {
  SOL: SOL_MINT,
  WSOL: SOL_MINT,
  USDC: USDC_MINT,
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
};

export async function resolveSymbolToMint(
  symbol: string,
): Promise<{ mint: string; decimals: number; name: string } | null> {
  const upper = symbol.trim().toUpperCase();
  const known = KNOWN_SYMBOLS[upper];
  if (known) {
    return {
      mint: known,
      decimals: known === SOL_MINT ? 9 : 6,
      name: upper,
    };
  }
  try {
    const url = `${JUP_TOKENS_BASE}/search?query=${encodeURIComponent(upper)}`;
    const list = (await jget(url)) as Array<{
      id: string;
      symbol: string;
      name: string;
      decimals: number;
    }>;
    // Prefer exact symbol match
    const exact = list.find(
      (t) => t.symbol.toUpperCase() === upper,
    );
    const pick = exact ?? list[0];
    if (!pick) return null;
    return { mint: pick.id, decimals: pick.decimals ?? 6, name: pick.name };
  } catch {
    return null;
  }
}

export async function jupiterQuoteBySymbol(args: {
  inputSymbol?: string;
  outputSymbol: string;
  amountIn: number;
  slippageBps?: number;
}): Promise<{
  inputMint: string;
  outputMint: string;
  amountIn: number;
  amountOut: number;
  priceImpactPct: number;
  route: string;
  slippageBps: number;
  inputDecimals: number;
  outputDecimals: number;
  inputSymbol: string;
  outputSymbol: string;
}> {
  const inputSym = args.inputSymbol ?? 'SOL';
  const inputTok = await resolveSymbolToMint(inputSym);
  if (!inputTok) throw new Error(`Unknown input token: ${inputSym}`);
  const outputTok = await resolveSymbolToMint(args.outputSymbol);
  if (!outputTok)
    throw new Error(`Unknown output token: ${args.outputSymbol}`);
  const slippage = args.slippageBps ?? 50;
  const rawAmount = Math.floor(args.amountIn * 10 ** inputTok.decimals);
  const url = `${JUP_QUOTE_BASE}/quote?inputMint=${inputTok.mint}&outputMint=${outputTok.mint}&amount=${rawAmount}&slippageBps=${slippage}`;
  const data = (await jget(url)) as {
    outAmount?: string;
    priceImpactPct?: string;
    routePlan?: Array<{ swapInfo?: { label?: string } }>;
  };
  const outUi = Number(data.outAmount ?? 0) / 10 ** outputTok.decimals;
  const route = (data.routePlan ?? [])
    .map((p) => p.swapInfo?.label)
    .filter(Boolean)
    .join(' → ');
  return {
    inputMint: inputTok.mint,
    outputMint: outputTok.mint,
    amountIn: args.amountIn,
    amountOut: outUi,
    priceImpactPct: Number(data.priceImpactPct ?? 0) * 100,
    route: route || 'direct',
    slippageBps: slippage,
    inputDecimals: inputTok.decimals,
    outputDecimals: outputTok.decimals,
    inputSymbol: inputSym.toUpperCase(),
    outputSymbol: args.outputSymbol.toUpperCase(),
  };
}

function shortMint(mint: string): string {
  if (mint === SOL_MINT) return 'SOL';
  if (mint === USDC_MINT) return 'USDC';
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

// Site adapter — extract Jupiter swap UI state. Reads token symbols, amounts,
// and price impact from the swap card directly. Self-contained for executeScript.
function extractJupiterDom(): unknown {
  const safeText = (el: Element | null, max = 80): string => {
    if (!el) return '';
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  };
  // Jupiter's swap UI uses `<input>` for amounts. Token chips have button with text.
  const inputs = Array.from(document.querySelectorAll('input[inputmode="decimal"], input[type="text"]'))
    .filter((el) => {
      const v = (el as HTMLInputElement).value;
      return v && /[\d.]/.test(v);
    })
    .map((el) => (el as HTMLInputElement).value);

  // Find token selector buttons — they typically contain just symbol text
  const tokenButtons = Array.from(
    document.querySelectorAll('button'),
  )
    .map((b) => safeText(b, 20))
    .filter((t) => /^[A-Z]{2,8}$/.test(t.replace(/\s/g, '')));

  // Look for "Price Impact", "Route", "Slippage" labels and their adjacent values
  const root = document.querySelector('main') ?? document.body;
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'header, nav, aside, footer, [role="banner"], [aria-hidden="true"], script, style, svg',
    )
    .forEach((el) => el.remove());
  const cleanText = (clone.innerText ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 2000);

  return {
    title: document.title,
    url: location.href,
    text: cleanText,
    amounts: inputs,
    tokenSymbols: Array.from(new Set(tokenButtons)).slice(0, 8),
    hint: 'Jupiter site adapter. For real quote data, use jupiterGetQuote tool — DOM amounts may be stale or user-typed-in-progress.',
  };
}

export const skill: Skill = {
  id: 'jupiter',
  name: 'Jupiter',
  domains: ['jup.ag', 'jupiter.ag'],
  systemPromptHint: [
    'User is on Jupiter, the leading Solana DEX aggregator.',
    'You can quote swaps, look up token prices, search for tokens by symbol.',
    `Common mints: SOL=${SOL_MINT}, USDC=${USDC_MINT}.`,
    'When user says "swap X to Y", first search for Y mint if needed, then quote.',
    'When user says "this", "current pair", or "what I have selected", call getPageContext to read the pair from the URL.',
  ].join('\n'),
  extractDom: extractJupiterDom,
  suggestions: [
    { icon: 'search', text: 'Quote 1 SOL to USDC' },
    { icon: 'dollar', text: "What's JUP price?" },
    { icon: 'trending', text: 'Quote 0.1 SOL to BONK' },
  ],
  getSuggestionsForUrl: (url) => {
    const path = url.pathname;
    // /swap/<IN>-<OUT> or /swap?inputMint=&outputMint=
    const pairMatch = path.match(/\/swap\/([A-Za-z0-9]+)-([A-Za-z0-9]+)/);
    if (pairMatch) {
      const inSym = pairMatch[1]?.toUpperCase() ?? 'SOL';
      const outSym = pairMatch[2]?.toUpperCase() ?? 'USDC';
      return [
        { icon: 'send', text: `Swap 0.1 ${inSym} → ${outSym}` },
        { icon: 'search', text: `Quote 1 ${inSym} → ${outSym}` },
        { icon: 'dollar', text: `Price of ${outSym}` },
      ];
    }
    if (path.startsWith('/perps')) {
      return [
        { icon: 'trending', text: 'Show open positions' },
        { icon: 'bar-chart', text: 'Best long opportunities' },
      ];
    }
    return null; // fall back to default
  },
  tools: [getQuoteTool, getPriceTool, searchTokenTool],
  extractContext: (url) => {
    // /swap/SOL-USDC or /swap?inputMint=...&outputMint=...
    const pathMatch = url.pathname.match(/\/swap\/([A-Za-z0-9]+)-([A-Za-z0-9]+)/);
    if (pathMatch && pathMatch[1] && pathMatch[2]) {
      return {
        inputSymbol: pathMatch[1].toUpperCase(),
        outputSymbol: pathMatch[2].toUpperCase(),
        source: 'url-path',
      };
    }
    const inputMint = url.searchParams.get('inputMint');
    const outputMint = url.searchParams.get('outputMint');
    if (inputMint || outputMint) {
      return {
        ...(inputMint ? { inputMint } : {}),
        ...(outputMint ? { outputMint } : {}),
        source: 'url-query',
      };
    }
    return null;
  },
};
