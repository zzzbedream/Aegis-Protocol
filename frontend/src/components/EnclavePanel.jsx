import React, { useEffect, useState } from 'react';
import { Panel } from './ui';

const PRODUCTION_TRUST = {
  subtitle: 'Horizen Vela runs the credit engine inside an AWS Nitro Enclave; its signing key is registered on-chain by the TeeAuthenticator (Nitro attestation, PCR0).',
  note: 'You trust: AWS Nitro hardware and the attested enclave image; the operator for availability; the Stork oracle for prices.',
};

const DEMO_TRUST = {
  subtitle: 'Testnet demo: the Vela executor is operated by the Aegis team without Nitro attestation. The TeeAuthenticator only checks that state updates are signed by the executor key it was configured with.',
  note: 'You trust: the Aegis team as operator (it could read positions and sign any state); the demo price feed, which publishes live ZEN/USD as the median of public exchange prices (Coinbase, OKX, KuCoin, CoinGecko). Production runs the same WASM on an attested Vela environment.',
};

/** What the user is trusting, stated plainly, with the values read on-chain. */
export default function EnclavePanel({ cfg, aegis }) {
  const [teeKey, setTeeKey] = useState(null);
  useEffect(() => {
    if (!aegis) return;
    aegis.teePublicKey().then(setTeeKey).catch(() => setTeeKey(null));
  }, [aegis]);
  const row = (k, v) => (
    <li style={{ padding: '4px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{k}: </span>
      <span className="mono" style={{ wordBreak: 'break-all' }}>{v || '—'}</span>
    </li>
  );
  const trust = cfg.demo.operator ? DEMO_TRUST : PRODUCTION_TRUST;
  return (
    <Panel testId="enclave-panel" title="Trust model" subtitle={trust.subtitle}>
      <ul style={{ listStyle: 'none', fontSize: '0.8rem' }}>
        {row('ProcessorEndpoint (custody)', cfg.processorEndpoint)}
        {row('TeeAuthenticator', cfg.teeAuthenticator)}
        {row('Application ID', cfg.applicationId?.toString())}
        {row('Enclave P-521 public key (on-chain)', teeKey)}
      </ul>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
        {trust.note} Not audited — do not use with real funds.
      </p>
    </Panel>
  );
}
