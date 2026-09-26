import React from 'react';

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export default function Navbar({ account, role, setRole, onConnect, connecting, networkName, configured }) {
  const tab = (id, label, color) => (
    <button
      onClick={() => setRole(id)}
      style={{
        padding: '6px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
        background: role === id ? color : 'transparent', color: role === id ? '#ffffff' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );
  return (
    <header className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', borderRadius: '16px' }}>
      <div>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          AEGIS <span style={{ color: 'var(--accent-cyan)' }}>PROTOCOL</span>
        </h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confidential lending on Horizen Vela</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className={`badge ${configured ? 'badge-info' : 'badge-warning'}`}>{networkName}</span>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          {tab('borrower', 'Borrower / Lender', 'var(--accent-sapphire)')}
          {tab('liquidator', 'Liquidator', 'var(--accent-rose)')}
        </div>
        <button className="btn btn-secondary" onClick={onConnect} disabled={!configured || connecting || !!account} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
          {account ? short(account) : connecting ? 'Connecting…' : 'Connect wallet'}
        </button>
      </div>
    </header>
  );
}
