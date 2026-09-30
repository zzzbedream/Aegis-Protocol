import React from 'react';
import Seal from './Seal';
import { deployed, links, contracts, addressUrl, short } from './facts';

const APP_PATH = '/app';

function money(text) {
  if (!text) return { v: '—', u: '' };
  const [num, unit] = text.split(' ');
  const n = Number(num);
  return { v: Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : num, u: unit };
}

export function Header() {
  return (
    <header className="d-header">
      <div className="wrap">
        <a className="d-brand" href="/">AEGIS PROTOCOL <span>// DOSSIER HZN-{deployed.chainId}</span></a>
        <nav className="d-nav" aria-label="Sections">
          <a href="#market">Live market</a>
          <a href="#exhibits">Exhibits</a>
          <a href="#trust">Trust model</a>
          <a href="#milestones">Milestones</a>
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span className="caps d-live ok">Live · Horizen testnet</span>
          <a className="btn-line" href={APP_PATH}>Open the app →</a>
        </div>
      </div>
    </header>
  );
}

export function Strip() {
  return (
    <div className="d-strip">
      <div className="wrap caps muted">
        <span>Recipient: Horizen Builder Fund · Category 1 — Private borrow-lend</span>
        <span style={{ color: 'var(--ink)', fontWeight: 700 }}>File status: live testnet demonstration</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="d-hero">
      <div className="wrap d-grid">
        <div>
          <p className="caps d-kicker">[Confidential credit market // Horizen Vela runtime]</p>
          <h1>Credit that doesn&apos;t expose its borrowers.</h1>
          <p className="lede">
            Debt, collateral and health factors are computed inside a Horizen Vela enclave. Insolvent positions are
            liquidated without anyone learning whose they were.
          </p>
          <div className="d-cta">
            <a className="btn-line" href={APP_PATH}>Open the live market</a>
            <a className="link caps" href={links.adr} target="_blank" rel="noopener noreferrer">Read the architecture (ADR-001) →</a>
          </div>
        </div>
        <aside className="d-margin">
          <Seal ring={`DEPLOYED ON-CHAIN · HORIZEN TESTNET · ${deployed.chainId} ·`} status="LIVE" id={deployed.applicationId} />
          <div className="d-facts mono" style={{ fontSize: '0.78rem' }}>
            <div><span className="muted">DEPLOYED</span><span>{deployed.deployedOn}</span></div>
            <div><span className="muted">BLOCK</span><span>{deployed.deployBlock.toLocaleString('en-US')}</span></div>
            <div><span className="muted">WASM SHA-256</span><span>{short(deployed.wasmSha256, 4, 4)}</span></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Figure({ label, value, unit, tone }) {
  return (
    <div className="d-figure">
      <div className="caps">{label}</div>
      <div className={`v ${tone || ''}`}>{value}</div>
      <div className="u">{unit}</div>
    </div>
  );
}

export function LiveReadout({ market }) {
  const { view, price, error } = market;
  const supplied = money(view?.supplied);
  const borrowed = money(view?.borrowed);
  const collateral = view?.collateral?.[0]?.split(' ') ?? [];
  const liquidatableCount = view ? Number(view.liquidatable.split(' ')[0]) : null;
  const endpoint = contracts[0];
  return (
    <section id="market" className="d-readout-wrap" aria-live="polite">
      <div className="wrap">
        <div className="d-readout" data-testid="landing-readout">
          <div className="d-readout-head">
            <div>
              <div className="caps" style={{ color: '#3fb68b' }}>[On-chain readout]</div>
              <h2>Live market — public solvency report</h2>
            </div>
            <span className="caps">{error ? 'Chain unreachable — retrying' : view ? `Prices updated ${view.priceAge}` : 'Reading the chain…'}</span>
          </div>
          <div className="d-readout-body">
            <div>
              <div className="d-figures">
                <Figure label="Supplied" value={supplied.v} unit={supplied.u} />
                <Figure label="Borrowed" value={borrowed.v} unit={borrowed.u} />
                <Figure label="Utilization" value={view?.utilization ?? '—'} unit="kink at 80%" />
                <Figure label="Borrow APR" value={view?.borrowApr ?? '—'} unit="utilization-based" />
                <Figure label="Collateral" value={collateral[0] ? Number(collateral[0]).toLocaleString('en-US') : '—'} unit={collateral[1] ?? ''} />
                <Figure label="Liquidatable" value={liquidatableCount ?? '—'} unit="positions"
                  tone={liquidatableCount === null ? '' : liquidatableCount === 0 ? 'ok' : 'warn'} />
              </div>
              <div className="d-readout-foot">
                <span>ZEN/USD {price?.price ?? '—'} <span style={{ color: '#a9adb3' }}>— median of Coinbase, OKX, KuCoin, CoinGecko</span></span>
                <span style={{ color: '#a9adb3' }}>Refreshes every 60 s</span>
              </div>
            </div>
            <div className="d-readout-side">
              <div className="caps">Source of these figures</div>
              <dl>
                <dt>Event</dt><dd>AppEvent AEGIS.SOLVENCY</dd>
                <dt>Emitted through</dt>
                <dd><a className="link" href={addressUrl(endpoint.address)} target="_blank" rel="noopener noreferrer">ProcessorEndpoint {short(endpoint.address)} ↗</a></dd>
                <dt>Signed by executor</dt><dd>{short(deployed.executorSigner)}</dd>
              </dl>
              <p style={{ marginTop: 18, color: '#a9adb3', lineHeight: 1.6 }}>
                Aggregates only. The enclave publishes them after every price update; no position, balance or identity
                is ever revealed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
