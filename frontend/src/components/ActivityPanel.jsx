import React, { useCallback, useEffect, useState } from 'react';
import { Panel, Notice } from './ui';
import { fromBaseUnits } from '../vela/instructions';

/** The user's own events, decrypted locally. The enclave never publishes these in clear. */
export default function ActivityPanel({ cfg, aegis, refreshKey }) {
  const [events, setEvents] = useState(null);
  const [claims, setClaims] = useState({});
  const [status, setStatus] = useState(null);
  const tokens = [cfg.assets.debt, ...cfg.assets.collateral];
  const bySymbol = Object.fromEntries(tokens.map((t) => [t.address?.toLowerCase(), t]));

  const load = useCallback(async () => {
    if (!aegis) return;
    try {
      setEvents(await aegis.myEvents());
      const c = {};
      for (const t of tokens) c[t.symbol] = await aegis.pendingClaims(t.address);
      setClaims(c);
    } catch (e) {
      setStatus({ type: 'error', message: `Could not read events: ${e?.message || e}` });
    }
  }, [aegis]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load, refreshKey]);

  const fmt = (ev, v) => {
    const t = bySymbol[(ev.token || '').toLowerCase()];
    return t ? `${fromBaseUnits(v, t.decimals)} ${t.symbol}` : v.toString();
  };

  return (
    <Panel testId="activity-panel" title="My private activity" subtitle="Decrypted in your browser with your wallet-derived P-521 key.">
      {!aegis && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Connect your wallet to decrypt your events.</p>}
      {aegis && events && events.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No events yet.</p>}
      {events && events.length > 0 && (
        <ul style={{ listStyle: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', maxHeight: '260px', overflowY: 'auto' }}>
          {events.map((ev, i) => (
            <li key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              #{ev.nonce ?? '?'} {ev.type}
              {ev.amount !== undefined && ` · ${fmt(ev, ev.amount)}`}
              {ev.seized !== undefined && ` · seized ${fmt(ev, ev.seized)}`}
              {ev.repaid !== undefined && ` · repaid ${fromBaseUnits(ev.repaid, cfg.assets.debt.decimals)} ${cfg.assets.debt.symbol}`}
            </li>
          ))}
        </ul>
      )}
      {aegis && (
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tokens.map((t) => (
            <button key={t.symbol} className="btn btn-secondary" disabled={!claims[t.symbol]}
              onClick={async () => {
                try {
                  await aegis.claim(t.address);
                  setStatus({ type: 'success', message: `${t.symbol} claimed to your wallet.` });
                  load();
                } catch (e) {
                  setStatus({ type: 'error', message: `Claim failed: ${e?.shortMessage || e?.message}` });
                }
              }}>
              Claim {claims[t.symbol] ? fromBaseUnits(claims[t.symbol], t.decimals) : '0'} {t.symbol}
            </button>
          ))}
          <button className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>
      )}
      <Notice status={status} />
    </Panel>
  );
}
