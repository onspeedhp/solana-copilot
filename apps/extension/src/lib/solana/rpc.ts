import { getRpcConfig } from '../wallet-config';

const LAMPORTS_PER_SOL = 1_000_000_000;

type RpcResponse<T> = {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const { read } = await getRpcConfig();
  const res = await fetch(read, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = (await res.json()) as RpcResponse<T>;
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  if (json.result === undefined) {
    throw new Error(`RPC ${method}: no result`);
  }
  return json.result;
}

export async function getSolBalance(pubkey: string): Promise<number> {
  const result = await rpc<{ value: number }>('getBalance', [pubkey]);
  return result.value / LAMPORTS_PER_SOL;
}

export type TokenAccount = {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number;
};

type ParsedTokenInfo = {
  mint: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
  };
};

export async function getTokenAccounts(
  pubkey: string,
): Promise<TokenAccount[]> {
  const result = await rpc<{
    value: Array<{
      account: { data: { parsed: { info: ParsedTokenInfo } } };
    }>;
  }>('getTokenAccountsByOwner', [
    pubkey,
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { encoding: 'jsonParsed' },
  ]);
  const accounts: TokenAccount[] = [];
  for (const item of result.value) {
    const info = item.account.data.parsed.info;
    const ta = info.tokenAmount;
    const ui = ta.uiAmount ?? Number(ta.amount) / 10 ** ta.decimals;
    if (ui > 0) {
      accounts.push({
        mint: info.mint,
        amount: Number(ta.amount),
        decimals: ta.decimals,
        uiAmount: ui,
      });
    }
  }
  return accounts;
}

export type SignatureInfo = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
};

export async function getRecentSignatures(
  pubkey: string,
  limit = 10,
): Promise<SignatureInfo[]> {
  const result = await rpc<SignatureInfo[]>('getSignaturesForAddress', [
    pubkey,
    { limit },
  ]);
  return result;
}
