import React from 'react';
import './landing.css';
import { VELA_CONFIG } from '../vela/config';
import { Header, Strip, Hero, LiveReadout } from './Top';
import { ExhibitA, ExhibitB, ExhibitC, ExhibitD, ExhibitE, ExhibitF } from './Exhibits';
import { links, priceFeedAddress } from './facts';
import useLiveMarket from './useLiveMarket';

function Footer() {
  return (
    <footer className="d-footer">
      <div className="wrap">
        <div>
          <p className="caps" style={{ fontWeight: 700 }}>Aegis Protocol — Horizen Builder Fund · Category 1: Private borrow-lend</p>
          <p className="caps warn" style={{ marginTop: 8 }}>Testnet demonstration. Not audited. Tokens have no value.</p>
        </div>
        <nav aria-label="References">
          <a className="link" href={links.repo} target="_blank" rel="noopener noreferrer">Source code</a>
          <a className="link" href={links.ci} target="_blank" rel="noopener noreferrer">CI</a>
          <a className="link" href={links.adr} target="_blank" rel="noopener noreferrer">ADR-001</a>
          <a className="link" href={links.demo} target="_blank" rel="noopener noreferrer">Demo dossier</a>
          <a className="link" href={links.runbook} target="_blank" rel="noopener noreferrer">Runbook</a>
        </nav>
      </div>
    </footer>
  );
}

export default function Landing() {
  const market = useLiveMarket(VELA_CONFIG, priceFeedAddress);
  return (
    <div className="dossier">
      <Header />
      <Strip />
      <main>
        <Hero />
        <LiveReadout market={market} />
        <ExhibitA />
        <ExhibitB />
        <ExhibitC />
        <ExhibitD />
        <ExhibitE />
        <ExhibitF />
      </main>
      <Footer />
    </div>
  );
}
