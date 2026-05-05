import { useEffect, useState } from 'react';
import { getCachedToken, getTokenInfo, type TokenInfo } from '../../lib/tokens';

export function useTokenInfo(mint: string | undefined): TokenInfo | null {
  const [info, setInfo] = useState<TokenInfo | null>(() =>
    mint ? getCachedToken(mint) : null,
  );
  useEffect(() => {
    if (!mint) {
      setInfo(null);
      return;
    }
    const cached = getCachedToken(mint);
    if (cached) {
      setInfo(cached);
      return;
    }
    let cancelled = false;
    void getTokenInfo(mint).then((t) => {
      if (!cancelled) setInfo(t);
    });
    return () => {
      cancelled = true;
    };
  }, [mint]);
  return info;
}
