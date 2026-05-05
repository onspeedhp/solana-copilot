// Token info (symbol, name, icon, decimals) lookup with cache.
// Source: Jupiter v2 search API.

const SEARCH_API = 'https://lite-api.jup.ag/tokens/v2/search?query=';

export type TokenInfo = {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
};

const HARDCODED: Record<string, TokenInfo> = {
  So11111111111111111111111111111111111111112: {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9,
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6,
  },
};

const cache = new Map<string, TokenInfo>(Object.entries(HARDCODED));
const inflight = new Map<string, Promise<TokenInfo | null>>();

export function getCachedToken(mint: string): TokenInfo | null {
  return cache.get(mint) ?? null;
}

export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  const cached = cache.get(mint);
  if (cached) return cached;
  const inflightReq = inflight.get(mint);
  if (inflightReq) return inflightReq;

  const promise = (async (): Promise<TokenInfo | null> => {
    try {
      const res = await fetch(`${SEARCH_API}${encodeURIComponent(mint)}`);
      if (!res.ok) return null;
      const list = (await res.json()) as Array<{
        id: string;
        symbol: string;
        name: string;
        icon?: string;
        decimals: number;
      }>;
      const found = list.find((t) => t.id === mint) ?? list[0];
      if (!found || found.id !== mint) return null;
      const info: TokenInfo = {
        mint: found.id,
        symbol: found.symbol,
        name: found.name,
        icon: found.icon ?? null,
        decimals: found.decimals,
      };
      cache.set(mint, info);
      return info;
    } catch {
      return null;
    } finally {
      inflight.delete(mint);
    }
  })();

  inflight.set(mint, promise);
  return promise;
}
