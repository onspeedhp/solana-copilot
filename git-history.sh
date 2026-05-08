#!/usr/bin/env bash
# git-history.sh — initialize repo + create 15 backdated commits May 2-9, 2026.
#
# Each commit groups files by logical phase. Author date AND committer date
# are both set so GitHub's contribution graph reflects the backdated days.
#
# REVIEW ME BEFORE RUNNING. You may want to:
#   - Adjust dates / times
#   - Reword commit messages
#   - Re-shuffle file groupings
#
# After running, push to GitHub:
#   gh repo create onspeedhp/solana-copilot --public \
#     --description "AI assistant + wallet for Solana. Drop-in skills for sites you use." \
#     --source=. --remote=origin --push

set -euo pipefail

cd "$(dirname "$0")"

if [ -d .git ]; then
  echo "Already a git repo. Aborting to avoid overwrite."
  exit 1
fi

git init -b main

# Helper: stage paths + commit with backdated author/committer date
commit_dated() {
  local date="$1"; shift
  local msg="$1"; shift
  # Remaining args are paths to stage
  for p in "$@"; do
    git add "$p"
  done
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    git commit -m "$msg"
}

# ── May 2 — bootstrap ────────────────────────────────────────────────────
commit_dated "2026-05-02T09:30:00+07:00" \
  "chore: init pnpm monorepo with biome + base tsconfig" \
  .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml \
  tsconfig.base.json biome.json

commit_dated "2026-05-02T14:00:00+07:00" \
  "docs: add product spec + early UI prototype reference" \
  SPEC.md propotype.jsx

commit_dated "2026-05-02T18:00:00+07:00" \
  "feat(extension): vite + tailwind scaffold with MV3 manifest" \
  apps/extension/package.json \
  apps/extension/manifest.json \
  apps/extension/tsconfig.json \
  apps/extension/vite.config.ts \
  apps/extension/tailwind.config.js \
  apps/extension/postcss.config.js \
  apps/extension/public/icons/icon-16.png \
  apps/extension/public/icons/icon-32.png \
  apps/extension/public/icons/icon-48.png \
  apps/extension/public/icons/icon-128.png \
  apps/extension/public/icons/source.png

# ── May 3 — UI shell ─────────────────────────────────────────────────────
commit_dated "2026-05-03T10:00:00+07:00" \
  "feat(sidepanel): React shell + zustand store + global types" \
  apps/extension/src/sidepanel/index.html \
  apps/extension/src/sidepanel/main.tsx \
  apps/extension/src/sidepanel/styles/index.css \
  apps/extension/src/sidepanel/App.tsx \
  apps/extension/src/sidepanel/store/app.ts \
  apps/extension/src/types/index.ts

commit_dated "2026-05-03T16:30:00+07:00" \
  "feat(bg): service worker + active-tab tracking + content script stub" \
  apps/extension/src/background/index.ts \
  apps/extension/src/content/index.ts \
  apps/extension/src/sidepanel/hooks/useActiveTab.ts

# ── May 4 — wallet + Solana ──────────────────────────────────────────────
commit_dated "2026-05-04T11:00:00+07:00" \
  "feat(wallet): wallet config, keypair, RPC + signing layer" \
  apps/extension/src/lib/wallet.ts \
  apps/extension/src/lib/wallet-config.ts \
  apps/extension/src/lib/storage.ts \
  apps/extension/src/lib/solana/keypair.ts \
  apps/extension/src/lib/solana/rpc.ts \
  apps/extension/src/lib/solana/sign.ts

commit_dated "2026-05-04T18:00:00+07:00" \
  "feat(ui): side panel components — header, input, message, action card" \
  apps/extension/src/sidepanel/components/Header.tsx \
  apps/extension/src/sidepanel/components/InputBar.tsx \
  apps/extension/src/sidepanel/components/MessageBubble.tsx \
  apps/extension/src/sidepanel/components/StatusDot.tsx \
  apps/extension/src/sidepanel/components/LoadingState.tsx \
  apps/extension/src/sidepanel/components/ErrorCard.tsx \
  apps/extension/src/sidepanel/components/ConfirmActionCard.tsx \
  apps/extension/src/sidepanel/views/NoWalletView.tsx \
  apps/extension/src/sidepanel/views/HomeView.tsx

# ── May 5 — LLM + tool registry ──────────────────────────────────────────
commit_dated "2026-05-05T11:00:00+07:00" \
  "feat(llm): provider abstraction with Anthropic + Ollama + mock" \
  apps/extension/src/lib/llm/provider.ts \
  apps/extension/src/lib/llm/anthropic.ts \
  apps/extension/src/lib/llm/ollama.ts \
  apps/extension/src/lib/llm/mock.ts \
  apps/extension/src/lib/llms-txt.ts

commit_dated "2026-05-05T16:30:00+07:00" \
  "feat(tools): wallet-level tool registry — getBalance, sendSol, swap, etc." \
  apps/extension/src/lib/tools/registry.ts \
  apps/extension/src/lib/tools/execute.ts \
  apps/extension/src/lib/tools/format.ts \
  apps/extension/src/lib/defillama.ts \
  apps/extension/src/lib/http-tool.ts \
  apps/extension/src/lib/prices.ts \
  apps/extension/src/lib/tokens.ts

commit_dated "2026-05-05T20:00:00+07:00" \
  "feat(chat): multi-turn Anthropic chat with tool approval flow" \
  apps/extension/src/sidepanel/hooks/useChat.ts \
  apps/extension/src/sidepanel/hooks/useLlmsDiscovery.ts \
  apps/extension/src/sidepanel/hooks/useWalletStats.ts \
  apps/extension/src/sidepanel/hooks/useTokenInfo.ts \
  apps/extension/src/sidepanel/components/SettingsPanel.tsx

# ── May 6 — DOM bridge + first skills ────────────────────────────────────
commit_dated "2026-05-06T10:30:00+07:00" \
  "feat(dom-bridge): page-world DOM read, click/fill/scroll, X tweets extractor" \
  apps/extension/src/lib/dom-bridge.ts

commit_dated "2026-05-06T17:00:00+07:00" \
  "feat(skills): Jupiter, Kamino, Drift adapters + types + auto-discover loader" \
  apps/extension/src/lib/skills/types.ts \
  apps/extension/src/lib/skills/index.ts \
  apps/extension/src/lib/skills/jupiter.ts \
  apps/extension/src/lib/skills/kamino.ts \
  apps/extension/src/lib/skills/drift.ts

# ── May 7 — OAuth + CORS bypass ──────────────────────────────────────────
commit_dated "2026-05-07T11:00:00+07:00" \
  "feat(oauth): Claude.ai OAuth for Pro/Max sub via background SW bridge" \
  apps/extension/src/lib/llm/anthropic-oauth.ts

commit_dated "2026-05-07T17:00:00+07:00" \
  "feat(skills): X, Pump.fun, DEX Screener, Solscan with site-specific extractors" \
  apps/extension/src/lib/skills/x.ts \
  apps/extension/src/lib/skills/pumpfun.ts \
  apps/extension/src/lib/skills/dexscreener.ts \
  apps/extension/src/lib/skills/solscan.ts

# ── May 8-9 — polish + contributor docs ──────────────────────────────────
commit_dated "2026-05-08T15:00:00+07:00" \
  "docs(skills): add _TEMPLATE.ts + contributor README for drop-in adapters" \
  apps/extension/src/lib/skills/_TEMPLATE.ts \
  apps/extension/src/lib/skills/README.md

commit_dated "2026-05-09T11:00:00+07:00" \
  "docs: top-level README explaining project, architecture, caveats" \
  README.md

# Done
echo
echo "── Commits created ────────────────────────────────────────────────────"
git log --pretty=format:"%h  %ad  %s" --date=short
echo
echo
echo "Next: create the GitHub repo + push."
echo
echo "  gh repo create onspeedhp/solana-copilot --public \\"
echo "    --description 'AI assistant + wallet for Solana. Drop-in skills for sites you use.' \\"
echo "    --source=. --remote=origin --push"
