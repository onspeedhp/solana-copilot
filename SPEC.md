# Browser Agent Extension — Implementation Spec

Single source of truth for building the MVP. Everything you need to start coding is in this document.

---

## 1. Idea

A browser extension that turns any website with an `llms.txt` file into an AI agent. User opens the sidepanel on a supported site, accepts permission, then chats with a local LLM (Ollama) that can call the site's REST API on their behalf.

**Wedge**: existing AI assistants (Claude, ChatGPT, Codex) live in separate apps. They don't see what site the user is on. They can't call site APIs. Browser extensions like Merlin and Monica are just ChatGPT wrappers — no MCP, no local LLM, no site-specific skills.

This product fills the gap: **browser-native + site-aware + local-first**.

**Phase 1 (this MVP)**: read-only agent. Chat + tool call + display result. No wallet, no transactions, no payments.

**Phase 2 (later)**: wallet integration, session keys for scoped execution, on-chain subscription for premium models, x402 payment flow.

**Wedge audience**: crypto power users on Jupiter, Kalshi, prediction markets — already have Phantom/Rabby installed, already comfortable with extension permissions, already want agent execution.

---

## 2. Architecture

```
┌─ Browser ─────────────────────────────────────────┐
│                                                   │
│  ┌─ Active tab ─┐    ┌─ Extension (MV3) ────────┐ │
│  │              │    │                          │ │
│  │  jupiter.ag  │    │  Sidepanel UI            │ │
│  │              │    │  Tab listener            │ │
│  │              │    │  Skill cache             │ │
│  │              │    │  HTTP tool               │ │
│  └──────────────┘    └──────────────────────────┘ │
└────────────────┬─────────────────┬────────────────┘
                 │                 │
                 ▼                 ▼
         ┌─ Localhost ─┐    ┌─ Web ──────────────┐
         │             │    │                    │
         │  Ollama     │    │  llms.txt          │
         │  qwen2.5:7b │    │  REST API endpoints│
         │             │    │                    │
         └─────────────┘    └────────────────────┘
```

**Runtime flow**:

1. User changes tab → Tab listener fetches `https://<domain>/llms.txt` → caches by domain
2. User types message → Sidepanel sends to Ollama with skill context + tool schema
3. Ollama emits `tool_call` for `http_get(url)` → extension fetches API → returns JSON
4. Ollama reasons over result → streams text answer to Sidepanel

**Key insight**: Extension is the router, not the brain. Brain is Ollama. Knowledge is llms.txt. Same extension works across any site that publishes llms.txt.

---

## 3. Tech Stack

| Layer               | Choice                      | Reason                                                  |
| ------------------- | --------------------------- | ------------------------------------------------------- |
| Extension framework | Manifest V3 vanilla         | Native primitives. No framework overhead for sidepanel. |
| UI                  | React 18 + TypeScript       | Component reuse, type safety for state machine.         |
| Styling             | Tailwind CSS                | Atomic, fast, matches the design tokens.                |
| Build               | Vite + `@crxjs/vite-plugin` | Hot reload for extension dev. Best DX in 2025.          |
| LLM runtime         | Ollama (user-hosted)        | Privacy-first, free, no API key.                        |
| Default model       | `qwen2.5:7b`                | Best tool-calling at 7B size. Fallback `qwen2.5:3b`.    |
| Icons               | `lucide-react`              | Matches design spec.                                    |
| State               | Zustand                     | Simpler than Redux, sufficient for MVP.                 |
| Storage             | `chrome.storage.local`      | Native, async, persists across sessions.                |
| Lint/format         | Biome                       | One tool, faster than ESLint+Prettier.                  |

**No backend**. No database. No auth server. All compute on user's machine + public APIs.

---

## 4. Monorepo Setup

For Phase 1 a single package is enough. Set up monorepo from day 1 anyway because Phase 2 will need shared types + multiple apps (extension + landing page + docs site).

**Tool**: `pnpm` workspaces. (Faster than npm/yarn, simpler than nx/turbo for early stage.)

**Structure**:

```
browser-agent/
├── pnpm-workspace.yaml
├── package.json              ← root
├── tsconfig.base.json        ← shared TS config
├── biome.json                ← shared lint/format
├── .gitignore
├── README.md
│
├── apps/
│   └── extension/            ← the Chrome extension
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── manifest.json
│       ├── public/
│       │   └── icons/        ← 16/32/48/128 px PNG
│       ├── src/
│       │   ├── background/
│       │   │   └── index.ts          ← service worker
│       │   ├── sidepanel/
│       │   │   ├── index.html
│       │   │   ├── main.tsx
│       │   │   ├── App.tsx
│       │   │   ├── components/
│       │   │   │   ├── Header.tsx
│       │   │   │   ├── InputBar.tsx
│       │   │   │   ├── MessageBubble.tsx
│       │   │   │   ├── ToolCallCard.tsx
│       │   │   │   ├── PermissionCard.tsx
│       │   │   │   ├── EmptyState.tsx
│       │   │   │   ├── LoadingState.tsx
│       │   │   │   ├── ErrorCard.tsx
│       │   │   │   └── StatusDot.tsx
│       │   │   ├── views/
│       │   │   │   ├── ChatView.tsx
│       │   │   │   └── PermissionView.tsx
│       │   │   ├── store/
│       │   │   │   └── app.ts        ← Zustand store
│       │   │   ├── hooks/
│       │   │   │   ├── useActiveTab.ts
│       │   │   │   ├── useSkill.ts
│       │   │   │   └── useChat.ts
│       │   │   └── styles/
│       │   │       └── index.css     ← Tailwind directives + tokens
│       │   ├── lib/
│       │   │   ├── ollama.ts         ← chat + streaming
│       │   │   ├── llms-txt.ts       ← fetch + parse
│       │   │   ├── http-tool.ts      ← whitelisted fetch
│       │   │   └── storage.ts        ← chrome.storage wrapper
│       │   └── types/
│       │       └── index.ts          ← shared types
│       └── README.md
│
└── packages/
    └── shared/               ← shared utils across apps (Phase 2 ready)
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts
```

**`pnpm-workspace.yaml`**:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Bootstrap commands**:

```bash
mkdir browser-agent && cd browser-agent
pnpm init
echo "packages:\n  - 'apps/*'\n  - 'packages/*'" > pnpm-workspace.yaml
mkdir -p apps/extension packages/shared
cd apps/extension
pnpm create vite . --template react-ts
pnpm add -D @crxjs/vite-plugin@beta @types/chrome tailwindcss postcss autoprefixer
pnpm add lucide-react zustand
npx tailwindcss init -p
```

---

## 5. MVP Scope

### What's in

- Sidepanel UI with 7 states (see Section 7)
- Tab change detection → fetch `llms.txt` → cache per domain
- Permission flow: ask user before loading skills for new domain
- Chat with Ollama (streaming responses)
- Tool call: single tool `http_get(url)` whitelisted to current tab's domain
- Display tool call inline as expandable card with JSON preview
- Footer metadata: skills count, model name, "local" indicator
- Error handling: Ollama unreachable, llms.txt 404, fetch failures

### What's out

- Light mode (only dark for MVP)
- Conversation persistence across sessions (clear on close)
- Multi-tab conversations (1 tab = 1 conversation)
- Settings page (just a placeholder gear icon)
- Voice input
- Markdown rendering (plain text only)
- Code syntax highlighting beyond JSON in tool cards
- Wallet integration (Phase 2)
- Authentication / API keys
- Internationalization (English only)

### Success criteria

The MVP ships when:

1. Extension loads in Chrome via "Load unpacked"
2. On `jupiter.ag`, sidepanel shows permission card with at least 4 capabilities parsed from llms.txt
3. After connecting, user can ask "find token JUP" → LLM calls `http_get` → JSON returned → answer streamed back
4. Tool call card displays inline with truncated URL + status icon + expandable JSON
5. Switching to a tab without llms.txt shows empty state cleanly
6. Killing Ollama shows error state with retry button

That's the demo. Record a 2-minute video showing this flow end-to-end and the MVP is done.

---

## 6. Design System

### Color tokens (dark mode only for MVP)

```css
:root {
  --bg: #0a0a0a;
  --surface: #161616;
  --surface-elevated: #1c1c1c;
  --surface-deep: #141414; /* for code blocks inside tool cards */

  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.14);
  --border-focus: #7c3aed;

  --text-primary: rgba(255, 255, 255, 0.9);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-tertiary: rgba(255, 255, 255, 0.4);
  --text-quaternary: rgba(255, 255, 255, 0.2);

  --accent: #7c3aed;
  --accent-hover: #6d28d9;

  --status-green: #10b981;
  --status-amber: #f59e0b;
  --status-red: #ef4444;

  --json-key: #7c3aed;
  --json-string: #86efac;
  --json-number: #fbbf24;
}
```

Map these to Tailwind via `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      bg: '#0a0a0a',
      surface: { DEFAULT: '#161616', elevated: '#1c1c1c', deep: '#141414' },
      accent: { DEFAULT: '#7c3aed', hover: '#6d28d9' },
      status: { green: '#10b981', amber: '#f59e0b', red: '#ef4444' },
    },
    borderRadius: { sm: '6px', DEFAULT: '6px', md: '10px', lg: '12px' },
  },
},
```

### Typography

- Font: Inter (`@fontsource/inter` package)
- Mono: JetBrains Mono (`@fontsource/jetbrains-mono` package)
- Sizes: `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-[14px]`, `text-[15px]`
- Weights: `font-normal` (400), `font-medium` (500). **Never 600 or 700.**
- Line height: `leading-[1.5]` body, `leading-tight` headers
- Letter spacing: `tracking-tight` (-0.025em) on 14px+ headers

### Spacing

4px base unit. All padding/margin in multiples of 4.
Tailwind scale already uses this (`p-1` = 4px, `p-2` = 8px, etc.). Use freely.

### Radius rules

- 6px (`rounded-[6px]`): chips, code blocks, tool call card, secondary buttons
- 10px (`rounded-[10px]`): cards, inputs, message bubbles
- 12px (`rounded-[12px]`): primary CTA buttons (Connect)
- Full (`rounded-full`): status dots only

### No-go list

- ❌ Gradients (any kind)
- ❌ Glassmorphism / `backdrop-blur`
- ❌ Drop shadows (max `0 1px 2px rgba(0,0,0,0.04)` on light mode only)
- ❌ Glow effects
- ❌ Decorative blob backgrounds
- ❌ Multiple accent colors
- ❌ Emoji icons (use Lucide)
- ❌ Bouncy animations
- ❌ Bottom navigation bar
- ❌ Hero text > 16px

### Reference apps

Linear, Raycast, Arc browser, Things 3, Vercel dashboard.
**Not** Stripe, Apple marketing, generic SaaS landing pages.

---

## 7. UI States

7 states, each rendered by a single component switching off `appState.kind`. Reference component code: see the `sidepanel-prototype.jsx` artifact.

| State            | Trigger                                           | Body content                                         |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `empty`          | Tab is `chrome://`, `about:blank`, or no llms.txt | Geometric placeholder + "No skills available" + link |
| `loading`        | Tab change detected, fetching llms.txt            | Skeleton of permission card with shimmer             |
| `permission`     | llms.txt parsed, awaiting user accept             | Permission card with skills list + Connect/Not now   |
| `chat-idle`      | Connected, no messages yet                        | Centered hint + 3 suggestion chips                   |
| `chat-active`    | Connected, has messages                           | Message list with bubbles + tool call cards          |
| `tool-executing` | LLM is mid-tool-call                              | Same as chat-active + pending tool card              |
| `error`          | Ollama unreachable, fetch failed, etc.            | Error card with cause + retry action                 |

Header varies by state. Input bar shows only on `chat-*` states.

---

## 8. Data Shapes

```ts
// types/index.ts

export type SkillItem = {
  title: string; // e.g. "Search tokens and prices"
  endpoint?: string; // optional API hint, e.g. "GET /tokens/v2/search"
};

export type Site = {
  domain: string; // "jupiter.ag"
  favicon: string; // resolved favicon URL
  llmsTxtUrl: string; // "https://jupiter.ag/llms.txt"
  llmsTxtRaw: string; // raw markdown content
  skills: SkillItem[]; // parsed bullet list
  fetchedAt: number; // unix ms
  trusted: boolean; // user clicked "Always trust"
};

export type Message =
  | { id: string; role: 'user'; content: string; ts: number }
  | {
      id: string;
      role: 'assistant';
      content: string;
      ts: number;
      streaming?: boolean;
    }
  | {
      id: string;
      role: 'tool';
      tool: 'http_get';
      url: string;
      status: 'pending' | 'success' | 'error';
      response?: unknown; // parsed JSON
      error?: string;
      ts: number;
    };

export type AppState =
  | { kind: 'empty'; reason: 'unsupported_page' | 'no_llms_txt' }
  | { kind: 'loading'; domain: string }
  | { kind: 'permission'; site: Site }
  | { kind: 'chat-idle'; site: Site }
  | { kind: 'chat-active'; site: Site; messages: Message[] }
  | { kind: 'tool-executing'; site: Site; messages: Message[] }
  | {
      kind: 'error';
      reason: 'ollama_unreachable' | 'fetch_failed' | 'unknown';
      detail?: string;
    };
```

Persist `Site.trusted` in `chrome.storage.local` keyed by domain. Don't persist messages for MVP.

---

## 9. Manifest V3 Configuration

```json
{
  "manifest_version": 3,
  "name": "Browser Agent",
  "version": "0.1.0",
  "description": "AI assistant for sites with llms.txt skills",
  "permissions": ["sidePanel", "tabs", "storage", "activeTab"],
  "host_permissions": ["http://localhost:11434/*", "https://*/*"],
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "action": {
    "default_title": "Open agent"
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "icons": {
    "16": "icons/16.png",
    "32": "icons/32.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

**Background script (minimal)**:

```ts
// src/background/index.ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Forward tab events to sidepanel via runtime messages
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  chrome.runtime.sendMessage({ type: 'TAB_CHANGED', url: tab.url });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab.active) {
    chrome.runtime.sendMessage({ type: 'TAB_CHANGED', url: tab.url });
  }
});
```

---

## 10. Core Module Specs

### `lib/ollama.ts`

```ts
export async function* streamChat(params: {
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  signal?: AbortSignal;
}): AsyncGenerator<OllamaChunk> {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      messages: params.messages,
      tools: params.tools,
      stream: true,
    }),
    signal: params.signal,
  });
  if (!res.ok) throw new Error(`Ollama: ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }
}
```

Tool schema for Ollama:

```ts
const httpGetTool = {
  type: 'function',
  function: {
    name: 'http_get',
    description:
      'Make a GET request to a whitelisted API endpoint of the current site',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL including https:// and query params',
        },
      },
      required: ['url'],
    },
  },
};
```

### `lib/llms-txt.ts`

```ts
export async function fetchLlmsTxt(domain: string): Promise<Site | null> {
  const url = `https://${domain}/llms.txt`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return parseLlmsTxt(domain, url, text);
  } catch {
    return null;
  }
}

function parseLlmsTxt(domain: string, url: string, raw: string): Site {
  // Extract bullet items as skills (lines starting with `- `)
  // Extract first-paragraph description as headline
  // Find unique API endpoints (matching /api/, /v1/, /v2/ patterns)
  // Cap skills at 6 for UI clarity
  const skills = raw
    .split('\n')
    .filter((line) => line.startsWith('- ['))
    .slice(0, 6)
    .map((line) => {
      const match = line.match(/^- \[(.+?)\]/);
      return { title: match?.[1] ?? line.slice(2) };
    });
  return {
    domain,
    favicon: `https://${domain}/favicon.ico`,
    llmsTxtUrl: url,
    llmsTxtRaw: raw,
    skills,
    fetchedAt: Date.now(),
    trusted: false,
  };
}
```

### `lib/http-tool.ts`

```ts
export async function executeHttpGet(
  url: string,
  allowedDomain: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const parsed = new URL(url);
    if (
      !parsed.hostname.endsWith(allowedDomain) &&
      !isApiSubdomain(parsed.hostname, allowedDomain)
    ) {
      return { ok: false, error: `Domain ${parsed.hostname} not whitelisted` };
    }
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `${res.status} ${res.statusText}` };
    const data = await res.json();
    // Truncate large responses
    const truncated = truncateForLLM(data, 8000);
    return { ok: true, data: truncated };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function isApiSubdomain(host: string, root: string): boolean {
  // jupiter.ag → api.jup.ag, api.jupiter.ag, etc.
  const rootBase = root
    .replace(/^www\./, '')
    .split('.')
    .slice(-2)
    .join('.');
  const altBase = root.replace('jupiter', 'jup');
  return host.endsWith(rootBase) || host.endsWith(altBase);
}
```

### `store/app.ts`

```ts
import { create } from 'zustand';

interface AppStore {
  state: AppState;
  setState: (s: AppState) => void;
  addMessage: (m: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  trustDomain: (domain: string) => Promise<void>;
}

export const useApp = create<AppStore>((set) => ({
  state: { kind: 'empty', reason: 'unsupported_page' },
  setState: (s) => set({ state: s }),
  addMessage: (m) =>
    set((store) => {
      if (
        store.state.kind === 'chat-active' ||
        store.state.kind === 'chat-idle'
      ) {
        const messages = 'messages' in store.state ? store.state.messages : [];
        return {
          state: {
            ...store.state,
            kind: 'chat-active',
            messages: [...messages, m],
          },
        };
      }
      return store;
    }),
  // ... etc
}));
```

---

## 11. Implementation Phases

Build incrementally. Don't try to ship everything at once.

### Phase 1.1 — Shell (Day 1)

- Bootstrap monorepo + extension app
- Manifest V3 + sidepanel HTML loads
- Empty React component renders inside sidepanel
- "Load unpacked" works in Chrome
- **Done when**: clicking extension icon opens sidepanel showing "Hello"

### Phase 1.2 — Design system (Day 1-2)

- Tailwind config with all design tokens
- Inter + JetBrains Mono loaded
- All 9 components from `sidepanel-prototype.jsx` ported to `.tsx` files
- Storybook-style state switcher (dev-only) to view all 7 states
- **Done when**: all 7 states render correctly with mock data

### Phase 1.3 — Ollama integration (Day 2-3)

- `lib/ollama.ts` with streaming chat
- `useChat` hook wires textarea → stream → message bubble
- No tools yet — pure chat
- Test prompt: "hello" → see streamed response
- **Done when**: can have a basic conversation with local Ollama through sidepanel

### Phase 1.4 — Tab + skill loading (Day 3-4)

- Background script listens to tab events
- Sidepanel listens to `TAB_CHANGED` runtime messages
- `lib/llms-txt.ts` fetches + parses
- Skill cache via `chrome.storage.local`
- Permission state shows on first visit per domain
- **Done when**: visiting `jupiter.ag` shows permission card with parsed skills

### Phase 1.5 — Tool calling (Day 4-6)

- Add `http_get` tool schema to Ollama call
- Detect tool_call in stream → execute → feed result back
- Render `ToolCallCard` inline during execution
- JSON preview expands/collapses
- Whitelist enforcement
- **Done when**: "find token JUP" → LLM calls API → JSON shows → answer streams back

### Phase 1.6 — Polish + error states (Day 6-7)

- Detect Ollama unreachable → error state with retry
- Detect llms.txt 404 → empty state with reason
- Truncate large API responses before feeding back to LLM
- Add `chrome.alarms` keepalive for service worker (optional)
- **Done when**: kill Ollama, see error state. Restart, click retry, works again.

**Total estimate**: 6-7 working days for solo dev. Add 50% buffer for MV3 quirks → 10 days realistic.

---

## 12. Known Gotchas

These will bite you. Know them upfront.

1. **MV3 service worker dies after 30s idle**. Streaming connections will break. Workaround: keep streaming logic inside the sidepanel script (it lives as long as the panel is open), use background only for tab events. If streaming must persist longer, add `chrome.alarms` keepalive at 25s.

2. **Ollama tool calling requires the right model**. `qwen2.5:7b` works well. `llama3.2:3b` is hit-or-miss. `mistral:7b` is unreliable for tools. If you must use a smaller model, test thoroughly with `qwen2.5:3b` (still surprisingly capable for tools).

3. **CORS for llms.txt**: extension `host_permissions` bypasses CORS for `fetch()` from sidepanel. You won't have CORS issues here. But if you ever inject a content script that fetches from page context, CORS applies again.

4. **llms.txt context size**: Jupiter's is ~30K tokens. `qwen2.5:7b` has 32K context. Tight. Strategies:
   - Use `qwen2.5:14b` if user has the RAM (16GB+)
   - Pre-filter llms.txt to extract only API endpoint definitions before injection
   - Truncate to top N skills + their endpoint blocks

5. **Vite + crxjs**: as of 2025, `@crxjs/vite-plugin@beta` is the active version. Stable releases lag. Stick with beta.

6. **TypeScript types for Chrome APIs**: install `@types/chrome`. Some MV3 APIs (like `chrome.sidePanel`) need recent versions.

7. **Streaming JSON parsing**: Ollama returns NDJSON (newline-delimited). Don't `JSON.parse(response.text)` — split by `\n` and parse each line. Buffer incomplete chunks across reads.

8. **Tool result size**: large JSON responses blow context. Always truncate to ~8KB before feeding back to LLM. Show full version in UI but summarize for model.

9. **Favicon resolution**: `https://<domain>/favicon.ico` works most of the time but not always. Fallback to a violet circle with first letter of domain (already in prototype).

10. **Hot reload + extensions**: changes to `manifest.json` or background script require unloading + reloading the extension manually. Sidepanel HTML/React changes hot reload fine via Vite.

---

## 13. Acceptance Test Script

After "MVP done", run this script. If all 6 pass, ship it.

```
1. Fresh Chrome profile. Load unpacked extension.
   → Click extension icon. Sidepanel opens.
   → Header shows "Settings" gear, no domain.
   → Body shows empty state: circle outline + "No skills available".
   PASS / FAIL

2. Open new tab to https://jupiter.ag
   → Within 2s, sidepanel shows loading state.
   → Within 5s, transitions to permission card.
   → Card shows favicon, "jupiter.ag", "This site offers AI skills",
     and 4-6 bullet points of capabilities.
   PASS / FAIL

3. Click "Connect" on permission card.
   → Transitions to chat idle state.
   → Header shows green dot + "jupiter.ag · Connected".
   → 3 suggestion chips visible with icons.
   → Footer shows "✓ N skills loaded · qwen2.5:7b · local".
   PASS / FAIL

4. Type "find token JUP" and press enter.
   → User bubble appears right-aligned in violet.
   → Tool call card appears with spinner + "Fetching from api.jup.ag...".
   → Within 5s, tool card shows green checkmark + collapsed JSON.
   → Click chevron. JSON expands with violet keys, green strings, amber numbers.
   → Assistant bubble streams in below with answer mentioning JUP.
   PASS / FAIL

5. Switch to a tab without llms.txt (e.g., wikipedia.org).
   → Sidepanel shows empty state.
   → Switch back to jupiter.ag tab.
   → Returns to chat-active with previous messages still visible.
   PASS / FAIL

6. Kill Ollama (`pkill ollama`).
   → Type a new message.
   → Within 2s, error state appears: red dot + "Ollama not running".
   → Error card shows with "ollama serve" code block + Retry button.
   → Restart Ollama. Click Retry.
   → Returns to working chat state.
   PASS / FAIL
```

Bonus test: record this entire flow as a 2-minute video. That's the demo for showing investors / friends / Twitter.

---

## 14. After MVP

Once acceptance tests pass, **stop and ship**. Don't keep adding features. Get it in front of 5 users. Watch them use it. Listen.

Likely Phase 2 priorities based on what users ask for:

- **Multi-message conversation memory** (persist messages in chrome.storage)
- **Light mode** (already have tokens, just need to flip)
- **More LLM options** (Llama, Mistral, OpenAI fallback for users without local LLM)
- **Skill marketplace**: list of sites that have llms.txt, ranked by usefulness
- **Settings page**: model selector, system prompt customization, debug logs

Phase 3 (the actual long-term thesis):

- Wallet integration (Phantom / Rabby / MetaMask)
- Session keys for scoped on-chain execution
- x402 payment for premium model usage
- MCP-over-HTTP support beyond llms.txt
- Distribution partnerships with wallets

Don't build any of Phase 3 until Phase 1 has 100+ active users. Otherwise you're optimizing for a customer that doesn't exist yet.

---

## 15. References

- llms.txt standard: https://llmstxt.org
- Jupiter llms.txt example: https://developers.jup.ag/llms.txt
- Ollama API docs: https://github.com/ollama/ollama/blob/main/docs/api.md
- Chrome MV3 sidepanel: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- crxjs/vite-plugin: https://crxjs.dev
- Lucide icons: https://lucide.dev
- Design references: https://linear.app, https://raycast.com

---

## 16. One-line elevator pitch

> Browser-native AI agent that turns any website's `llms.txt` into a local, private assistant — with execution, not just chat.
