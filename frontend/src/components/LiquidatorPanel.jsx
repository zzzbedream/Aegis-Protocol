import React, { useCallback, useEffect, useState } from 'react';
import { Panel, Field, Notice, inputStyle, runAction } from './ui';
import { fromBaseUnits, toBaseUnits } from '../vela/instructions';

/**
 * Liquidators never see or pick a borrower. They read the public aggregate solvency report and
 * send a `liquidate` instruction with the repayment attached; the enclave applies it to the
 * worst position below HF 1.0 holding that collateral.
 */
export default function LiquidatorPanel({ cfg, aegis, onDone }) {
  const debt = cfg.assets.debt;
  const coll = cfg.assets.collateral[0];
  const [report, setReport] = useState(null);
  const [maxRepay, setMaxRepay] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!aegis) return;
    try {
      setReport(await aegis.latestSolvency());
    } catch (e) {
      setStatus({ type: 'error', message: `Could not read the solvency report: ${e?.message || e}` });
    }
  }, [aegis]);
  useEffect(() => { load(); }, [load]);

  const fmtDebt = (v) => `${fromBaseUnits(v, debt.decimals)} ${debt.symbol}`;

  return (
    <Panel testId="liquidator-panel" title="Blind liquidation" subtitle="You never learn which account you liquidate. Only aggregates are public."
      badge={<span className="badge badge-danger">No borrower identity</span>}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginBottom: '14px' }}>
        {!aegis && <p style={{ color: 'var(--text-muted)' }}>Connect your wallet to read the latest solvency report.</p>}
        {aegis && !report && <p style={{ color: 'var(--text-muted)' }}>No solvency report published yet. Request one with “Refresh prices & report”.</p>}
        {report && (
          <ul style={{ listStyle: 'none', lineHeight: 1.8 }}>
            <li>Liquidatable positions: <b>{report.liquidatableCount}</b> · debt {fmtDebt(report.liquidatableDebt)}</li>
            <li>Total lender assets: {fmtDebt(report.totalAssets)} · cash {fmtDebt(report.cash)}</li>
            <li>Total debt: {fmtDebt(report.totalDebt)} · reserves {fmtDebt(report.reserves)} · bad debt {fmtDebt(report.badDebt)}</li>
            <li>Utilization: {(report.utilizationBps / 100).toFixed(2)}% · borrow APR {(report.borrowAprBps / 100).toFixed(2)}%</li>
            <li>Prices as of: {report.lastPriceTimestamp ? new Date(report.lastPriceTimestamp * 1000).toISOString() : 'never'}</li>
          </ul>
        )}
      </div>
      <button className="btn btn-secondary" disabled={!aegis || busy} style={{ marginBottom: '16px' }}
        onClick={async () => {
          setBusy(true);
          await runAction(setStatus, 'Price refresh & solvency report', () => aegis.process('poke', {}));
          setBusy(false);
          load();
        }}>
        Refresh prices & report
      </button>
      <Field label={`MAX REPAYMENT (${debt.symbol}) — attached as a deposit; unused funds stay in your idle balance`}>
        <input value={maxRepay} onChange={(e) => setMaxRepay(e.target.value)} placeholder="0.00" inputMode="decimal" style={inputStyle} />
      </Field>
      <Notice status={status} />
      <button className="btn btn-danger" disabled={!aegis || busy || !maxRepay} style={{ width: '100%', padding: '12px' }}
        onClick={async () => {
          let units;
          try {
            units = toBaseUnits(maxRepay, debt.decimals);
          } catch (e) {
            setStatus({ type: 'error', message: `Invalid amount: ${e.message}` });
            return;
          }
          setBusy(true);
          await runAction(setStatus, `Liquidate against ${coll.symbol}`, () =>
            aegis.process('liquidate', { token: coll.address, maxRepay: units }, { token: debt.address, amount: units }));
          setBusy(false);
          onDone?.();
          load();
        }}>
        Liquidate (seize {coll.symbol} at a discount)
      </button>
    </Panel>
  );
}
