# Skills

Drop-in adapters for individual websites. Each file in this folder is one site.

## Add support for a new site

1. **Copy `_TEMPLATE.ts` to `<sitename>.ts`** (lowercase, no spaces).
2. **Edit the fields** — domains, system prompt, suggestions, tools, extractor.
3. **Build & reload the extension.** That's it.

The loader (`index.ts`) auto-discovers any `.ts` file in this folder that
exports `skill` — no registry edit, no central list to update.

## Anatomy of a skill file

```ts
import type { Skill } from './types';

export const skill: Skill = {
  id: 'mysite',                   // lowercase id
  name: 'My Site',                // shown in the "connected" badge
  domains: ['mysite.com'],        // exact host or subdomain match
  systemPromptHint: '...',        // injected into AI system prompt
  suggestions: [...],             // default chips
  tools: [...],                   // optional API tools
  extractContext: url => {...},   // optional, cheap URL → context
  extractDom: () => {...},        // optional, structured DOM in page world
  getSuggestionsForUrl: url => [...], // optional, URL-aware chips
};
```

## Three layers of capability

| Layer | When to use | Where to put it |
|---|---|---|
| **API tool** (`tools[]`) | Site has a public REST API → fetch JSON | Skill file |
| **DOM extractor** (`extractDom`) | No API → parse rendered DOM for structured info | Skill file (page world) |
| **Wallet write tool** (sendSol, swap, etc.) | Needs Solana keypair | `lib/tools/`, NOT here |

## Conventions

- **Tool names** prefix with site id, e.g. `kaminoBestVault`, not `bestVault`.
- **Tool descriptions** must be specific — the AI uses them to decide when to
  call. Include trigger phrases users might say.
- **DOM extractors** must be **self-contained** — no closures over module
  variables, no imports. They're serialized + injected via
  `chrome.scripting.executeScript`.
- **Site-specific landmarks**: prefer `data-testid` selectors, then `aria-*`,
  then class names (last resort — classes break).
- **Strip noise** in DOM extractors: `header, nav, aside, footer,
  [aria-hidden="true"], script, style, svg`.
- **Cap output size**: keep returned objects under ~3KB. The AI's token budget
  is finite — every byte counts.
- **Never invent**: if the DOM is empty or canvas-rendered, return a clear
  `hint` field telling the AI to use API tools or admit failure. Don't return
  guess-text.

## Files prefixed with `_`

Ignored by the loader. Use for templates (`_TEMPLATE.ts`), drafts, shared
helpers — anything that isn't a registered site adapter.

## Existing skills

| File | Site | API tools | Extractor |
|---|---|---|---|
| `jupiter.ts` | jup.ag | quote / price / search | swap card state |
| `kamino.ts` | kamino.com, kamino.finance | rates / positions / best vault | vaults table |
| `x.ts` | x.com, twitter.com | (uses wallet-level macros) | per-page chips |
| `pumpfun.ts` | pump.fun | trending / KOTH / coin info | branched by URL |
| `dexscreener.ts` | dexscreener.com | search | token chart text |
| `solscan.ts` | solscan.io | tx / account lookup | URL-derived page type |
| `drift.ts` | drift.trade | (closed since hack) | minimal |

## Testing a new skill

1. Build: `pnpm --filter extension build`
2. Reload extension in `chrome://extensions` (or arc://extensions)
3. Open the target site → SiteCard should show "connected" badge with your `name`
4. Open the chat → suggestions should reflect `suggestions` (or `getSuggestionsForUrl`)
5. Ask the AI a question that should trigger your tool; verify it gets called

If the AI doesn't call your tool, sharpen the tool description. If
`getPageContext` returns wrong data, inspect the live HTML via the
**Download** icon on the SiteCard, then iterate the extractor.
