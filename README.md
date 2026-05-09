# solana-copilot

AI assistant + wallet for Solana, as a Chrome extension. Chat with sites you actually use — Jupiter, Kamino, X, Pump.fun, DEX Screener, Solscan — and let the agent read pages, swap tokens, post tweets, supply liquidity. Drop in a single skill file to add a new site.

> Personal hackathon / demo project. Not production-grade.

## What it does

- **AI chat in a Chrome side panel.** Powered by Claude (API key OR Pro/Max subscription via OAuth).
- **Solana wallet built in.** Send SOL, swap via Jupiter, sign arbitrary versioned transactions. Local keypair stored in `chrome.storage.local`.
- **Site-aware skills.** When you open a supported site, the agent gets per-site tools (e.g. `jupiterSwapBySymbol`, `kaminoBestVault`, `xPostTweet`) plus a clean DOM extractor.
- **Drop-in extensibility.** Add a new site? Drop one file in `apps/extension/src/lib/skills/<name>.ts` — the loader auto-discovers it.

## Architecture

```
apps/extension/
├── manifest.json               # Chrome MV3
├── src/
│   ├── background/             # service worker (OAuth + streaming bridge + dNR rules)
│   ├── sidepanel/              # React UI
│   │   ├── App.tsx
│   │   ├── hooks/              # useChat, useActiveTab, useLlmsDiscovery
│   │   ├── store/              # zustand
│   │   ├── components/         # InputBar, MessageBubble, ConfirmActionCard, SettingsPanel
│   │   └── views/              # HomeView, NoWalletView
│   ├── lib/
│   │   ├── llm/                # Anthropic + Ollama + mock + OAuth flow
│   │   ├── tools/              # wallet-level tool registry / execute / format
│   │   ├── solana/             # keypair, rpc, sign
│   │   ├── skills/             # site adapters (auto-discovered)
│   │   └── dom-bridge.ts       # page-world DOM read + macros (xPostTweet, etc.)
│   └── types/index.ts
└── public/icons/
```

## Skills

Each skill is a single file under `apps/extension/src/lib/skills/` exporting `skill: Skill`. A loader uses Vite's `import.meta.glob` to pick them up at build time — no central registry to edit.

| Skill | Tools | DOM extractor |
|---|---|---|
| `jupiter` | swap-by-symbol, quote, price, search | swap card state |
| `kamino` | rates, positions, best vault | vaults table |
| `x` | (uses wallet-level macros) | per-page suggestions |
| `pumpfun` | trending, KOTH, coin info | branched by URL (home / coin / create) |
| `dexscreener` | search | token chart text |
| `solscan` | tx / account | URL-derived page type |
| `drift` | — (closed since hack) | minimal |

To add support for a new site, see [`apps/extension/src/lib/skills/README.md`](apps/extension/src/lib/skills/README.md).

## Auth options

The extension talks to Anthropic. Two modes:

1. **API key** (Settings → Anthropic API Key tab) — paste a `sk-ant-…` key. Pay per request via Console.
2. **Pro/Max subscription** (Settings → Subscription tab) — login via Claude.ai OAuth, billed against your plan. Browser CORS is stripped via `declarativeNetRequest` rules in the background; OAuth flow runs in the SW to sidestep org-level CORS rejection. Token paste path also supported (import from Claude Code CLI's keychain entry).

## Build + load

```bash
pnpm install
pnpm --filter extension build
```

Then in Chrome / Arc: `arc://extensions` → enable Developer mode → Load unpacked → `apps/extension/dist`.

## Caveats

- **Canvas-rendered apps don't work** for DOM automation. Google Sheets, Docs, Figma, Excel Online render content into `<canvas>` — no DOM cells, no per-element selectors, no synthetic clicks. Workaround: backend APIs (Sheets API + OAuth). Out of scope here.
- **Some sites obfuscate selectors.** Skills target stable landmarks first (`data-testid`, `aria-label`), then class names as a last resort. Class names break on minor releases.
- **OAuth via Claude.ai** reuses Claude Code's public client_id. Anthropic doesn't officially endorse third-party use. Could be revoked any time.
- **No production hardening.** No backend proxy for API keys, no Wallet Adapter, no end-to-end encryption of stored keys.

## License

MIT.
