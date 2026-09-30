import React, { useEffect, useState } from 'react';
import { Panel } from './ui';
import { readPublicSolvency, solvencyView } from '../vela/solvency';

const REFRESH_MS = 60_000;

function Stat({ label, value, accent }) {
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: '1.05rem', marginTop: '4px', color: accent || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/** Live, wallet-less view of the public solvency report: aggregates only, never identities. */
export default function MarketPanel({ cfg }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const report = await readPublicSolvency(cfg);
        if (!cancelled) {
          setView(report ? solvencyView(report, cfg) : 'empty');
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e?.shortMessage || e?.message || String(e));
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [cfg]);

  const risky = view && view !== 'empty' && view.liquidatable !== '0 positions';
  return (
    <Panel testId="market-panel" title="Live market (public)"
      subtitle="Aggregates the enclave publishes on-chain after every price update. Anyone can verify them; no position or identity is revealed.">
      {error && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Public report unavailable: {error}</p>}
      {!error && !view && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Reading the latest report from the chain…</p>}
      {view === 'empty' && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No report published yet.</p>}
      {view && view !== 'empty' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          <Stat label="Supplied" value={view.supplied} />
          <Stat label="Borrowed" value={view.borrowed} />
          <Stat label="Available" value={view.available} />
          <Stat label="Utilization" value={view.utilization} />
          <Stat label="Borrow APR" value={view.borrowApr} accent="var(--accent-cyan)" />
          <Stat label="Collateral" value={view.collateral.join(' · ') || '—'} />
          <Stat label="Liquidatable" value={view.liquidatable} accent={risky ? 'var(--accent-rose)' : 'var(--accent-emerald)'} />
          <Stat label="Prices updated" value={view.priceAge} />
        </div>
      )}
    </Panel>
  );
}
