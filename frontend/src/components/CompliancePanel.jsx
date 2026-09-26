import React, { useState } from 'react';
import { Panel, Field, Notice, inputStyle, runAction } from './ui';

/** PureFi v5 screening, verified inside the enclave when the market enables AML. */
export default function CompliancePanel({ aegis }) {
  const [payload, setPayload] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel testId="compliance-panel" title="Compliance (PureFi)"
      subtitle="If the market requires AML, paste the PureFi v5 payload issued for your wallet. It is verified inside the enclave; exits (repay, withdraw) never require it.">
      <Field label="PUREFI PAYLOAD (0x…)">
        <textarea value={payload} onChange={(e) => setPayload(e.target.value.trim())} rows={3} style={{ ...inputStyle, fontSize: '0.75rem' }} />
      </Field>
      <Notice status={status} />
      <button className="btn btn-secondary" disabled={!aegis || busy || !payload} style={{ width: '100%' }}
        onClick={async () => {
          setBusy(true);
          await runAction(setStatus, 'PureFi screening', () => aegis.process('screen', { payload }));
          setBusy(false);
        }}>
        Submit screening
      </button>
    </Panel>
  );
}
