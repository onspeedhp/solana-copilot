import type { Skill } from './types';

// Drift's public APIs (dlob, data) require auth or have changed.
// For MVP we only set up site detection — no remote tools yet.
// Real Drift integration needs the SDK or signed RPC calls (Phase 2).

export const skill: Skill = {
  id: 'drift',
  name: 'Drift',
  domains: ['drift.trade', 'app.drift.trade'],
  systemPromptHint: [
    'User is on Drift, a Solana perpetuals + spot trading protocol.',
    'No Drift-specific tools are wired yet (their public APIs require auth or SDK access).',
    'For now, you can still help with general questions about the user wallet (balance, holdings) using wallet tools.',
    'If user asks for Drift-specific data (markets, funding rates, positions), tell them this integration is pending and suggest checking app.drift.trade directly.',
  ].join('\n'),
  suggestions: [
    { icon: 'dollar', text: "What's my SOL balance?" },
    { icon: 'search', text: 'Token holdings' },
    { icon: 'bar-chart', text: 'Recent transactions' },
  ],
  tools: [],
};
