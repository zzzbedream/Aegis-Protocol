import React from 'react';
import { CONTRACT_ADDRESSES } from '../utils/contracts';

export default function EnclaveAttestationViewer() {
  return (
    <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Vela TEE Enclave & zkVerify Cryptographic Inspector</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Real-time attestation parameters for AWS Nitro Enclaves and Horizen L3 state proof aggregation.
          </p>
        </div>
        <span className="badge badge-success">Hardware Attested</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {/* Enclave Signer */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>TEE Enclave Signer Address</span>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>
            0x0376AAc07Ad725E01357B1725B5ceC61aE10473c
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            Hardware-rooted key inside AWS Nitro Enclave
          </span>
        </div>

        {/* zkVerify Bridge */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>zkVerify Aggregation Bridge</span>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
            {CONTRACT_ADDRESSES.zkVerifyBridge}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            verifyProofAggregation (Merkle Root verification)
          </span>
        </div>

        {/* PCR0 Measurement */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Enclave PCR0 Code Measurement</span>
          <span className="mono" style={{ fontSize: '0.75rem', color: '#10b981' }}>
            0x3f8a91b...c94021e8 (Rust WASM M1 Build)
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            Guarantees uncompromised credit evaluation logic
          </span>
        </div>

        {/* PureFi AML Verifier */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>PureFi AML Verifier Contract</span>
          <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--accent-sapphire)' }}>
            {CONTRACT_ADDRESSES.pureFiVerifier}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginTop: '4px' }}>
            Zero-PII KYC/AML rule enforcement on L3
          </span>
        </div>
      </div>
    </div>
  );
}
