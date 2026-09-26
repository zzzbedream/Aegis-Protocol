import React, { useEffect, useState } from 'react';
import { Panel } from './ui';

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
  return (
    <Panel testId="enclave-panel" title="Trust model" subtitle="Horizen Vela runs the credit engine inside an AWS Nitro Enclave; its signing key is registered on-chain by the TeeAuthenticator (Nitro attestation, PCR0).">
      <ul style={{ listStyle: 'none', fontSize: '0.8rem' }}>
        {row('ProcessorEndpoint (custody)', cfg.processorEndpoint)}
        {row('TeeAuthenticator', cfg.teeAuthenticator)}
        {row('Application ID', cfg.applicationId?.toString())}
        {row('Enclave P-521 public key (on-chain)', teeKey)}
      </ul>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px' }}>
        You trust: AWS Nitro hardware and the attested enclave image; the operator for availability; the Stork oracle for prices.
        Not audited — do not use with real funds.
      </p>
    </Panel>
  );
}
