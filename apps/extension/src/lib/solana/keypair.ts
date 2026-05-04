import type { Keypair } from '@solana/web3.js';
import { getSolanaSecret } from '../storage';
import { parseSecretKey } from '../wallet';

let cachedKeypair: { secret: string; keypair: Keypair } | null = null;

export async function loadKeypair(): Promise<Keypair | null> {
  const secret = await getSolanaSecret();
  if (!secret) return null;
  if (cachedKeypair && cachedKeypair.secret === secret) {
    return cachedKeypair.keypair;
  }
  try {
    const { Keypair } = await import('@solana/web3.js');
    const bytes = parseSecretKey(secret);
    const kp = Keypair.fromSecretKey(bytes);
    cachedKeypair = { secret, keypair: kp };
    return kp;
  } catch (err) {
    console.error('[keypair] failed to load', err);
    return null;
  }
}

export function invalidateKeypairCache(): void {
  cachedKeypair = null;
}

export async function hasSecretKey(): Promise<boolean> {
  const secret = await getSolanaSecret();
  return !!secret;
}
