// Public contributor types. New skill files should import `Skill` (and the
// helpers `SkillTool`, `SkillSuggestion`) directly. The `Integration*` names
// remain as aliases for backward compatibility.

export type SkillToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
};

export type SkillToolContext = {
  pubkey: string;
};

export type SkillTool = {
  schema: SkillToolSchema;
  isWrite: boolean;
  execute: (
    args: Record<string, unknown>,
    ctx: SkillToolContext,
  ) => Promise<unknown>;
  describe: (args: Record<string, unknown>) => string;
  formatResult?: (
    result: unknown,
    args: Record<string, unknown>,
  ) => string;
};

export type SkillSuggestion = {
  icon: 'search' | 'trending' | 'send' | 'dollar' | 'bar-chart';
  text: string;
};

export type PageContext = Record<string, unknown>;

// Backward-compat aliases (existing imports use these names)
export type IntegrationToolSchema = SkillToolSchema;
export type IntegrationToolContext = SkillToolContext;
export type IntegrationTool = SkillTool;
export type SiteSuggestion = SkillSuggestion;

// A self-contained function that runs in the page world via
// chrome.scripting.executeScript. Cannot reference module-scope variables
// (it's serialized + injected). Should return JSON-serializable structured
// data optimized for AI consumption — strip page chrome, keep semantics.
export type DomExtractor = () => unknown;

// The contract a skill file must satisfy. Drop a `lib/skills/<id>.ts` file
// exporting `export const skill: Skill = {...}` and it auto-registers.
export interface Skill {
  // Stable id used for analytics + system prompts. Lowercase, no spaces.
  id: string;
  // Display name shown in the SiteCard "connected" badge.
  name: string;
  // Hostname matches. Match is exact OR subdomain (host.endsWith(".<domain>")).
  domains: string[];
  // Few-line hint inserted into AI system prompt when user is on this site.
  systemPromptHint: string;
  // Default chips shown in empty chat. Used when getSuggestionsForUrl is
  // absent or returns null.
  suggestions: SkillSuggestion[];
  // API-backed tools the AI can call (only available on this site). Use
  // these for clean read access — do NOT use them for tasks that need a
  // Solana keypair (keep wallet ops in the wallet tools layer).
  tools: SkillTool[];
  // Optional: derive structured page context from the URL alone (path
  // segments, query params). Cheap — runs in extension context.
  extractContext?: (url: URL) => PageContext | null;
  // Optional: site-specific DOM extractor that runs in the page via
  // chrome.scripting.executeScript. Must be SELF-CONTAINED (no closures
  // over module-scope variables). Return JSON-serializable structured data.
  extractDom?: DomExtractor;
  // Optional: URL-aware suggestion chips. Return non-null array to override
  // the static `suggestions` for the current pathname.
  getSuggestionsForUrl?: (url: URL) => SkillSuggestion[] | null;
}

// Backward-compat alias — existing files use SiteIntegration. New skill
// files should declare `: Skill` for clarity.
export type SiteIntegration = Skill;
