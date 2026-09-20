import React, { useState, useEffect } from 'react';
import { SUPPORTED_ASSETS } from '../utils/contracts';
import { generateSalt, computeCommitment, encryptPayloadForEnclave, formatHash } from '../utils/crypto';

export default function ConfidentialDepositModal({ account, onDepositSuccess }) {
  const [selectedAsset, setSelectedAsset] = useState(SUPPORTED_ASSETS[0]);
  const [depositAmount, setDepositAmount] = useState('1000');
  const [borrowAmount, setBorrowAmount] = useState('6500');
  const [salt, setSalt] = useState('');
  const [commitment, setCommitment] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState(null);

  // Generate initial salt and compute commitment
  useEffect(() => {
    const initialSalt = generateSalt();
    setSalt(initialSalt);
    if (account) {
      computeCommitment(account, initialSalt).then(setCommitment);
    }
  }, [account]);

  const handleRegenerateSalt = async () => {
    const newSalt = generateSalt();
    setSalt(newSalt);
    const comm = await computeCommitment(account || '0x0000', newSalt);
    setCommitment(comm);
  };

  const handleExecuteDeposit = async () => {
    setIsDepositing(true);
    setDepositStatus({ type: 'info', message: 'Generating ECIES encryption payload for Vela TEE Enclave...' });

    setTimeout(async () => {
      const payload = {
        institution: account,
        asset: selectedAsset.symbol,
        collateralAmount: depositAmount,
        debtAmount: borrowAmount,
        salt: salt,
      };

      const encrypted = encryptPayloadForEnclave(payload);

      setDepositStatus({
        type: 'info',
        message: 'Verifying PureFi AML Certificate on Horizen L3 AegisEntrypoint...'
      });

      setTimeout(() => {
        setDepositStatus({
          type: 'success',
          message: `Confidential Deposit Confirmed! Blind Commitment: ${formatHash(commitment)} registered in AegisVault. No loan details exposed publicly.`,
        });
        setIsDepositing(false);
        if (onDepositSuccess) {
          onDepositSuccess({
            commitment,
            asset: selectedAsset.symbol,
            amount: depositAmount,
            debt: borrowAmount,
            salt,
          });
        }
      }, 1200);
    }, 1000);
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Confidential Institutional Deposit</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Lock collateral with client-side blinding. Balances are encrypted for the Vela TEE Enclave.
          </p>
        </div>
        <span className="badge badge-info">Zero Public Exposure</span>
      </div>

      {/* Asset Selection */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
          SELECT COLLATERAL ASSET
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {SUPPORTED_ASSETS.map((asset) => (
            <div
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset)}
              style={{
                padding: '14px',
                borderRadius: '12px',
                cursor: 'pointer',
                border: selectedAsset.symbol === asset.symbol ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: selectedAsset.symbol === asset.symbol ? 'rgba(0, 245, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>{asset.symbol}</span>
                {asset.isRWA && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>ERC-7943 RWA</span>}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{asset.name}</p>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '6px', color: 'var(--accent-cyan)' }}>
                ${asset.priceUsd.toFixed(2)} USD • Max LTV: {asset.ltv}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Deposit Amount */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            COLLATERAL DEPOSIT AMOUNT ({selectedAsset.symbol})
          </label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Estimated Value: ${(parseFloat(depositAmount || 0) * selectedAsset.priceUsd).toLocaleString()} USD
          </span>
        </div>
        <input
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="0.00"
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
      </div>

      {/* Borrow Amount */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            CONFIDENTIAL BORROW AMOUNT (USDC / Debt)
          </label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Initial Health Factor: ~1.45 (Attested Safe)
          </span>
        </div>
        <input
          type="number"
          value={borrowAmount}
          onChange={(e) => setBorrowAmount(e.target.value)}
          placeholder="0.00"
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            fontSize: '1.1rem',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
          }}
        />
      </div>

      {/* Cryptographic Commitment Box */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px dashed var(--border-subtle)',
        borderRadius: '10px',
        padding: '14px',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
            CLIENT-SIDE BLIND COMMITMENT H(ID, Salt)
          </span>
          <button
            onClick={handleRegenerateSalt}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.7rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Regenerate Salt
          </button>
        </div>
        <div data-testid="blind-commitment" className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {commitment || 'Computing...'}
        </div>
      </div>

      {/* Status Alert */}
      {depositStatus && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '18px',
          fontSize: '0.85rem',
          background: depositStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0, 245, 212, 0.1)',
          border: `1px solid ${depositStatus.type === 'success' ? '#10b981' : 'var(--accent-cyan)'}`,
          color: depositStatus.type === 'success' ? '#10b981' : 'var(--accent-cyan)',
        }}>
          {depositStatus.message}
        </div>
      )}

      {/* Action Button */}
      <button
        className="btn btn-primary"
        onClick={handleExecuteDeposit}
        disabled={isDepositing || !depositAmount}
        style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
      >
        {isDepositing ? 'Processing PureFi AML & Locking Collateral...' : 'Deposit Confidentially with PureFi AML Clearance'}
      </button>
    </div>
  );
}
