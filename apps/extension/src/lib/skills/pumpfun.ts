import type { SkillTool, Skill } from './types';

const PUMP_API = 'https://frontend-api-v3.pump.fun';

async function pumpGet(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Pump.fun ${res.status}: ${await res.text()}`);
  return res.json();
}

type PumpCoin = {
  mint?: string;
  name?: string;
  symbol?: string;
  description?: string;
  image_uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  market_cap?: number;
  usd_market_cap?: number;
  reply_count?: number;
  king_of_the_hill_timestamp?: number | null;
  created_timestamp?: number;
  complete?: boolean;
  bonding_curve?: string;
  associated_bonding_curve?: string;
  total_supply?: number;
  show_name?: boolean;
};

function shapeCoin(c: PumpCoin) {
  return {
    mint: c.mint,
    name: c.name,
    symbol: c.symbol,
    description: c.description?.slice(0, 200) ?? null,
    marketCapUsd: c.usd_market_cap ?? null,
    replyCount: c.reply_count ?? null,
    bondingComplete: c.complete ?? null,
    ageHours: c.created_timestamp
      ? Math.floor((Date.now() - c.created_timestamp) / 3_600_000)
      : null,
    twitter: c.twitter ?? null,
    website: c.website ?? null,
    telegram: c.telegram ?? null,
  };
}

const getKingOfTheHillTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'pumpfunGetKingOfTheHill',
    description:
      "Get Pump.fun's current 'King of the Hill' — the highest-momentum memecoin that hasn't graduated yet. Use when user asks about the top/trending coin on pump.fun.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  describe: () => 'Pump.fun King of the Hill',
  async execute() {
    const data = (await pumpGet(
      `${PUMP_API}/coins/king-of-the-hill?includeNsfw=false`,
    )) as PumpCoin;
    return { coin: shapeCoin(data) };
  },
};

const getTrendingTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'pumpfunGetTrending',
    description:
      "Get top Pump.fun coins by recent trade activity. Returns top N coins with market cap, reply count, age. Use when user asks 'what's trending', 'top coins right now', or 'show me popular memecoins'.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many coins to return. Default 10, max 30.',
        },
      },
      required: [],
    },
  },
  describe: (args) => `Pump.fun trending top ${args.limit ?? 10}`,
  async execute(args) {
    const limit = Math.min(
      Math.max(typeof args.limit === 'number' ? args.limit : 10, 1),
      30,
    );
    const data = (await pumpGet(
      `${PUMP_API}/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`,
    )) as PumpCoin[];
    return { coins: data.map(shapeCoin) };
  },
};

const getCoinTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'pumpfunGetCoin',
    description:
      'Look up a specific Pump.fun coin by mint address. Returns full metadata including market cap, replies, bonding curve status, socials.',
    input_schema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Coin mint address (44-char base58).',
        },
      },
      required: ['mint'],
    },
  },
  describe: (args) =>
    `Pump.fun coin ${String(args.mint ?? '').slice(0, 8)}…`,
  async execute(args) {
    const mint = String(args.mint ?? '').trim();
    if (!mint) throw new Error('Missing mint');
    const data = (await pumpGet(`${PUMP_API}/coins/${mint}`)) as PumpCoin;
    return { coin: shapeCoin(data) };
  },
};


// Pump.fun extractor — branches by pathname since each page type has a
// completely different layout. /create has form inputs, / has coin tiles,
// /coin/<mint> has detail/trades, /profile/<pubkey> has user posts.
function extractPumpFunDom(): unknown {
  const safeText = (el: Element | null, max = 100): string => {
    if (!el) return '';
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  };

  const buildSelector = (el: Element): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const dt = el.getAttribute('data-testid');
    if (dt) return `[data-testid="${CSS.escape(dt)}"]`;
    const nm = el.getAttribute('name');
    if (nm) return `${el.tagName.toLowerCase()}[name="${CSS.escape(nm)}"]`;
    const ph = el.getAttribute('placeholder');
    if (ph) return `${el.tagName.toLowerCase()}[placeholder="${CSS.escape(ph)}"]`;
    const al = el.getAttribute('aria-label');
    if (al) return `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(al)}"]`;
    return el.tagName.toLowerCase();
  };

  const labelFor = (input: Element): string | null => {
    // Look for a label[for=id], parent label, or sibling text
    const id = (input as HTMLElement).id;
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return safeText(lbl, 50);
    }
    const parentLabel = input.closest('label');
    if (parentLabel) return safeText(parentLabel, 60);
    // Look at preceding text in same container
    const wrap =
      input.closest('[class*="field"], [class*="Field"], div') ?? null;
    if (wrap) {
      const lblEl = wrap.querySelector('label, [class*="label" i]');
      if (lblEl && lblEl !== input) return safeText(lblEl, 50);
    }
    return null;
  };

  const path = location.pathname;
  let pageType:
    | 'home'
    | 'create'
    | 'coin'
    | 'profile'
    | 'board'
    | 'unknown' = 'unknown';
  if (path === '/' || path === '') pageType = 'home';
  else if (path === '/create' || path.startsWith('/create')) pageType = 'create';
  else if (path.startsWith('/coin/')) pageType = 'coin';
  else if (path.startsWith('/profile/')) pageType = 'profile';
  else if (path.startsWith('/board')) pageType = 'board';

  // Header landmarks (always present)
  const createBtn = document.querySelector(
    '[data-testid="create-button-sidebar"]',
  );
  const walletBtn = document.querySelector(
    '[data-testid="topbar-wallet-trigger"]',
  );
  const landmarks = {
    createButtonPresent: Boolean(createBtn),
    walletButtonText: walletBtn ? safeText(walletBtn, 30) : null,
  };

  // ──── /create page ────
  if (pageType === 'create') {
    // Form inputs/textareas/file inputs — wide net since pump.fun doesn't use
    // semantic <form> consistently. Inputs may be inside divs with onClick.
    const inputs = Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]), textarea, [contenteditable="true"]',
      ),
    )
      .filter((el) => {
        const html = el as HTMLElement;
        if (html.getAttribute('aria-hidden') === 'true') return false;
        const r = html.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const html = el as HTMLInputElement | HTMLTextAreaElement;
        const tag = html.tagName.toLowerCase();
        const type = (html as HTMLInputElement).type ?? 'text';
        return {
          tag,
          type,
          name: html.getAttribute('name'),
          placeholder: html.getAttribute('placeholder'),
          ariaLabel: html.getAttribute('aria-label'),
          label: labelFor(html),
          value:
            tag === 'textarea' || tag === 'input'
              ? html.value ?? ''
              : safeText(html, 100),
          selector: buildSelector(html),
          required: html.hasAttribute('required'),
        };
      });

    // Submit-style buttons
    const submitButtons = Array.from(
      document.querySelectorAll('button, [role="button"], [type="submit"]'),
    )
      .filter((el) => {
        const html = el as HTMLElement;
        if (html.getAttribute('aria-hidden') === 'true') return false;
        const r = html.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => ({
        text: safeText(b, 60),
        ariaLabel: b.getAttribute('aria-label'),
        type: b.getAttribute('type'),
        testid: b.getAttribute('data-testid'),
        selector: buildSelector(b),
      }))
      .filter((b) => b.text || b.ariaLabel)
      .slice(0, 20);

    return {
      title: document.title,
      url: location.href,
      pageType,
      formFields: inputs,
      buttons: submitButtons,
      landmarks,
      hint: 'Pump.fun create-coin form. Use pageAction action="fill" with each formField.selector to populate. After all fields filled, click button with text "Create" or similar via pageAction action="click". The image upload field (type="file") cannot be filled programmatically — user must select file manually.',
    };
  }

  // ──── /coin/<mint> page ────
  if (pageType === 'coin') {
    const mintMatch = path.match(/^\/coin\/([A-Za-z0-9]+)/);
    const mint = mintMatch?.[1] ?? null;
    // Coin detail: gather visible text + key buttons (Buy, Sell)
    const root = document.querySelector('main') ?? document.body;
    const clone = root.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll(
        'header, nav, aside, footer, [aria-hidden="true"], script, style, svg',
      )
      .forEach((el) => el.remove());
    const cleanText = (clone.innerText ?? '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .slice(0, 1500);
    return {
      title: document.title,
      url: location.href,
      pageType,
      mint,
      text: cleanText,
      landmarks,
      hint: `Pump.fun coin detail page. For canonical data use pumpfunGetCoin(mint="${mint}"). To buy/sell, find Buy/Sell buttons via pageAction.`,
    };
  }

  // ──── homepage / board: coin tiles ────
  const coinAnchors = Array.from(
    document.querySelectorAll('a[href^="/coin/"]'),
  ) as HTMLAnchorElement[];
  const seenMints = new Set<string>();
  const coins: Array<{
    mint: string;
    ticker: string | null;
    name: string | null;
    marketCap: string | null;
    rank: number | null;
    url: string;
  }> = [];
  for (const a of coinAnchors) {
    const m = a.getAttribute('href')?.match(/^\/coin\/([A-Za-z0-9]+)/);
    if (!m) continue;
    const mint = m[1] ?? '';
    if (!mint || seenMints.has(mint)) continue;
    seenMints.add(mint);

    const spans = Array.from(a.querySelectorAll('span'));
    const ticker =
      spans
        .map((s) => safeText(s, 30))
        .find(
          (t) =>
            /^\$?[A-Za-z0-9_-]{1,30}$/i.test(t) &&
            !/^\d+$/.test(t) &&
            t.length > 0,
        ) ?? null;
    const tickerWithoutDollar = ticker?.replace(/^\$/, '') ?? '';
    const name =
      spans
        .map((s) => safeText(s, 40))
        .filter(
          (t) => t.length > 0 && t !== ticker && t !== tickerWithoutDollar,
        )
        .find(
          (t) =>
            /[A-Za-z]/.test(t) &&
            !/^\$?[\d.,KMB%—]+$/.test(t) &&
            t.length < 40,
        ) ?? null;
    const mcEl = Array.from(a.querySelectorAll('div, span')).find((el) => {
      const t = (el.textContent ?? '').trim();
      return /^\$[\d.,]+[KMB]?$/.test(t);
    });
    const marketCap = mcEl ? safeText(mcEl, 20) : null;
    const rankSpan = spans.find((s) => /^\d{1,3}$/.test(safeText(s, 5)));
    const rank = rankSpan ? Number(safeText(rankSpan, 5)) : null;

    coins.push({
      mint,
      ticker,
      name,
      marketCap,
      rank,
      url: `https://pump.fun/coin/${mint}`,
    });
    if (coins.length >= 30) break;
  }

  return {
    title: document.title,
    url: location.href,
    pageType,
    coins,
    coinCount: coins.length,
    landmarks,
    hint: 'Pump.fun home/board. coins[] = ranked tiles. For fresh API data use pumpfunGetTrending. To create coin: navigateTab(url="https://pump.fun/create") then call getPageContext again to read formFields.',
  };
}

export const skill: Skill = {
  id: 'pumpfun',
  name: 'Pump.fun',
  domains: ['pump.fun'],
  systemPromptHint: [
    'User is on Pump.fun, a memecoin launchpad with extremely high rug-pull risk.',
    'DEFAULT to caution: warn user that most coins here are scams, illiquid, or zero-utility before any buy suggestion.',
    'For real swaps, route through Jupiter (jupiterGetQuote tool) using the coin mint address.',
    'Bonding curve coins migrate to Raydium at ~$69K market cap.',
    'PAGE BRANCHES: extractor returns different shapes per pageType:',
    '  - "home"/"board" → coins[] with mint, ticker, name, marketCap, rank',
    '  - "create" → formFields[] with selectors + buttons[] for submit',
    '  - "coin" → mint + text from coin detail page',
    'CREATE FLOW: when user asks to create a coin (1) navigateTab to https://pump.fun/create, (2) call getPageContext again to read formFields[], (3) for each text/textarea field, call pageAction action="fill" selector=field.selector value=<your_drafted_text>, (4) image upload (input type="file") CANNOT be filled programmatically — tell user to drop image manually, (5) click Create button via pageAction. Always confirm draft details with user BEFORE filling fields.',
    'NEVER invent coin/market cap data. Use coins[] for tiles, pumpfunGetCoin(mint) for full details, pumpfunGetTrending for fresh API data.',
  ].join('\n'),
  suggestions: [
    { icon: 'trending', text: 'What coin am I looking at?' },
    { icon: 'bar-chart', text: "What's the market cap and progress?" },
    { icon: 'dollar', text: 'Is this rug-safe? (warn me)' },
  ],
  tools: [getKingOfTheHillTool, getTrendingTool, getCoinTool],
  extractDom: extractPumpFunDom,
};
