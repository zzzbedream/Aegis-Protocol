import React from 'react';
import { formatAddress } from '../utils/crypto';

export default function Navbar({ account, role, setRole, onConnectWallet }) {
  return (
    <header className="glass-panel" style={{
      padding: '16px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24px',
      borderRadius: '16px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #00f5d4 0%, #4361ee 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0, 245, 212, 0.3)'
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#040810" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            AEGIS <span style={{ color: 'var(--accent-cyan)' }}>PROTOCOL</span>
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Institutional Private Lending & Blind Liquidations
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Horizen L3 Badge */}
        <div className="badge badge-info" style={{ padding: '6px 12px' }}>
          <span className="pulse-dot" style={{ background: 'var(--accent-cyan)' }}></span>
          <span>Horizen L3 Rollup (Base OP Stack)</span>
        </div>

        {/* Role Selector */}
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,0.35)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)'
        }}>
          <button
            onClick={() => setRole('borrower')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'all 0.2s',
              background: role === 'borrower' ? 'var(--accent-sapphire)' : 'transparent',
              color: role === 'borrower' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Institutional Borrower
          </button>
          <button
            onClick={() => setRole('liquidator')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'all 0.2s',
              background: role === 'liquidator' ? 'var(--accent-rose)' : 'transparent',
              color: role === 'liquidator' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Blind Liquidator
          </button>
        </div>

        {/* Wallet Connect */}
        <button
          className="btn btn-secondary"
          onClick={onConnectWallet}
          style={{ fontSize: '0.85rem', padding: '8px 16px' }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
          {account ? formatAddress(account) : 'Connect Institutional Wallet'}
        </button>
      </div>
    </header>
  );
}
