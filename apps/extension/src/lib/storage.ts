import type { Message } from '../types';

const KEY_MESSAGES_PREFIX = 'messages:';
const KEY_ANTHROPIC_API_KEY = 'anthropicApiKey';
const KEY_OAUTH_TOKENS = 'anthropicOAuthTokens';
const KEY_OAUTH_PKCE = 'anthropicOAuthPkce'; // pending PKCE state during login flow
const KEY_PUBKEY = 'solanaPubkey';
const KEY_SECRET = 'solanaSecret';
const KEY_CLUSTER = 'solanaCluster';
const KEY_RPC_READ = 'solanaRpcRead';
const KEY_RPC_WRITE = 'solanaRpcWrite';
const KEY_LLMS_CACHE_PREFIX = 'llmsCache:';
const LLMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type ClusterKind = 'mainnet' | 'devnet' | 'custom';

const ENV_ANTHROPIC_API_KEY = (
  import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
).trim();

export async function getMessages(scope: string): Promise<Message[]> {
  const key = `${KEY_MESSAGES_PREFIX}${scope}`;
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  return Array.isArray(value) ? (value as Message[]) : [];
}

export async function setMessages(
  scope: string,
  messages: Message[],
): Promise<void> {
  await chrome.storage.local.set({
    [`${KEY_MESSAGES_PREFIX}${scope}`]: messages,
  });
}

export async function getAnthropicApiKey(): Promise<string | null> {
  if (ENV_ANTHROPIC_API_KEY) return ENV_ANTHROPIC_API_KEY;
  const result = await chrome.storage.local.get(KEY_ANTHROPIC_API_KEY);
  const value = result[KEY_ANTHROPIC_API_KEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function isApiKeyFromEnv(): boolean {
  return ENV_ANTHROPIC_API_KEY.length > 0;
}

export async function setAnthropicApiKey(key: string | null): Promise<void> {
  if (!key) {
    await chrome.storage.local.remove(KEY_ANTHROPIC_API_KEY);
  } else {
    await chrome.storage.local.set({ [KEY_ANTHROPIC_API_KEY]: key });
  }
}

export type StoredOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export async function getOAuthTokens(): Promise<StoredOAuthTokens | null> {
  const result = await chrome.storage.local.get(KEY_OAUTH_TOKENS);
  const v = result[KEY_OAUTH_TOKENS] as Partial<StoredOAuthTokens> | undefined;
  if (
    !v ||
    typeof v.accessToken !== 'string' ||
    typeof v.refreshToken !== 'string' ||
    typeof v.expiresAt !== 'number'
  ) {
    return null;
  }
  return {
    accessToken: v.accessToken,
    refreshToken: v.refreshToken,
    expiresAt: v.expiresAt,
  };
}

export async function setOAuthTokens(
  tokens: StoredOAuthTokens | null,
): Promise<void> {
  if (!tokens) {
    await chrome.storage.local.remove(KEY_OAUTH_TOKENS);
  } else {
    await chrome.storage.local.set({ [KEY_OAUTH_TOKENS]: tokens });
  }
}

export type StoredPkce = { verifier: string; state: string };

export async function getPendingPkce(): Promise<StoredPkce | null> {
  const result = await chrome.storage.local.get(KEY_OAUTH_PKCE);
  const v = result[KEY_OAUTH_PKCE] as Partial<StoredPkce> | undefined;
  if (!v || typeof v.verifier !== 'string' || typeof v.state !== 'string') {
    return null;
  }
  return { verifier: v.verifier, state: v.state };
}

export async function setPendingPkce(pkce: StoredPkce | null): Promise<void> {
  if (!pkce) {
    await chrome.storage.local.remove(KEY_OAUTH_PKCE);
  } else {
    await chrome.storage.local.set({ [KEY_OAUTH_PKCE]: pkce });
  }
}

export async function getSolanaPubkey(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEY_PUBKEY);
  const value = result[KEY_PUBKEY];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function setSolanaPubkey(pubkey: string | null): Promise<void> {
  if (!pubkey) {
    await chrome.storage.local.remove(KEY_PUBKEY);
  } else {
    await chrome.storage.local.set({ [KEY_PUBKEY]: pubkey });
  }
}

export async function getSolanaSecret(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEY_SECRET);
  const value = result[KEY_SECRET];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function setSolanaSecret(secret: string | null): Promise<void> {
  if (!secret) {
    await chrome.storage.local.remove(KEY_SECRET);
  } else {
    await chrome.storage.local.set({ [KEY_SECRET]: secret });
  }
}

export async function getCluster(): Promise<ClusterKind | null> {
  const result = await chrome.storage.local.get(KEY_CLUSTER);
  const value = result[KEY_CLUSTER];
  if (value === 'mainnet' || value === 'devnet' || value === 'custom') {
    return value;
  }
  return null;
}

export async function setCluster(cluster: ClusterKind): Promise<void> {
  await chrome.storage.local.set({ [KEY_CLUSTER]: cluster });
}

export async function getCustomRpc(): Promise<{
  read: string | null;
  write: string | null;
}> {
  const result = await chrome.storage.local.get([KEY_RPC_READ, KEY_RPC_WRITE]);
  return {
    read: typeof result[KEY_RPC_READ] === 'string' ? result[KEY_RPC_READ] : null,
    write:
      typeof result[KEY_RPC_WRITE] === 'string' ? result[KEY_RPC_WRITE] : null,
  };
}

export async function setCustomRpc(
  read: string | null,
  write: string | null,
): Promise<void> {
  const updates: Record<string, string> = {};
  const removes: string[] = [];
  if (read) updates[KEY_RPC_READ] = read;
  else removes.push(KEY_RPC_READ);
  if (write) updates[KEY_RPC_WRITE] = write;
  else removes.push(KEY_RPC_WRITE);
  if (Object.keys(updates).length > 0) await chrome.storage.local.set(updates);
  if (removes.length > 0) await chrome.storage.local.remove(removes);
}

type CachedLlmsTxt = { content: string; fetchedAt: number };

export async function getCachedLlmsTxt(domain: string): Promise<string | null> {
  const key = `${KEY_LLMS_CACHE_PREFIX}${domain}`;
  const result = await chrome.storage.local.get(key);
  const cached = result[key] as Partial<CachedLlmsTxt> | undefined;
  if (
    !cached ||
    typeof cached.content !== 'string' ||
    typeof cached.fetchedAt !== 'number'
  ) {
    return null;
  }
  if (Date.now() - cached.fetchedAt > LLMS_CACHE_TTL_MS) return null;
  return cached.content;
}

export async function setCachedLlmsTxt(
  domain: string,
  content: string,
): Promise<void> {
  const key = `${KEY_LLMS_CACHE_PREFIX}${domain}`;
  await chrome.storage.local.set({
    [key]: { content, fetchedAt: Date.now() },
  });
}

export async function setCachedLlmsTxtMissing(domain: string): Promise<void> {
  const key = `${KEY_LLMS_CACHE_PREFIX}${domain}`;
  await chrome.storage.local.set({
    [key]: { content: '', fetchedAt: Date.now() },
  });
}
