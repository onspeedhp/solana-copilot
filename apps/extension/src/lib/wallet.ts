import bs58 from 'bs58';
import { getSolanaSecret, setSolanaSecret } from './storage';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidPubkey(s: string): boolean {
  return BASE58_RE.test(s.trim());
}

export function parseSecretKey(secret: string): Uint8Array {
  // Try base58 (Phantom export format)
  try {
    const bytes = bs58.decode(secret);
    if (bytes.length === 64) return bytes;
  } catch {
    // fall through
  }
  // Try JSON array (solana-keygen output)
  try {
    const arr = JSON.parse(secret);
    if (Array.isArray(arr) && arr.length === 64) {
      return new Uint8Array(arr);
    }
  } catch {
    // fall through
  }
  throw new Error(
    'Invalid secret key format (expected base58 64 bytes or JSON array of 64 numbers)',
  );
}

export function pubkeyFromSecret(secret: string): string | null {
  try {
    const bytes = parseSecretKey(secret);
    // Solana ed25519 secret = [seed (32) | pubkey (32)]
    const pubBytes = bytes.slice(32, 64);
    return bs58.encode(pubBytes);
  } catch {
    return null;
  }
}

export type WalletInfo = {
  pubkey: string;
};

export async function loadWallet(): Promise<WalletInfo | null> {
  const secret = await getSolanaSecret();
  if (!secret) return null;
  const derived = pubkeyFromSecret(secret);
  if (!derived) return null;
  return { pubkey: derived };
}

export async function saveWalletSecret(secret: string): Promise<string> {
  const trimmed = secret.trim();
  if (!trimmed) throw new Error('Secret is empty');
  // Validate by parsing — throws on invalid format
  parseSecretKey(trimmed);
  const derived = pubkeyFromSecret(trimmed);
  if (!derived) throw new Error('Could not derive pubkey from secret');
  await setSolanaSecret(trimmed);
  return derived;
}

export async function clearWallet(): Promise<void> {
  await setSolanaSecret(null);
}

export function shortPubkey(pubkey: string, n = 4): string {
  if (pubkey.length <= n * 2 + 1) return pubkey;
  return `${pubkey.slice(0, n)}…${pubkey.slice(-n)}`;
}
