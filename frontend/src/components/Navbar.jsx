import React from 'react';

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export default function Navbar({ account, role, setRole, onConnect, connecting, networkName, configured }) {
  const tab = (id, label, color) => (
    <button
      onClick={() => setRole(id)}
      style={{
        padding: '7px 14px', border: 0, borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
        background: role === id ? color : 'transparent', color: role === id ? 'var(--stock)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );
  return (
    <header className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
      <div>
        <a href="/" style={{ textDecoration: 'none' }}>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.08em' }}>
            AEGIS PROTOCOL <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>// APP</span>
          </h1>
        </a>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Confidential lending on Horizen Vela</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className={`badge ${configured ? 'badge-info' : 'badge-warning'}`}>{networkName}</span>
        <div style={{ display: 'flex', padding: 0, border: '1px solid var(--ink)' }}>
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
