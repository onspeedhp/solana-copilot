import type { SkillTool, Skill } from './types';

// Solscan public API endpoints (no key required for these). For higher rate
// limits or authenticated endpoints, user can set SOLSCAN_API_KEY in env.
const SOLSCAN_PUBLIC_API = 'https://public-api.solscan.io';

async function ssGet(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Solscan ${res.status}: ${await res.text()}`);
  return res.json();
}

const getTxnTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'solscanGetTransaction',
    description:
      "Look up a Solana transaction by signature. Returns slot, block time, fee, status, and parsed instructions. Use when user pastes a tx signature or asks 'what happened in this txn'.",
    input_schema: {
      type: 'object',
      properties: {
        signature: {
          type: 'string',
          description: 'Transaction signature (base58, ~88 chars).',
        },
      },
      required: ['signature'],
    },
  },
  describe: (args) =>
    `Lookup txn ${String(args.signature ?? '').slice(0, 12)}…`,
  async execute(args) {
    const sig = String(args.signature ?? '').trim();
    if (!sig) throw new Error('Missing signature');
    const data = (await ssGet(
      `${SOLSCAN_PUBLIC_API}/transaction/${sig}`,
    )) as Record<string, unknown>;
    // Slim the payload — Solscan returns a lot of nested data
    return {
      signature: sig,
      slot: data.slot,
      blockTime: data.blockTime,
      fee: data.fee,
      status: data.status,
      err: data.err ?? null,
      logCount: Array.isArray(data.logMessage)
        ? (data.logMessage as unknown[]).length
        : null,
      instructionCount: Array.isArray(data.parsedInstruction)
        ? (data.parsedInstruction as unknown[]).length
        : null,
      explorerUrl: `https://solscan.io/tx/${sig}`,
    };
  },
};

const getAccountTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'solscanGetAccount',
    description:
      "Get summary info for a Solana account/wallet by pubkey. Returns SOL balance, token holdings count, executable flag, owner program. Use when user asks about a specific wallet that's not their own.",
    input_schema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana account pubkey (base58, 32-44 chars).',
        },
      },
      required: ['address'],
    },
  },
  describe: (args) =>
    `Lookup account ${String(args.address ?? '').slice(0, 8)}…`,
  async execute(args) {
    const addr = String(args.address ?? '').trim();
    if (!addr) throw new Error('Missing address');
    const data = (await ssGet(
      `${SOLSCAN_PUBLIC_API}/account/${addr}`,
    )) as Record<string, unknown>;
    return {
      address: addr,
      lamports: data.lamports,
      sol:
        typeof data.lamports === 'number'
          ? data.lamports / 1_000_000_000
          : null,
      executable: data.executable,
      ownerProgram: data.ownerProgram ?? null,
      type: data.type ?? null,
      explorerUrl: `https://solscan.io/account/${addr}`,
    };
  },
};

// Site adapter — extract Solscan page content. The site's URL tells us the
// page type (tx, account, token, block) so we can extract focused text.
function extractSolscanDom(): unknown {
  const safeText = (el: Element | null, max = 100): string => {
    if (!el) return '';
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  };

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
    .trim();

  // Detect page type from URL
  const path = location.pathname;
  let pageType:
    | 'tx'
    | 'account'
    | 'token'
    | 'block'
    | 'home'
    | 'unknown' = 'unknown';
  let identifier: string | null = null;
  const txMatch = path.match(/^\/tx\/([A-Za-z0-9]+)/);
  const accMatch = path.match(/^\/account\/([A-Za-z0-9]+)/);
  const tokMatch = path.match(/^\/token\/([A-Za-z0-9]+)/);
  const blkMatch = path.match(/^\/block\/(\d+)/);
  if (txMatch) {
    pageType = 'tx';
    identifier = txMatch[1] ?? null;
  } else if (accMatch) {
    pageType = 'account';
    identifier = accMatch[1] ?? null;
  } else if (tokMatch) {
    pageType = 'token';
    identifier = tokMatch[1] ?? null;
  } else if (blkMatch) {
    pageType = 'block';
    identifier = blkMatch[1] ?? null;
  } else if (path === '/' || path === '') {
    pageType = 'home';
  }

  // Extract key-value pairs by sniffing common Solscan UI patterns
  const headings = Array.from(clone.querySelectorAll('h1, h2, h3'))
    .map((h) => safeText(h, 80))
    .filter(Boolean)
    .slice(0, 10);

  return {
    title: document.title,
    url: location.href,
    pageType,
    identifier,
    text: cleanText.slice(0, 1500),
    headings,
    hint:
      pageType === 'tx'
        ? `Use solscanGetTransaction with signature "${identifier}" for structured data.`
        : pageType === 'account'
          ? `Use solscanGetAccount with address "${identifier}" for structured data.`
          : 'Use Solscan tools or DOM text for what user asks.',
  };
}

export const skill: Skill = {
  id: 'solscan',
  name: 'Solscan',
  domains: ['solscan.io', 'pro.solscan.io'],
  systemPromptHint: [
    'User is on Solscan, a Solana block explorer.',
    'For tx/account/token/block lookups, prefer the typed tools (solscanGetTransaction, solscanGetAccount) — they return structured data.',
    'getPageContext tells you the page type and the identifier in the URL.',
  ].join('\n'),
  suggestions: [
    { icon: 'search', text: "What's in this transaction?" },
    { icon: 'bar-chart', text: 'Account holdings overview' },
    { icon: 'trending', text: 'Recent transfers for this address' },
  ],
  tools: [getTxnTool, getAccountTool],
  extractDom: extractSolscanDom,
};
