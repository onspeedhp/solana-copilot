// _TEMPLATE.ts — template for adding a new site skill.
//
// To support a new site:
//   1. Copy this file to `<sitename>.ts` (lowercase, no spaces).
//   2. Edit the fields below.
//   3. That's it. The loader auto-discovers it on next build/reload.
//
// Files prefixed with `_` are ignored by the loader, so this file stays out
// of the registered skills list.

import type { Skill, SkillTool } from './types';

// Optional API tool example — safe read-only HTTP fetch + structured return.
// Wallet-signing actions (sendSol, swap, etc.) belong in the wallet tools
// layer (lib/tools/), NOT here. Skill tools are for site-specific reads.
const exampleApiTool: SkillTool = {
  isWrite: false,
  schema: {
    name: 'exampleQuery',
    description:
      'Describe what this tool does. Be specific — the AI uses this text to decide when to call it. Mention triggering phrases users might say.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search.' },
      },
      required: ['query'],
    },
  },
  describe: (args) => `Example: ${String(args.query ?? '?')}`,
  async execute(args) {
    const q = encodeURIComponent(String(args.query ?? ''));
    const res = await fetch(`https://api.example.com/search?q=${q}`);
    if (!res.ok) throw new Error(`Example ${res.status}`);
    return res.json();
  },
  formatResult: (result) =>
    `Got ${Object.keys(result as object).length} fields`,
};

// Optional DOM extractor — runs in the page world via executeScript. MUST be
// self-contained (no closure over module-scope vars, no imports). Return
// JSON-serializable structured data — strip page chrome, keep semantics.
function extractExampleDom(): unknown {
  const root = document.querySelector('main') ?? document.body;
  // Strip noise
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'header, nav, aside, footer, [aria-hidden="true"], script, style, svg',
    )
    .forEach((el) => el.remove());
  // Extract whatever is meaningful for the AI — e.g. table rows, cards, etc.
  // Use site-specific selectors (data-testid is best, then aria-label, then
  // class names — but classes change often).
  return {
    title: document.title,
    url: location.href,
    text: (clone.innerText ?? '').slice(0, 1500),
    hint: 'Tell the AI what fields are available and how to use them.',
  };
}

// Skip this template by leaving the export commented out — the loader
// ignores files prefixed with `_` anyway, but extra safety doesn't hurt.

/*
export const skill: Skill = {
  // Lowercase id, no spaces. Used in logs + AI system prompts.
  id: 'example',
  // Display name shown in the SiteCard "connected" badge.
  name: 'Example',
  // Domain matches: exact OR subdomain (e.g. "app.example.com" matches "example.com").
  domains: ['example.com'],
  // 1-5 lines telling the AI what this site is + how to use the tools.
  systemPromptHint: [
    'User is on Example, a [what this site does].',
    'For [common task], use exampleQuery tool.',
    'When user says "this", check getPageContext for the current page state.',
  ].join('\n'),
  // Default suggestion chips shown in empty chat.
  suggestions: [
    { icon: 'search', text: 'Search example tokens' },
    { icon: 'trending', text: 'Show top items' },
    { icon: 'dollar', text: 'Latest prices' },
  ],
  // API tools the AI can call ON THIS SITE only.
  tools: [exampleApiTool],
  // Optional: cheap URL-derived context (no DOM needed).
  extractContext: (url) => {
    const m = url.pathname.match(/\/item\/([^/]+)/);
    return m ? { itemId: m[1] } : null;
  },
  // Optional: structured DOM extraction for getPageContext.
  extractDom: extractExampleDom,
  // Optional: URL-aware chip suggestions. Return null to fall back to default.
  getSuggestionsForUrl: (url) => {
    if (url.pathname === '/' || url.pathname === '/home') {
      return [
        { icon: 'search', text: 'Summarize today\'s feed' },
      ];
    }
    return null;
  },
};
*/

// Suppress unused-import warnings while the template export stays commented out.
void extractExampleDom;
void exampleApiTool;
const _typeProbe: Skill | null = null;
void _typeProbe;
