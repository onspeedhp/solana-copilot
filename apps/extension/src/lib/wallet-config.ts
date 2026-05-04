import {
  getCluster,
  getCustomRpc,
  setCluster as persistCluster,
  setCustomRpc as persistCustomRpc,
  type ClusterKind,
} from './storage';

// Default mainnet RPC URL is read from env at build time (VITE_DEFAULT_MAINNET_RPC).
// If not set, falls back to public mainnet endpoint (rate-limited).
// This keeps any private API keys out of source code — put them in .env.local.
const ENV_DEFAULT_MAINNET = (
  import.meta.env.VITE_DEFAULT_MAINNET_RPC ?? ''
).trim();
const PUBLIC_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

const PRESETS: Record<Exclude<ClusterKind, 'custom'>, string> = {
  mainnet: ENV_DEFAULT_MAINNET || PUBLIC_MAINNET_RPC,
  devnet: 'https://api.devnet.solana.com',
};

export function isMainnetCustomized(): boolean {
  return ENV_DEFAULT_MAINNET.length > 0;
}

export type RpcConfig = {
  read: string;
  write: string;
  cluster: ClusterKind;
};

let cached: RpcConfig | null = null;

export async function getRpcConfig(): Promise<RpcConfig> {
  if (cached) return cached;
  const cluster = (await getCluster()) ?? 'devnet';
  if (cluster === 'custom') {
    const custom = await getCustomRpc();
    const read = custom.read ?? PRESETS.mainnet;
    const write = custom.write ?? read;
    cached = { read, write, cluster };
    return cached;
  }
  cached = {
    read: PRESETS[cluster],
    write: PRESETS[cluster],
    cluster,
  };
  return cached;
}

export async function setRpcConfig(
  cluster: ClusterKind,
  customRead?: string | null,
  customWrite?: string | null,
): Promise<void> {
  await persistCluster(cluster);
  if (cluster === 'custom') {
    await persistCustomRpc(customRead ?? null, customWrite ?? null);
  }
  cached = null;
}

export function invalidateRpcCache(): void {
  cached = null;
}

export function isMainnetWrite(rpc: RpcConfig): boolean {
  return !rpc.write.includes('devnet') && !rpc.write.includes('testnet');
}

export function explorerUrlFor(sig: string, rpc: RpcConfig): string {
  if (rpc.write.includes('devnet')) {
    return `https://solscan.io/tx/${sig}?cluster=devnet`;
  }
  if (rpc.write.includes('testnet')) {
    return `https://solscan.io/tx/${sig}?cluster=testnet`;
  }
  return `https://solscan.io/tx/${sig}`;
}

export type { ClusterKind };
