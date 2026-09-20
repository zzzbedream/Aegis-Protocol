import React, { useState } from 'react';

export default function HealthFactorWidget({ position }) {
  const [hideBalances, setHideBalances] = useState(true);

  const healthFactor = position?.healthFactor || 1.48;
  const isHealthy = healthFactor >= 1.0;

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Confidential Health Factor</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Vela TEE Enclave Hardware-Attested State
          </p>
        </div>
        <button
          onClick={() => setHideBalances(!hideBalances)}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            padding: '4px 10px',
            cursor: 'pointer'
          }}
        >
          {hideBalances ? 'Reveal Local' : 'Hide Balances'}
        </button>
      </div>

      {/* Health Factor Display */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.4)',
        borderRadius: '14px',
        padding: '20px',
        textAlign: 'center',
        border: '1px solid var(--border-subtle)',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
          CONFIDENTIAL HEALTH FACTOR (HF)
        </div>
        <div style={{
          fontSize: '2.4rem',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
          color: isHealthy ? '#10b981' : '#ff0054',
          letterSpacing: '-0.02em'
        }}>
          {healthFactor.toFixed(2)}
        </div>
        <div style={{ display: 'inline-block', marginTop: '6px' }}>
          <span className={`badge ${isHealthy ? 'badge-success' : 'badge-danger'}`}>
            {isHealthy ? '● SAFE FROM LIQUIDATION' : '▲ AT RISK OF BLIND LIQUIDATION'}
          </span>
        </div>
      </div>

      {/* Position Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Collateral Deposited</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {hideBalances ? '•••••••• ZEN' : `${position?.collateralAmount || '1,000.00'} ZEN`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Confidential Debt</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {hideBalances ? '•••••••• USDC' : `$${position?.debtAmount || '6,500.00'} USDC`}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Liquidation Threshold</span>
          <span style={{ fontWeight: 600 }}>80.00%</span>
        </div>
      </div>

      <div style={{
        marginTop: '18px',
        paddingTop: '14px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)'
      }}>
        🔒 Only your local client and the Horizen Vela TEE can evaluate your solvency. Public RPC nodes only see the blind commitment hash.
      </div>
    </div>
  );
}
