import React, { useState } from 'react';
import { formatHash } from '../utils/crypto';

export default function BlindLiquidationConsole({ tickets, onLiquidate }) {
  const [liquidatingId, setLiquidatingId] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  const handleExecute = (ticket) => {
    setLiquidatingId(ticket.commitment);
    setTimeout(() => {
      setLiquidatingId(null);
      setSuccessNotice(`Blind Liquidation executed! ${ticket.collateralAmount} seized without revealing borrower identity.`);
      if (onLiquidate) onLiquidate(ticket.commitment);
    }, 1500);
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Institutional Blind Liquidation Console</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Liquidate subcollateralized positions via Vela TEE V-Socket Attestation & zkVerify.
          </p>
        </div>
        <span className="badge badge-danger">Blind Execution Mode</span>
      </div>

      {successNotice && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '18px',
          fontSize: '0.85rem',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          color: '#10b981',
        }}>
          {successNotice}
        </div>
      )}

      {tickets.length === 0 ? (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '12px',
          border: '1px dashed var(--border-subtle)'
        }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            No subcollateralized positions detected by the Vela TEE Enclave.
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
            All active institutional credit commitments remain healthy (Health Factor ≥ 1.00).
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tickets.map((t) => (
            <div
              key={t.commitment}
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                    HF: {t.healthFactor} (&lt; 1.0)
                  </span>
                  <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {formatHash(t.commitment)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    (Borrower Identity: 🔒 Blinded)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Seizable Collateral: <strong style={{ color: 'var(--text-primary)' }}>{t.collateralAmount} {t.collateralAsset}</strong></span>
                  <span>Required Repayment: <strong style={{ color: 'var(--text-primary)' }}>{t.debtAmount} {t.debtAsset}</strong></span>
                </div>
                <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  V-Socket Sig: {formatHash(t.signature)} • zkVerify ID: {formatHash(t.zkAggregationId)}
                </div>
              </div>

              <button
                className="btn btn-danger"
                onClick={() => handleExecute(t)}
                disabled={liquidatingId === t.commitment}
                style={{ fontSize: '0.85rem', padding: '10px 18px', whiteSpace: 'nowrap' }}
              >
                {liquidatingId === t.commitment ? 'Executing Liquidation...' : 'Liquidate Blind'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
