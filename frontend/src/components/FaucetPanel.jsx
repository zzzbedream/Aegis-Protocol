import React, { useState } from 'react';
import { Panel, Notice, runAction } from './ui';

/** Testnet demo faucet: worthless aUSDC / tZEN so anyone can try the market (1 claim per day each). */
export default function FaucetPanel({ cfg, aegis }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const assets = [cfg.assets.debt, ...cfg.assets.collateral];

  const claim = async (asset) => {
    setBusy(true);
    await runAction(setStatus, `Faucet ${asset.symbol}`, () => aegis.faucet(asset.address));
    setBusy(false);
  };

  return (
    <Panel testId="faucet-panel" title="Test tokens" subtitle="Testnet only. Demo tokens have no value; each faucet can be used once a day per wallet. You also need a little testnet ETH for gas.">
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {assets.map((a) => (
          <button key={a.symbol} className="btn btn-secondary" disabled={!aegis || busy} onClick={() => claim(a)}>
            Get test {a.symbol}
          </button>
        ))}
      </div>
      <Notice status={status} />
    </Panel>
  );
}
