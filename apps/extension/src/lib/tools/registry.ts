import type { ToolKind, ToolKindMeta } from '../../types';

export const TOOL_REGISTRY: Record<ToolKind, ToolKindMeta> = {
  getBalance: {
    kind: 'getBalance',
    label: 'Get SOL balance',
    isWrite: false,
  },
  getTokenAccounts: {
    kind: 'getTokenAccounts',
    label: 'List token holdings',
    isWrite: false,
  },
  getRecentTransactions: {
    kind: 'getRecentTransactions',
    label: 'Get recent transactions',
    isWrite: false,
  },
  sendSol: {
    kind: 'sendSol',
    label: 'Send SOL',
    isWrite: true,
  },
  swapJupiter: {
    kind: 'swapJupiter',
    label: 'Swap via Jupiter',
    isWrite: true,
  },
  getPageContext: {
    kind: 'getPageContext',
    label: 'Read current page context',
    isWrite: false,
  },
  getDefiYields: {
    kind: 'getDefiYields',
    label: 'Compare DeFi yields cross-protocol',
    isWrite: false,
  },
  httpGet: {
    kind: 'httpGet',
    label: 'HTTP GET an API',
    isWrite: false,
  },
  httpPost: {
    kind: 'httpPost',
    label: 'HTTP POST to an API',
    isWrite: false,
  },
  signAndSendTx: {
    kind: 'signAndSendTx',
    label: 'Sign and broadcast transaction',
    isWrite: true,
  },
  pageAction: {
    kind: 'pageAction',
    label: 'Interact with page element',
    isWrite: true,
  },
  scrollPage: {
    kind: 'scrollPage',
    label: 'Scroll page',
    isWrite: false,
  },
  extractTweets: {
    kind: 'extractTweets',
    label: 'Extract tweets',
    isWrite: false,
  },
  navigateTab: {
    kind: 'navigateTab',
    label: 'Navigate tab',
    isWrite: false,
  },
  xPostTweet: {
    kind: 'xPostTweet',
    label: 'Post tweet on X',
    isWrite: true,
  },
  xLikeTweet: {
    kind: 'xLikeTweet',
    label: 'Like tweet on X',
    isWrite: true,
  },
  xReplyTweet: {
    kind: 'xReplyTweet',
    label: 'Reply on X',
    isWrite: true,
  },
  xRetweetTweet: {
    kind: 'xRetweetTweet',
    label: 'Repost on X',
    isWrite: true,
  },
  xExtractCurrentTweet: {
    kind: 'xExtractCurrentTweet',
    label: 'Read focused tweet',
    isWrite: false,
  },
  jupiterSwapBySymbol: {
    kind: 'jupiterSwapBySymbol',
    label: 'Swap on Jupiter',
    isWrite: true,
  },
};

export function isWriteTool(kind: ToolKind): boolean {
  return TOOL_REGISTRY[kind].isWrite;
}

export function describeAction(
  tool: ToolKind,
  args: Record<string, unknown>,
): string {
  switch (tool) {
    case 'getBalance':
      return 'Read SOL balance';
    case 'getTokenAccounts':
      return 'Read token holdings';
    case 'getRecentTransactions':
      return 'Read recent transactions';
    case 'sendSol': {
      const amount = args.amount;
      const to = args.to;
      return `Send ${amount} SOL to ${typeof to === 'string' ? shorten(to) : '?'}`;
    }
    case 'swapJupiter': {
      const fromAmount = args.amountIn;
      const fromMint = String(args.inputMint ?? '');
      const toMint = String(args.outputMint ?? '');
      return `Swap ${fromAmount} ${symbolForMint(fromMint)} → ${symbolForMint(toMint)}`;
    }
    case 'getPageContext':
      return 'Read current page';
    case 'getDefiYields': {
      const asset = args.asset;
      return `DeFi yields${asset ? ` for ${asset}` : ' (top across Solana)'}`;
    }
    case 'httpGet': {
      const url = String(args.url ?? '?');
      try {
        const u = new URL(url);
        return `GET ${u.hostname}${u.pathname}`;
      } catch {
        return `GET ${url}`;
      }
    }
    case 'httpPost': {
      const url = String(args.url ?? '?');
      try {
        const u = new URL(url);
        return `POST ${u.hostname}${u.pathname}`;
      } catch {
        return `POST ${url}`;
      }
    }
    case 'signAndSendTx':
      return 'Sign and broadcast transaction';
    case 'pageAction': {
      const action = String(args.action ?? '');
      const label = String(args.label ?? args.selector ?? 'element');
      if (action === 'click') return `Click "${label}"`;
      if (action === 'fill') return `Fill "${label}" with "${args.value ?? ''}"`;
      if (action === 'submit') return `Submit ${label}`;
      return `${action} ${label}`;
    }
    case 'scrollPage': {
      const direction = String(args.direction ?? 'down');
      return `Scroll ${direction}`;
    }
    case 'extractTweets':
      return 'Extract tweets from current X/Twitter page';
    case 'navigateTab': {
      const url = String(args.url ?? '');
      try {
        const u = new URL(url);
        return `Navigate to ${u.hostname}${u.pathname}`;
      } catch {
        return `Navigate to ${url}`;
      }
    }
    case 'xPostTweet': {
      const text = String(args.text ?? '');
      const preview = text.length > 60 ? `${text.slice(0, 60)}…` : text;
      return `Post tweet: "${preview}"`;
    }
    case 'xLikeTweet':
      return 'Like the visible tweet on X';
    case 'xReplyTweet': {
      const text = String(args.text ?? '');
      const preview = text.length > 50 ? `${text.slice(0, 50)}…` : text;
      return `Reply: "${preview}"`;
    }
    case 'xRetweetTweet':
      return 'Repost the visible tweet';
    case 'xExtractCurrentTweet':
      return 'Read the focused tweet';
    case 'jupiterSwapBySymbol': {
      const inSym = String(args.inputSymbol ?? 'SOL').toUpperCase();
      const outSym = String(args.outputSymbol ?? '?').toUpperCase();
      return `Swap ${args.amountIn ?? '?'} ${inSym} → ${outSym}`;
    }
  }
}

function shorten(s: string, n = 4): string {
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

const KNOWN_MINTS: Record<string, string> = {
  So11111111111111111111111111111111111111112: 'SOL',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 'USDT',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'JUP',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'WBTC',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': 'WSOL',
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: 'mSOL',
  jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: 'jupSOL',
  '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': 'INF',
};

function symbolForMint(mint: string): string {
  return KNOWN_MINTS[mint] ?? shorten(mint);
}

export const ANTHROPIC_TOOL_SCHEMAS = [
  {
    name: 'getBalance',
    description: "Get the user's SOL balance in their connected wallet.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'getTokenAccounts',
    description:
      "List all SPL token accounts the user holds (mint addresses + amounts). Useful when the user asks about token holdings, portfolio, or what they own.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'getRecentTransactions',
    description:
      "Get the most recent transaction signatures for the user's wallet. Useful for 'what did I do recently' questions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent transactions, default 10, max 25',
        },
      },
      required: [],
    },
  },
  {
    name: 'sendSol',
    description:
      "Propose a transfer of SOL to a target address. Requires user confirmation. IMPORTANT: 'to' MUST be a base58 Solana pubkey (32-44 chars). SNS .sol names are NOT supported — if user provides a .sol name, ask them for the base58 address instead, do NOT call this tool.",
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description:
            'Recipient base58 pubkey (32-44 chars, e.g. "GsTtrUR9ZbKZuMU2J88YjBGfBjcYmZGYU6ZjLnmKJzPQ"). Do NOT pass .sol names.',
        },
        amount: {
          type: 'number',
          description: 'Amount in SOL (e.g. 0.5)',
        },
      },
      required: ['to', 'amount'],
    },
  },
  {
    name: 'swapJupiter',
    description:
      "Propose a token swap via Jupiter aggregator. Requires user confirmation before execution.",
    input_schema: {
      type: 'object' as const,
      properties: {
        inputMint: {
          type: 'string',
          description: 'Input token mint address (use So11111111111111111111111111111111111111112 for SOL)',
        },
        outputMint: {
          type: 'string',
          description: 'Output token mint address',
        },
        amountIn: {
          type: 'number',
          description: 'Amount of input token (UI units, e.g. 1.5 for 1.5 SOL)',
        },
      },
      required: ['inputMint', 'outputMint', 'amountIn'],
    },
  },
  {
    name: 'getPageContext',
    description:
      "Read what the user is currently viewing on the active browser tab. Returns URL, domain, page title, description, visible text content (truncated), headings, form inputs (with labels and current values), buttons, and links. Call whenever user refers to 'this', 'current', 'this page', 'what I'm looking at', or asks about page content. Use the returned DOM info to answer questions about the page.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'httpGet',
    description:
      "GET an HTTP URL on the current site or its API subdomain. Returns parsed JSON or text. Use this to call REST APIs you read about in the site documentation. URL must be on the same registrable domain as the current tab.",
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL including https:// and any query parameters',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'httpPost',
    description:
      "POST a JSON body to an HTTP URL on the current site's domain. Use to call APIs that need POST (e.g. building a swap transaction, creating an order). URL must be on same registrable domain as current tab. Returns parsed JSON response.",
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to POST to',
        },
        body: {
          type: 'object',
          description: 'JSON payload to send as request body',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'extractTweets',
    description:
      "Extract tweets from the current X (twitter.com) page as STRUCTURED data: [{author, handle, text, time, link, pinned, isRetweet, metrics: {replies, reposts, likes, views, bookmarks}}]. ONLY works on x.com or twitter.com. STRONGLY PREFER this over scrollPage when on X — gives clean per-tweet structure with engagement counts. CRITICAL: if tweets[] is empty, the timeline hasn't rendered yet — call scrollPage direction='down' once then extractTweets again. NEVER invent tweet content, author handles, or metrics — only state what's literally in the returned tweets[] array. If you cannot find a tweet matching what user asked, say so explicitly.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'navigateTab',
    description:
      "Navigate the current tab to a new URL. SAME-DOMAIN ONLY (security). Use this when pageAction click fails on a React SPA without proper anchors — e.g. pump.fun's 'create' button is a div, but pump.fun/create works as direct URL. Also useful for navigating between pages on Solscan, DEX Screener, etc. Do NOT use to leave the current site without explicit user request.",
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string' as const,
          description:
            'Absolute or path-relative URL. Must resolve to the same hostname as the current tab.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'xPostTweet',
    description:
      "Post a tweet on X (twitter.com). End-to-end macro: opens compose, fills text, clicks Post — all in one approval. ONLY works on x.com / twitter.com. The user MUST approve before publishing. Keep tweet under 280 chars. For 'random tweet about X' or 'post about Y' requests, draft text proactively (don't ask user what to say) — they can edit before approving.",
    input_schema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string' as const,
          description:
            'The tweet body. Must be ≤280 characters. Plain text — emojis OK, mentions and hashtags work.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'xLikeTweet',
    description:
      "Like the currently-visible tweet on X (must be on a tweet's permalink page like /username/status/id). User approval required since likes are public.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'xReplyTweet',
    description:
      "Reply to the focused tweet on X with the given text. ONLY works on a tweet's permalink page. Reply text MUST be ≤280 chars. Single-approval macro: opens reply box, fills text, clicks Reply. Draft proactively when user asks ('reply with X', 'tell them Y') — they can edit before approving.",
    input_schema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string' as const,
          description: 'Reply body, ≤280 chars.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'xRetweetTweet',
    description:
      "Repost (retweet) the focused tweet on X. Single click then confirm in popup menu. User approval required.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'xExtractCurrentTweet',
    description:
      "Get structured data of the FOCUSED tweet on a permalink page (the one whose URL matches /handle/status/id in the address bar). Returns {author, handle, text, time, link, metrics}. Use when user asks about 'this tweet' on a permalink page.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'jupiterSwapBySymbol',
    description:
      "Swap tokens by SYMBOL — the easiest swap path. 'swap 1 SOL to BONK' / 'sell 50 USDC for JUP'. Auto-resolves common symbols (SOL/USDC/USDT/JUP/BONK/WIF/PYTH/RAY/JTO) + falls back to Jupiter token search. Builds + signs + sends tx in one approval. The approval card shows the QUOTE PREVIEW (input/output amounts, route, price impact) so user sees what they're getting BEFORE confirming. PREFER this over swapJupiter when user names tokens by symbol. ONLY mainnet.",
    input_schema: {
      type: 'object' as const,
      properties: {
        inputSymbol: {
          type: 'string' as const,
          description: "Input symbol e.g. 'SOL', 'USDC'. Default 'SOL'.",
        },
        outputSymbol: {
          type: 'string' as const,
          description: "Output symbol e.g. 'BONK', 'JUP'.",
        },
        amountIn: {
          type: 'number' as const,
          description: 'UI amount, e.g. 0.5 for 0.5 SOL.',
        },
        slippageBps: {
          type: 'number' as const,
          description: 'Slippage in bps (50 = 0.5%). Default 50.',
        },
      },
      required: ['outputSymbol', 'amountIn'],
    },
  },
  {
    name: 'scrollPage',
    description:
      "Scroll the active web page. READ-ONLY — no approval. STRONGLY PREFER direction='all' for 'read everything' / 'all posts' / infinite-feed scenarios — it scrolls until bottom or limit and returns concatenated NEW text content in ONE call (saves tokens vs looping). Use direction='down'/'up' only for stepwise reading.",
    input_schema: {
      type: 'object' as const,
      properties: {
        direction: {
          type: 'string',
          enum: ['all', 'down', 'up', 'top', 'bottom'],
          description: '"all" = scroll repeatedly until bottom or limit, return all new text in ONE call. "down"/"up" = single ~85% viewport step. "top"/"bottom" = jump.',
        },
        pixels: {
          type: 'number',
          description: 'Optional explicit pixel offset (overrides direction). Positive = down.',
        },
      },
      required: [],
    },
  },
  {
    name: 'pageAction',
    description:
      "Interact with an element on the current web page on behalf of the user. Use selectors from the most recent getPageContext output. Actions: 'click' (button/link/anchor), 'fill' (text input or textarea — sets value and dispatches input/change events for React etc), 'submit' (find ancestor form and submit). REQUIRES USER APPROVAL before executing. Always pass a human-readable 'label' (the visible button text or input label) so the approval card is clear.",
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'fill', 'submit'],
          description: 'click=press button/link, fill=set input value, submit=submit form',
        },
        selector: {
          type: 'string',
          description: 'CSS selector from getPageContext output (id, data-testid, aria-label, name, or nth-of-type)',
        },
        value: {
          type: 'string',
          description: 'Value to fill (only for action=fill)',
        },
        label: {
          type: 'string',
          description: 'Human-readable target name shown in the approval card (e.g. button text, input label)',
        },
      },
      required: ['action', 'selector', 'label'],
    },
  },
  {
    name: 'signAndSendTx',
    description:
      "Sign and broadcast a Solana versioned transaction (base64-encoded). Use AFTER you receive an unsigned transaction from a site's swap/build/execute API via httpPost. The user must approve before this executes. Returns the signature and explorer link.",
    input_schema: {
      type: 'object' as const,
      properties: {
        base64Tx: {
          type: 'string',
          description: 'Base64-encoded serialized VersionedTransaction returned by the site API',
        },
        intent: {
          type: 'string',
          description: 'Brief human-readable description of what this transaction does (e.g. "swap 1 SOL for USDC on Jupiter")',
        },
      },
      required: ['base64Tx'],
    },
  },
  {
    name: 'getDefiYields',
    description:
      "Compare DeFi yields across ALL Solana protocols (Kamino, Marginfi, Drift, Save, Orca, Raydium, etc.) via Defillama. Returns top pools by APY for an optional asset filter. Use when user asks 'best yield for X', 'where to lend X', 'highest APY', or wants cross-protocol comparison.",
    input_schema: {
      type: 'object' as const,
      properties: {
        asset: {
          type: 'string',
          description: 'Optional asset symbol to filter (e.g. "USDC", "SOL"). Omit to get top yields across all assets.',
        },
        minTvl: {
          type: 'number',
          description: 'Minimum TVL in USD to filter out tiny pools (default 100000 = $100k).',
        },
        stablecoinOnly: {
          type: 'boolean',
          description: 'If true, only return stablecoin pools (default false).',
        },
      },
      required: [],
    },
  },
];
