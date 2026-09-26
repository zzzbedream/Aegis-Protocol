import React from 'react';

export const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(0, 0, 0, 0.4)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

export function Panel({ title, subtitle, badge, children, testId }) {
  return (
    <section className="glass-panel" style={{ padding: '22px', marginBottom: '20px' }} data-testid={testId}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '12px' }}>
      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{label}</span>
      {children}
    </label>
  );
}

export function Notice({ status }) {
  if (!status) return null;
  const ok = status.type === 'success';
  const err = status.type === 'error';
  const color = ok ? '#10b981' : err ? 'var(--accent-rose)' : 'var(--accent-cyan)';
  return (
    <div role="status" style={{ padding: '10px 14px', borderRadius: '10px', margin: '12px 0', fontSize: '0.85rem', border: `1px solid ${color}`, color, wordBreak: 'break-word' }}>
      {status.message}
    </div>
  );
}

/** Runs an async action and reports the on-chain result of the Vela request. */
export async function runAction(setStatus, label, fn) {
  setStatus({ type: 'info', message: `${label}: encrypting and submitting…` });
  try {
    const res = await fn();
    if (res && res.ok === false) {
      setStatus({ type: 'error', message: `${label} rejected by the enclave: ${res.error || 'unknown error'} (request ${res.requestId})` });
    } else {
      setStatus({ type: 'success', message: `${label} completed${res?.requestId ? ` (request ${res.requestId})` : ''}.` });
    }
    return res;
  } catch (e) {
    setStatus({ type: 'error', message: `${label} failed: ${e?.shortMessage || e?.message || String(e)}` });
    return null;
  }
}
