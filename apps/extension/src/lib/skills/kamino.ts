import type { SkillTool, Skill } from './types';

const KAMINO_API_BASE = 'https://api.kamino.finance';

async function kget(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kamino ${res.status}: ${await res.text()}`);
  return res.json();
}

const getMainMarketRatesTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'kaminoGetMainMarketRates',
    description:
      "Get current supply/borrow APY rates from Kamino's main lending market for all reserves. Use when user asks 'best USDC yield', 'lending rates', 'where to lend X'.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  describe: () => 'Kamino main market rates',
  async execute() {
    const url = `${KAMINO_API_BASE}/kamino-market/7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF/reserves/metrics`;
    const data = (await kget(url)) as Array<{
      reserve: string;
      liquidityToken?: string;
      supplyApy?: number | string;
      borrowApy?: number | string;
    }>;
    const summarized = data
      .map((r) => ({
        reserve: r.reserve,
        symbol: r.liquidityToken ?? 'unknown',
        supplyAPY: Number(r.supplyApy ?? 0) * 100,
        borrowAPY: Number(r.borrowApy ?? 0) * 100,
      }))
      .filter((r) => r.supplyAPY > 0 || r.borrowAPY > 0)
      .sort((a, b) => b.supplyAPY - a.supplyAPY)
      .slice(0, 10);
    return { reserves: summarized };
  },
  formatResult: (result) => {
    const reserves = (result as { reserves?: Array<{ symbol: string; supplyAPY: number; borrowAPY: number }> }).reserves ?? [];
    if (reserves.length === 0) return 'No active reserves with non-zero rates.';
    const header = 'Token         Supply    Borrow';
    const lines = reserves
      .slice(0, 8)
      .map((r) => {
        const sym = r.symbol.padEnd(12).slice(0, 12);
        const sup = `${r.supplyAPY.toFixed(2)}%`.padStart(8);
        const bor = `${r.borrowAPY.toFixed(2)}%`.padStart(8);
        return `${sym}${sup}  ${bor}`;
      });
    return [header, ...lines].join('\n');
  },
};

const getUserPositionsTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'kaminoGetUserPositions',
    description:
      "Get the user's current positions on Kamino (deposits, borrows). Use when user asks 'my Kamino positions', 'how much do I have on Kamino', 'my deposits'.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  describe: () => 'User positions on Kamino',
  async execute(_args, ctx) {
    const url = `${KAMINO_API_BASE}/kamino-market/7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF/users/${ctx.pubkey}/obligations`;
    return kget(url).catch(() => ({ obligations: [] }));
  },
  formatResult: (result) => {
    const obligations = (result as { obligations?: unknown[] }).obligations;
    if (!Array.isArray(obligations) || obligations.length === 0) {
      return 'No Kamino positions for this wallet.';
    }
    return `${obligations.length} obligation(s) found. Open Kamino UI for full details.`;
  },
};

const bestVaultTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'kaminoBestVault',
    description:
      "Find the best Kamino lending vault for a given asset, sorted by current supply APY. Returns top vaults with APY, TVL, manager, address. Use when user asks 'best USDC yield', 'where to lend SOL', 'compare vaults for X'.",
    input_schema: {
      type: 'object',
      properties: {
        asset: {
          type: 'string',
          description:
            "Asset symbol e.g. 'USDC', 'SOL'. If omitted, returns top vaults across all assets.",
        },
        limit: {
          type: 'number',
          description: 'Max vaults to return (default 5, max 10).',
        },
      },
      required: [],
    },
  },
  describe: (args) =>
    `Kamino top vaults${args.asset ? ` for ${String(args.asset).toUpperCase()}` : ''}`,
  async execute(args) {
    const limit = Math.min(
      Math.max(typeof args.limit === 'number' ? args.limit : 5, 1),
      10,
    );
    const asset =
      typeof args.asset === 'string' ? args.asset.toUpperCase() : null;
    // Use main market reserves as the data source (same as kaminoGetMainMarketRates)
    const url = `${KAMINO_API_BASE}/kamino-market/7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF/reserves/metrics`;
    const data = (await kget(url)) as Array<{
      reserve: string;
      liquidityToken?: string;
      supplyApy?: number | string;
      borrowApy?: number | string;
      totalSupplyUsd?: number | string;
    }>;
    let filtered = data
      .map((r) => ({
        reserve: r.reserve,
        symbol: r.liquidityToken ?? 'unknown',
        supplyAPY: Number(r.supplyApy ?? 0) * 100,
        borrowAPY: Number(r.borrowApy ?? 0) * 100,
        tvlUsd: Number(r.totalSupplyUsd ?? 0),
      }))
      .filter((r) => r.supplyAPY > 0);
    if (asset) {
      filtered = filtered.filter((r) =>
        r.symbol.toUpperCase().includes(asset),
      );
    }
    const sorted = filtered
      .sort((a, b) => b.supplyAPY - a.supplyAPY)
      .slice(0, limit);
    return { vaults: sorted };
  },
  formatResult: (result) => {
    const vaults = (
      result as {
        vaults?: Array<{
          symbol: string;
          supplyAPY: number;
          tvlUsd: number;
        }>;
      }
    ).vaults ?? [];
    if (vaults.length === 0) return 'No vaults found.';
    return vaults
      .map(
        (v) =>
          `${v.symbol.padEnd(8)}  ${v.supplyAPY.toFixed(2)}%  TVL $${(v.tvlUsd / 1_000_000).toFixed(1)}M`,
      )
      .join('\n');
  },
};

// Site-specific DOM extractor for Kamino. Targets the actual app landmarks
// found in production DOM (data-testid="earn-lending-page", "vaults-table").
function extractKaminoDom(): unknown {
  const clean = (s: string | null | undefined): string =>
    (s ?? '').replace(/\s+/g, ' ').trim();
  const safeText = (el: Element | null, max = 80): string => {
    const t = clean(el?.textContent);
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };

  // Parse the structured vaults table — each row has Vault name + APY cells
  const vaults: Array<{
    vault: string;
    manager: string | null;
    cells: string[];
    apy: string | null;
  }> = [];
  const table = document.querySelector('[data-testid="vaults-table"]');
  if (table) {
    const headerCells = Array.from(table.querySelectorAll('thead th')).map(
      (th) => safeText(th, 30),
    );
    const apyColIdx = headerCells.findIndex((h) => /apy/i.test(h));
    const rows = table.querySelectorAll('tbody tr');
    for (const row of Array.from(rows)) {
      const cells = Array.from(row.querySelectorAll('td')).map((td) =>
        safeText(td, 60),
      );
      if (cells.length === 0) continue;
      // First cell is vault name with manager subline; split intelligently
      const vaultCellEl = row.querySelector('td');
      // Vault name is typically a <p> within the cell
      const vaultName =
        safeText(vaultCellEl?.querySelector('p') ?? null, 40) ||
        cells[0] ||
        '';
      // Manager is the second <p> in the cell, often greyed out
      const allPInVault = vaultCellEl?.querySelectorAll('p') ?? [];
      const manager =
        allPInVault.length > 1
          ? safeText((allPInVault[1] as Element | undefined) ?? null, 30)
          : null;
      const apy =
        apyColIdx >= 0 && apyColIdx < cells.length
          ? cells[apyColIdx] ?? null
          : null;
      vaults.push({
        vault: vaultName,
        manager,
        cells,
        apy,
      });
      if (vaults.length >= 25) break;
    }
  }

  // Featured / carousel cards
  const featuredCards = Array.from(
    document.querySelectorAll('[data-testid="carousel-card"]'),
  )
    .map((c) => safeText(c, 200))
    .slice(0, 5);

  // Main page area for fallback text
  const root =
    document.querySelector('[data-testid="earn-lending-page"]') ??
    document.querySelector('main') ??
    document.body;
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'header, nav, aside, footer, [role="banner"], [role="navigation"], [aria-hidden="true"], script, style, svg, [data-testid="carousel-root"]',
    )
    .forEach((el) => el.remove());
  const cleanText = (clone.innerText ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 1500);

  // Wallet button state (connect / connected pubkey shortened)
  const connectBtn = document.querySelector(
    '[data-testid="connect-wallet-button"]',
  );
  const walletState = connectBtn ? safeText(connectBtn, 30) : null;

  return {
    title: document.title,
    url: location.href,
    walletState,
    vaults,
    featuredCards,
    text: cleanText,
    hint: 'Kamino site adapter (uses data-testid landmarks). For canonical rate data including reserves, use kaminoGetMainMarketRates tool.',
  };
}

export const skill: Skill = {
  id: 'kamino',
  name: 'Kamino',
  domains: [
    'kamino.com',
    'app.kamino.com',
    'kamino.finance',
    'app.kamino.finance',
  ],
  systemPromptHint: [
    'User is on Kamino, a Solana lending and yield protocol.',
    'You can fetch current supply/borrow rates and the user positions.',
    'When user asks about yields or stake, use kaminoGetMainMarketRates first.',
    'getPageContext returns site-adapter data (cleaner than generic) when on Kamino.',
  ].join('\n'),
  suggestions: [
    { icon: 'trending', text: 'Best USDC supply APY now' },
    { icon: 'bar-chart', text: 'My Kamino positions' },
    { icon: 'dollar', text: 'SOL borrow rate today' },
  ],
  tools: [getMainMarketRatesTool, getUserPositionsTool, bestVaultTool],
  extractDom: extractKaminoDom,
  getSuggestionsForUrl: (url) => {
    const path = url.pathname;
    if (path.includes('/borrow')) {
      return [
        { icon: 'trending', text: 'Lowest SOL borrow rate' },
        { icon: 'bar-chart', text: 'My borrow positions' },
        { icon: 'dollar', text: 'How much can I borrow against my collateral?' },
      ];
    }
    if (path.includes('/vault/')) {
      return [
        { icon: 'bar-chart', text: 'Tell me about this vault' },
        { icon: 'trending', text: 'Compare with main market' },
        { icon: 'dollar', text: 'Recent yield history' },
      ];
    }
    if (path.includes('/lend') || path.includes('/earn')) {
      return [
        { icon: 'trending', text: 'Best USDC vault now' },
        { icon: 'bar-chart', text: 'Compare top 3 vaults' },
        { icon: 'dollar', text: 'My deposits' },
      ];
    }
    return null;
  },
};
