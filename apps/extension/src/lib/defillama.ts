const POOLS_URL = 'https://yields.llama.fi/pools';

export type DefiPool = {
  project: string;
  symbol: string;
  apy: number;
  apyBase: number | null;
  apyReward: number | null;
  tvlUsd: number;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
};

type RawPool = {
  chain: string;
  project: string;
  symbol: string;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  tvlUsd: number | null;
  stablecoin: boolean | null;
  ilRisk: string | null;
  exposure: string | null;
};

let cachedPools: { data: DefiPool[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchSolanaPools(): Promise<DefiPool[]> {
  if (cachedPools && Date.now() - cachedPools.fetchedAt < CACHE_TTL_MS) {
    return cachedPools.data;
  }
  const res = await fetch(POOLS_URL);
  if (!res.ok) throw new Error(`Defillama ${res.status}`);
  const json = (await res.json()) as { data: RawPool[] };
  const solana = json.data
    .filter((p) => p.chain === 'Solana' && (p.apy ?? 0) > 0)
    .map((p) => ({
      project: p.project,
      symbol: p.symbol,
      apy: p.apy ?? 0,
      apyBase: p.apyBase,
      apyReward: p.apyReward,
      tvlUsd: p.tvlUsd ?? 0,
      stablecoin: p.stablecoin ?? false,
      ilRisk: p.ilRisk ?? 'unknown',
      exposure: p.exposure ?? 'unknown',
    }));
  cachedPools = { data: solana, fetchedAt: Date.now() };
  return solana;
}

export type GetYieldsArgs = {
  asset?: string;
  minTvl?: number;
  stablecoinOnly?: boolean;
};

export async function getDefiYields(args: GetYieldsArgs = {}) {
  const minTvl = args.minTvl ?? 100_000;
  const filterAsset =
    typeof args.asset === 'string' && args.asset.length > 0
      ? args.asset.toUpperCase()
      : null;
  const stablecoinOnly = args.stablecoinOnly === true;

  const all = await fetchSolanaPools();
  let pools = all.filter(
    (p) =>
      p.tvlUsd >= minTvl &&
      // Filter out absurdly high APYs (likely meme/manipulated)
      p.apy < 500,
  );
  if (stablecoinOnly) {
    pools = pools.filter((p) => p.stablecoin);
  }
  if (filterAsset) {
    pools = pools.filter((p) =>
      p.symbol.toUpperCase().split('-').includes(filterAsset),
    );
  }
  pools.sort((a, b) => b.apy - a.apy);
  const top = pools.slice(0, 10);
  return {
    pools: top,
    totalMatched: pools.length,
    minTvl,
    filterAsset,
    stablecoinOnly,
  };
}
