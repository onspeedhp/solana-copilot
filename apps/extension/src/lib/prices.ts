const PRICE_API = 'https://lite-api.jup.ag/price/v3';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const cache = new Map<string, { price: number; fetchedAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function fetchPrices(
  mints: string[],
): Promise<Record<string, number>> {
  if (mints.length === 0) return {};

  const now = Date.now();
  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const m of mints) {
    const cached = cache.get(m);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      out[m] = cached.price;
    } else {
      missing.push(m);
    }
  }
  if (missing.length === 0) return out;

  try {
    const url = `${PRICE_API}?ids=${missing.join(',')}`;
    const res = await fetch(url);
    if (!res.ok) return out;
    const data = (await res.json()) as Record<string, { usdPrice?: number }>;
    for (const [mint, info] of Object.entries(data)) {
      const price =
        info && typeof info === 'object' && typeof info.usdPrice === 'number'
          ? info.usdPrice
          : 0;
      out[mint] = price;
      cache.set(mint, { price, fetchedAt: now });
    }
  } catch (err) {
    console.warn('[prices] fetch failed', err);
  }
  return out;
}

export async function getSolPrice(): Promise<number> {
  const prices = await fetchPrices([SOL_MINT]);
  return prices[SOL_MINT] ?? 0;
}
