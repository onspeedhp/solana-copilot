// Skill auto-discovery loader.
//
// To add support for a new site, drop a single file `src/lib/skills/<name>.ts`
// that exports `export const skill: Skill = {...}`. This loader uses Vite's
// `import.meta.glob` to pick it up at build time — no edits to this file or
// any registry needed. See `_TEMPLATE.ts` and `README.md` in this folder.

import type { Skill } from './types';

// Vite's `import.meta.glob` matches files at build time. We skip the loader
// (`index.ts`), shared types (`types.ts`), and any file prefixed with `_`
// (e.g. `_TEMPLATE.ts`, draft files). Everything else that exports `skill`
// is treated as a contributor's site adapter.
const modules = import.meta.glob<{ skill?: Skill }>('./*.ts', {
  eager: true,
});

export const SKILLS: Skill[] = Object.entries(modules)
  .filter(([path]) => {
    const file = path.replace(/^\.\//, '');
    if (file === 'index.ts' || file === 'types.ts') return false;
    if (file.startsWith('_')) return false; // _TEMPLATE.ts and drafts
    return true;
  })
  .map(([path, m]) => {
    if (!m.skill) {
      console.warn(
        `[skills] ${path} has no exported \`skill\` — see _TEMPLATE.ts`,
      );
    }
    return m.skill;
  })
  .filter((s): s is Skill => Boolean(s));

export function getSkillForUrl(url: string | undefined): Skill | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const skill of SKILLS) {
    for (const domain of skill.domains) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return skill;
      }
    }
  }
  return null;
}

export function listSupportedSites(): Array<{
  id: string;
  name: string;
  domains: string[];
}> {
  return SKILLS.map((s) => ({ id: s.id, name: s.name, domains: s.domains }));
}

// Backward-compat aliases — existing callers across the codebase use these
// names. New code should prefer `Skill` and `getSkillForUrl`.
export const INTEGRATIONS = SKILLS;
export const getIntegrationForUrl = getSkillForUrl;
export type { Skill } from './types';
export type { Skill as SiteIntegration } from './types';
