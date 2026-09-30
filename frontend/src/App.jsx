import React, { useState } from 'react';
import Navbar from './components/Navbar';
import BorrowerPanel from './components/BorrowerPanel';
import ActivityPanel from './components/ActivityPanel';
import LiquidatorPanel from './components/LiquidatorPanel';
import CompliancePanel from './components/CompliancePanel';
import EnclavePanel from './components/EnclavePanel';
import FaucetPanel from './components/FaucetPanel';
import MarketPanel from './components/MarketPanel';
import { Notice, EvidenceLinks } from './components/ui';
import { VELA_CONFIG, EVIDENCE_LINKS, missingConfig } from './vela/config';
import { connectAegis } from './vela/aegisClient';

export default function App() {
  const cfg = VELA_CONFIG;
  const missing = missingConfig(cfg);
  const configured = missing.length === 0;
  const [aegis, setAegis] = useState(null);
  const [role, setRole] = useState('borrower');
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [keyReady, setKeyReady] = useState(false);

  const connect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      const a = await connectAegis(cfg);
      setAegis(a);
      setKeyReady(a.isKeyRegistered());
    } catch (e) {
      setStatus({ type: 'error', message: e?.shortMessage || e?.message || String(e) });
    } finally {
      setConnecting(false);
    }
  };

  const registerKey = async () => {
    setStatus({ type: 'info', message: 'Registering your encryption key with the enclave…' });
    try {
      const res = await aegis.registerKey();
      setKeyReady(res.ok);
      setStatus(res.ok ? { type: 'success', message: 'Encryption key registered.' } : { type: 'error', message: `Key registration failed: ${res.error}` });
    } catch (e) {
      setStatus({ type: 'error', message: e?.shortMessage || e?.message || String(e) });
    }
  };

  const ready = aegis && keyReady ? aegis : null;
  const done = () => setRefreshKey((k) => k + 1);

  return (
    <div className="app-container">
      <Navbar account={aegis?.account} role={role} setRole={setRole} onConnect={connect} connecting={connecting}
        networkName={configured ? cfg.networkName : 'Not configured'} configured={configured} />

      {!configured && (
        <div data-testid="config-banner" className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', border: '1px solid var(--accent-rose)' }}>
          <b>Vela is not configured for this deployment.</b> Actions are disabled; no data shown here is simulated.
          Missing: <span className="mono">{missing.join(', ')}</span>. Vela is currently in early access on Base Sepolia.
          <EvidenceLinks links={EVIDENCE_LINKS} />
        </div>
      )}

      {configured && cfg.demo.operator && (
        <div data-testid="demo-banner" className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', border: '1px solid var(--accent-cyan)' }}>
          <b>Live testnet demo.</b> Aegis runs on Horizen testnet on a Vela environment operated by the Aegis team,
          <b> without AWS Nitro attestation</b> (the same WASM runs attested on Horizen&apos;s Vela environment). Prices come
          from a demo feed that publishes the live ZEN/USD rate. Test tokens only — nothing here has value.
          <EvidenceLinks links={EVIDENCE_LINKS} />
        </div>
      )}

      {aegis && !keyReady && (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
          One-time setup: register the encryption key derived from your wallet signature (ASSOCIATEKEY). Required to send
          encrypted instructions and to receive your private events.
          <div style={{ marginTop: '10px' }}>
            <button className="btn btn-primary" onClick={registerKey}>Register encryption key</button>
          </div>
        </div>
      )}
      <Notice status={status} />

      {configured && <MarketPanel cfg={cfg} />}
      {configured && cfg.demo.faucet && <FaucetPanel cfg={cfg} aegis={aegis} />}

      {role === 'borrower' ? (
        <div className="dashboard-grid">
          <div>
            <BorrowerPanel cfg={cfg} aegis={ready} onDone={done} />
            <CompliancePanel aegis={ready} />
          </div>
          <div>
            <ActivityPanel cfg={cfg} aegis={ready} refreshKey={refreshKey} />
          </div>
        </div>
      ) : (
        <LiquidatorPanel cfg={cfg} aegis={ready} onDone={done} />
      )}

      <EnclavePanel cfg={cfg} aegis={aegis} />
    </div>
  );
}
