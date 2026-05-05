import { useEffect, useState } from 'react';
import { getSolPrice } from '../../lib/prices';
import { getSolBalance } from '../../lib/solana/rpc';

const REFRESH_INTERVAL_MS = 30_000;

export type WalletStats = {
  solBalance: number;
  solPriceUsd: number;
  usdValue: number;
  lastUpdated: number;
};

export type WalletStatsState = {
  stats: WalletStats | null;
  error: string | null;
  loading: boolean;
};

export function useWalletStats(pubkey: string | undefined): WalletStatsState {
  const [state, setState] = useState<WalletStatsState>({
    stats: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (!pubkey) {
      setState({ stats: null, error: null, loading: false });
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      if (!cancelled) {
        setState((prev) => ({ ...prev, loading: true }));
      }
      try {
        const [sol, price] = await Promise.all([
          getSolBalance(pubkey),
          getSolPrice().catch(() => 0),
        ]);
        if (cancelled) return;
        setState({
          stats: {
            solBalance: sol,
            solPriceUsd: price,
            usdValue: sol * price,
            lastUpdated: Date.now(),
          },
          error: null,
          loading: false,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = String(err);
        let friendly = msg;
        if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
          friendly = 'RPC blocked — try custom RPC';
        } else if (msg.includes('429')) {
          friendly = 'RPC rate-limited';
        } else if (msg.toLowerCase().includes('failed to fetch')) {
          friendly = 'RPC unreachable';
        }
        setState((prev) => ({
          stats: prev.stats,
          error: friendly,
          loading: false,
        }));
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);

    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [pubkey]);

  return state;
}
