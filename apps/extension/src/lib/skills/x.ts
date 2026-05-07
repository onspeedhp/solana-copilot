import type { Skill } from './types';

// X / Twitter integration. The actual interaction tools (xPostTweet, xLikeTweet,
// xReplyTweet, xRetweetTweet, xExtractCurrentTweet, extractTweets) are wallet-
// level tools (always available to the AI) so they can be reasoned about
// before the user is on x.com. This integration adds suggestions + hint.
export const skill: Skill = {
  id: 'x',
  name: 'X',
  domains: ['x.com', 'twitter.com'],
  systemPromptHint: [
    'User is on X (twitter.com).',
    'For posting use xPostTweet (single approval, opens compose + fills + clicks Post).',
    'For replying use xReplyTweet on a /status/ permalink page.',
    'For retweeting use xRetweetTweet (clicks repost menu).',
    'For liking use xLikeTweet on a /status/ page.',
    'For reading the focused tweet on /status/ use xExtractCurrentTweet — gives metrics including replies, reposts, likes, bookmarks (views are sometimes null).',
    'For reading a feed/timeline (home, profile, search) use extractTweets — returns up to 30 tweets.',
    'NEVER invent tweet content, author handles, or metric numbers — use exact values from the tool results.',
  ].join('\n'),
  suggestions: [
    { icon: 'search', text: 'Summarize my timeline' },
    { icon: 'send', text: 'Draft a tweet' },
    { icon: 'trending', text: "What's trending now" },
  ],
  tools: [],
  getSuggestionsForUrl: (url) => {
    const path = url.pathname;
    // Tweet permalink: /<handle>/status/<id>
    if (/\/status\/\d+/.test(path)) {
      return [
        { icon: 'search', text: 'Summarize this tweet thread' },
        { icon: 'send', text: 'Draft a clever reply' },
        { icon: 'trending', text: 'Repost this' },
      ];
    }
    // Compose: /compose/post
    if (path.startsWith('/compose/')) {
      return [
        { icon: 'send', text: 'Draft something for me to post' },
      ];
    }
    // Search: /search?q=
    if (path.startsWith('/search')) {
      const q = url.searchParams.get('q');
      return [
        { icon: 'search', text: q ? `Summarize "${q}" results` : 'Summarize search' },
        { icon: 'trending', text: 'Top tweets here' },
      ];
    }
    // Notifications
    if (path.startsWith('/notifications')) {
      return [
        { icon: 'search', text: 'Summarize my notifications' },
      ];
    }
    // Home
    if (path === '/home' || path === '/') {
      return [
        { icon: 'send', text: 'Draft a tweet for me' },
        { icon: 'search', text: 'Summarize my timeline' },
        { icon: 'trending', text: "What's trending in my feed" },
      ];
    }
    // Profile: /<handle>
    const profileMatch = path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (profileMatch) {
      const handle = profileMatch[1];
      return [
        { icon: 'search', text: `Summarize @${handle}'s recent posts` },
        { icon: 'bar-chart', text: `Engagement on @${handle}'s pinned post` },
        { icon: 'send', text: `Draft a tweet about @${handle}` },
      ];
    }
    return null;
  },
};
