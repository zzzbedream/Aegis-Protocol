import React from 'react';

export default function InstitutionalAMLBadge({ amlStatus }) {
  const { isVerified, riskScore, ruleId, issuer, validUntil } = amlStatus;

  return (
    <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${isVerified ? '#10b981' : '#f59e0b'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isVerified ? '#10b981' : '#f59e0b'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>PureFi Institutional AML Compliance</span>
              <span className={`badge ${isVerified ? 'badge-success' : 'badge-warning'}`}>
                {isVerified ? 'VERIFIED (PASS)' : 'PENDING REVIEW'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Rule {ruleId}: Tier 1 Institutional Clearance • Zero-PII Cryptographic Proof
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', textAlign: 'right' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Risk Score</span>
            <span style={{ fontWeight: 700, color: riskScore <= 25 ? '#10b981' : '#ff0054', fontSize: '1rem' }}>
              {riskScore} / 100
            </span>
          </div>
          <div style={{ borderLeft: '1px solid var(--border-subtle)', paddingLeft: '16px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Authorized Issuer</span>
            <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {issuer}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
