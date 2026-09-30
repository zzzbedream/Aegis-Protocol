import React from 'react';
import { contracts, deployed, links, addressUrl, short } from './facts';

function Exhibit({ id, n, title, children, margin }) {
  return (
    <section id={id} className="d-exhibit">
      <div className="wrap d-grid">
        <div>
          <p className="caps muted">Proof record // {n}</p>
          <h2>{title}</h2>
          {children}
        </div>
        <aside className="d-margin">{margin}</aside>
      </div>
    </section>
  );
}

const Ext = ({ href, children, className = 'link' }) => (
  <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
);

const comparison = [
  ['Debt size', 'Public on-chain', 'Private — enclave state, encrypted at rest'],
  ['Collateral composition', 'Public to any explorer', 'Private'],
  ['Health factor', 'Scrapeable in real time', 'Computed inside the enclave, never published'],
  ['Identity of the liquidated borrower', 'Emitted in the liquidation event', 'Never named — not even to the liquidator'],
  ['Solvency', 'Readable account by account', 'Public aggregates after every price update'],
  ['Deposits and withdrawals', 'Public', 'Public — by design of Vela custody'],
];

export function ExhibitA() {
  return (
    <Exhibit id="exhibits" n="01" title="EXHIBIT A — What breaks without privacy"
      margin={<>
        <p className="caps muted">Marginal note</p>
        <p className="d-note">Deposits and withdrawals stay public. Correlating their timing with internal events is a declared residual risk (ADR-001 §4).</p>
      </>}>
      <p className="prose">
        On transparent lending markets every account&apos;s health factor is public. That turns large positions into
        targets: liquidation hunting, copied leverage and leaked strategy. A borrower with a reputation to protect
        stays off-chain.
      </p>
      <div className="d-scroll">
        <table className="d-table">
          <thead><tr><th>Data point</th><th>Aave / Compound</th><th className="ok">Aegis (Horizen Vela)</th></tr></thead>
          <tbody>
            {comparison.map(([k, pub, priv], i) => (
              <tr key={k}>
                <td className="m" style={{ fontWeight: 700 }}>{k}</td>
                <td className={`m ${i < 5 ? 'warn' : 'muted'}`}>{pub}</td>
                <td className={`m ${i < 5 ? 'ok' : 'muted'}`}>{priv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Exhibit>
  );
}

const steps = [
  ['Encrypted instruction', 'The browser derives a P-521 key from a wallet signature and encrypts every instruction to the enclave (ECDH → HKDF-SHA256 → AES-256-GCM).', '@horizen/vela-common-ts 0.2.0'],
  ['Custody', 'Funds and the encrypted request go to Vela’s ProcessorEndpoint. Only sender, token and amount are visible.', `ProcessorEndpoint ${short(contracts[0].address)}`],
  ['Credit engine', 'aegis_lending.wasm runs in the Vela executor: utilization-based interest, LTV checks, blind liquidation, solvency reporting.', `WASM sha-256 ${short(deployed.wasmSha256, 4, 4)}`],
  ['Signed state update', 'The executor signs every state transition; the TeeAuthenticator checks that signature on-chain before any funds move.', `TeeAuthenticator ${short(contracts[1].address)}`],
];

export function ExhibitB() {
  return (
    <Exhibit n="02" title="EXHIBIT B — How it works"
      margin={<>
        <p className="caps muted">Conformance (CI)</p>
        <ul className="d-checks" style={{ marginTop: 10, fontSize: '0.74rem' }}>
          <li><span>P-521 interop with Vela’s Go crypto</span><span className="ok">PASS</span></li>
          <li><span>JS ↔ Go instruction fixture</span><span className="ok">PASS</span></li>
          <li><span>WASM in the official Vela runtime</span><span className="ok">PASS</span></li>
        </ul>
      </>}>
      <ol className="d-steps">
        {steps.map(([t, d, a], i) => (
          <li key={t}>
            <span className="n">0{i + 1}</span>
            <div><h3>{t}</h3><p>{d}</p><div className="art">{a}</div></div>
          </li>
        ))}
      </ol>
      <div className="d-scroll">
        <table className="d-table">
          <thead><tr><th className="ok">Public on-chain</th><th>Private to the enclave</th></tr></thead>
          <tbody>
            <tr><td className="m">Deposits and withdrawals (sender, token, amount)</td><td className="m">Operation type (supply, borrow, repay, liquidate…)</td></tr>
            <tr><td className="m">Solvency aggregates</td><td className="m">Debt, collateral and health factor of each account</td></tr>
            <tr><td className="m">Generic error codes</td><td className="m">Identity of the liquidated borrower</td></tr>
          </tbody>
        </table>
      </div>
    </Exhibit>
  );
}

export function ExhibitC() {
  return (
    <Exhibit n="03" title="EXHIBIT C — Blind liquidation"
      margin={<div className="d-verdict">
        <div className="caps ok">Test verdict</div>
        <div className="big">8 / 8</div>
        <div className="caps muted" style={{ fontSize: '0.64rem' }}>WASM-runtime & full-stack tests on the official Vela v0.2.0 harness</div>
      </div>}>
      <p className="prose">
        The liquidator sends an encrypted request naming only the collateral token and a maximum repayment. The
        enclave deterministically picks the worst position below health factor 1.0 holding that collateral, applies the
        50% close factor and pays a 5% bonus. Borrower and liquidator are notified only through encrypted events.
      </p>
      <ul className="d-checks">
        <li><span>1. The liquidator never names or selects the borrower</span><span className="ok">PASS</span></li>
        <li><span>2. No log between liquidation and withdrawal contains the borrower’s address (with a positive control)</span><span className="ok">PASS</span></li>
        <li><span>3. No public AppEvent is emitted by a liquidation</span><span className="ok">PASS</span></li>
      </ul>
      <p style={{ marginTop: 22 }}><Ext href={links.ci}>See the CI runs →</Ext></p>
    </Exhibit>
  );
}

export function ExhibitD() {
  return (
    <Exhibit n="04" title="EXHIBIT D — On-chain record"
      margin={<div className="mono" style={{ fontSize: '0.78rem' }}>
        <p className="caps muted">Chain record</p>
        <p className="caps muted" style={{ marginTop: 14 }}>Network</p><p>Horizen testnet · {deployed.chainId}</p>
        <p className="caps muted" style={{ marginTop: 14 }}>Attestation</p><p className="warn">None — demo executor</p>
        <p className="caps muted" style={{ marginTop: 14 }}>Gas</p><p>ETH · ~0.001 gwei</p>
      </div>}>
      <p className="prose">Every contract is public on Horizen testnet. Re-check any of them in the explorer.</p>
      <div className="d-scroll">
        <table className="d-table">
          <thead><tr><th>Contract</th><th>Address (Horizen testnet)</th><th /></tr></thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.name}>
                <td className="m" style={{ fontWeight: 700 }}>{c.name}<span className="role">{c.role}</span></td>
                <td className="m addr">{c.address}</td>
                <td className="m nowrap"><Ext href={addressUrl(c.address)}>view ↗</Ext></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mono muted" style={{ fontSize: '0.78rem', marginTop: 18 }}>
        Application id <strong style={{ color: 'var(--ink)' }}>{deployed.applicationId}</strong> · WASM sha-256{' '}
        <strong style={{ color: 'var(--ink)' }}>{short(deployed.wasmSha256, 8, 8)}</strong> · reproducible with <code>make production_build</code>
      </p>
    </Exhibit>
  );
}

const today = [
  ['NOT ATTESTED', 'The Vela executor is operated by the Aegis team without AWS Nitro attestation; the operator could read positions and sign any state.'],
  ['DEMO PRICE FEED', 'Keeper-published median of Coinbase, OKX, KuCoin and CoinGecko. Stork has no ZEN feed yet.'],
  ['TEST TOKENS', 'aUSDC and tZEN have no value; a faucet is available in the app.'],
  ['NOT AUDITED', 'Do not use with real funds.'],
  ['BUSL 1.1', 'Vela is licensed for evaluation and testing; production needs a Horizen Foundation licence.'],
];
const production = [
  ['ATTESTED VELA', 'The same WASM on Horizen’s Nitro-attested environment, with PCR0 verified on-chain.'],
  ['STORK ORACLE', 'Stork feeds through the same trigger contract — a constructor argument, no code change.'],
  ['SECURITY AUDIT', 'External audit of vela-app and the price trigger (M2).'],
  ['PUREFI AML', 'PureFi v5 screening verified inside the enclave — implemented, enabled per market.'],
  ['PRODUCTION LICENCE', 'BUSL agreement with the Horizen Foundation.'],
];

export function ExhibitE() {
  return (
    <Exhibit id="trust" n="05" title="EXHIBIT E — Trust model & stated limitations"
      margin={<>
        <p className="caps muted">Status marks</p>
        <p className="caps warn" style={{ marginTop: 10 }}>Not attested</p>
        <p className="caps warn">Not audited</p>
        <p className="caps warn">Test tokens only</p>
      </>}>
      <p className="prose">Aegis states its limitations as plainly as its results. Read what you trust today against what production changes.</p>
      <div className="d-sheets">
        <div className="d-sheet">
          <h3><span>What you trust today</span><span className="warn">M1 · Testnet</span></h3>
          <dl>{today.map(([k, v]) => (<React.Fragment key={k}><dt className="warn">{k}</dt><dd>{v}</dd></React.Fragment>))}</dl>
        </div>
        <div className="d-sheet">
          <h3><span>What production changes</span><span className="ok">M2 · M3</span></h3>
          <dl>{production.map(([k, v]) => (<React.Fragment key={k}><dt className="ok">{k}</dt><dd>{v}</dd></React.Fragment>))}</dl>
        </div>
      </div>
    </Exhibit>
  );
}

export function ExhibitF() {
  return (
    <Exhibit id="milestones" n="06" title="EXHIBIT F — Milestones"
      margin={<p className="d-note">Timeline and funding ask: see the Builder Fund application in the repository.</p>}>
      <div className="d-miles">
        <div className="d-mile">
          <h3>M1 · Technical capability <span className="caps ok">[Live on testnet]</span></h3>
          <p>Credit engine, blind liquidation, price trigger, CI and E2E on the official harness — live on Horizen testnet with a self-operated Vela. Pending: the same WASM on an attested Vela environment.</p>
        </div>
        <div className="d-mile">
          <h3>M2 · Security audit <span className="caps muted">[Planned]</span></h3>
          <p>External audit of <code>vela-app</code> and <code>AegisPriceTrigger</code>.</p>
        </div>
        <div className="d-mile">
          <h3>M3 · Real usage <span className="caps muted">[Planned]</span></h3>
          <p>Production deployment, subject to Vela on mainnet and the BUSL licence; first blind liquidation in production; anchor funds.</p>
        </div>
      </div>
    </Exhibit>
  );
}
