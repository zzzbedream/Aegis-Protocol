import { useEffect, useState } from 'react';
import { readPublicSolvency, readZenPrice, solvencyView } from '../vela/solvency';

const REFRESH_MS = 60_000;

/**
 * Live public data for the landing: the enclave's latest solvency report and the on-chain ZEN/USD
 * the enclave consumes. Both are read with a wallet-less RPC provider and refreshed every minute.
 */
export default function useLiveMarket(cfg, feedAddress) {
  const [state, setState] = useState({ view: null, price: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [report, price] = await Promise.all([readPublicSolvency(cfg), readZenPrice(cfg, feedAddress)]);
        if (cancelled) return;
        setState({ view: report ? solvencyView(report, cfg) : null, price, error: null });
      } catch (e) {
        if (!cancelled) setState((s) => ({ ...s, error: e?.shortMessage || e?.message || String(e) }));
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cfg, feedAddress]);

  return state;
}
