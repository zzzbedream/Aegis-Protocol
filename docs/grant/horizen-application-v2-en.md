# Horizen Builder Fund — Aegis Protocol application (draft v2, English)

> English version of [`horizen-application-v2.md`](horizen-application-v2.md), which remains the source of truth.
> `[TO COMPLETE]` marks information only the team can provide; nothing was invented.
> Technical background: [`../ADR-001-vela-native.md`](../ADR-001-vela-native.md).

## About you and your project

- **Project name:** Aegis Protocol
- **Contact / website / GitHub:** `[TO COMPLETE]` · https://github.com/zzzbedream/Aegis-Protocol
- **Demo:** live UI `[TO COMPLETE: Vercel URL]` · video `[TO COMPLETE: video URL]`
- **Where is your team primarily based?** Lo Espejo, Chile.
- **Team size / full-time:** `[TO COMPLETE]` / `[TO COMPLETE]`
- **In one sentence:** Aegis is a confidential lending market on Horizen Vela for funds, treasuries and high-net-worth
  individuals: each position's debt size, collateral and health factor stay private, and insolvent positions are
  liquidated without revealing whom they belong to.
- **Stage:** Prototype. The credit engine is a Vela WASM app (TinyGo) tested inside Vela's official v0.2.0 runtime.
  It includes blind liquidation, a solvency report, protocol reserves and PureFi v5 AML verification inside the enclave.
  M1 deploys it on the network where Vela lives today (Base Sepolia, early access) with a Stork price trigger, and on
  Horizen once Vela is available there.

## Privacy substance

- **What is confidential, and from whom?** Debt size, collateral composition inside the protocol, health factor and
  the identity of the liquidated position are confidential from the public, liquidators, competitors and the node
  operator. **Deposits and withdrawals are visible on-chain**, because Vela custody is a public contract. What is
  confidential is the internal state.
- **What breaks without privacy?** In transparent markets (Aave, Compound) every account's health factor is public.
  That enables hunting the liquidation of large positions, copying leverage and reading the counterparty's strategy.
  A borrower with a reputation to protect is, in practice, excluded from on-chain credit.
- **Confidentiality approach:** TEE / confidential compute (Vela).
- **Why this primitive, and which tradeoffs?** The risk logic runs as a WASM app inside Vela (AWS Nitro Enclaves).
  Horizen's `TeeAuthenticator` verifies on-chain the Nitro attestation (PCR0) and the signature of every state
  transition. State is encrypted at rest and events are encrypted per user. We accept these tradeoffs:
  - trust in AWS Nitro hardware and in the enclave measurement;
  - dependence on the operator (Manager) for availability;
  - a timing-correlation channel between public fund movements and internal events.

  We do not use ZK proofs: the RFP asks for provable solvency, and we deliver it by publishing attested aggregates.
- **Hardest unsolved problem and approach:** Liquidating without revealing who is insolvent. The liquidator does not
  choose the position: they deposit the repayment asset and the app deterministically applies it to the position with
  the worst health factor below 1.0 holding the given collateral. It hands the liquidator the discounted collateral and
  only notifies, encrypted, the liquidator and the borrower. On-chain one only sees "liquidator X deposited Y and
  withdrew Z". Prices enter through a *trigger* contract that reads on-chain oracles, because the app is deterministic
  and has no clock or network. Open risks we declare: price freshness between updates, and probing by liquidators.
- **Existing implementations studied:** Aave and Compound publish every account's health factor. NoctFinance shipped
  a confidential-lending demo on Vela during Horizen Acceleration. Agama (another applicant to this fund) chose
  commitments plus ZK proofs on Horizen and leaves Vela for a phase 2. Aegis is Vela-native from M1: the whole credit
  book lives in the enclave. `[TO COMPLETE after reviewing Noct's code: concrete differences]`
- **What do most teams get wrong?** Treating privacy as obfuscating the transaction graph and forgetting that the app's
  own errors and events leak data. In Aegis error messages are generic, aggregates are published only on demand, and
  regulatory access goes through Vela's deanonymization channel, gated by `AuthorityRegistry`, rather than through
  back doors.

## Demand & market

- **User:** `[TO COMPLETE with a concrete case: type of fund, position size, collateral asset and why it does not borrow on-chain today]`
- **Evidence of demand:** `[TO COMPLETE with citable evidence: conversations with funds (letters of intent), public data on liquidations of large positions, etc.]`
  *Do not claim "the main reported barrier" without a source.*
- **How will it make money?** A configurable fraction of the interest paid by borrowers (`reserveFactorBps`)
  accumulates as protocol reserves inside the enclave, and only the treasury can withdraw it. This is already
  implemented and tested. Vela execution fees go to the network operator, not to the app, so Aegis revenue comes from
  the interest spread. *(Optional, future: a cut of the liquidation bonus.)*
- **First 100 users:** `[TO COMPLETE: anchor funds by name or type, acquisition channel; the "Aegis Shield Points" program only if it is designed]`

## Team & execution capability

- **Team and prior shipping:** `[TO COMPLETE]`
- **Who writes the privacy-critical code (TinyGo/WASM, Solidity trigger):** `[TO COMPLETE name and experience]`
- **Full-time:** `[TO COMPLETE]`

## RFP response

- **Fit and deliberate differences:** Directly answers the *Private borrow-lend protocol* RFP:
  - confidential positions;
  - provable solvency (attested aggregate report);
  - interest through a borrow index, with a utilization-based two-slope rate model;
  - liquidation that works without exposing the borrower.

  We differ in that regulatory compliance uses Vela's native channel (deanonymization reports encrypted to authorized
  authorities), and PureFi v5 screening is verified inside the enclave.
- **Where we disagree with the framing:** `[OPTIONAL]` An honest observation: on Vela, deposits and withdrawals are
  public. The confidential "position" is the internal state, and the RFP could make explicit the expected level of
  privacy against timing correlation.
- **Integration with the Horizen app cluster:** Collateral and debt asset from Vela's `TokenAllowlist` (ZEN and
  stablecoins), and liquidity from the other cluster apps once they exist. `[TO COMPLETE only with confirmed integrations]`
- **Long-term maintenance:** `[TO COMPLETE]`

## Funding ask & use of funds

- **Amount:** `[TO COMPLETE]` (Core Apps cap: USD 150,000)
- **Breakdown:** `[TO COMPLETE]`. Validate the audit cost with real quotes; the scope is the TinyGo guest plus the trigger contract.
- **Current funding and runway:** `[TO COMPLETE]`

## Milestones & timeline

- **M1 — Technical capability:**
  - Lending app on Vela (TinyGo): deposit, collateral, borrow, repay, interest and blind liquidation.
  - Price trigger contract (Stork).
  - Deployment on Vela on Base Sepolia (early access); on Horizen testnet (2651420) once Vela is available there.
  - Guest tests inside the Vela runtime and an E2E on the official stack.
  - CI.
  - **Date:** `[TO COMPLETE]`
- **M2 — Security audit:** Yes, mandatory. Scope: `vela-app/` plus the trigger.
- **M3 — Real usage:**
  - Production deployment, subject to Vela's availability on mainnet and to the BUSL license agreement with the
    Horizen Foundation.
  - At least one blind liquidation executed in production.
  - `[N]` anchor funds and `[USD X]` TVL.
  - *Only put TVL figures backed by signed commitments. USD 1–3M in 3–4 months, audit included, is very aggressive.*
  - **Date:** `[TO COMPLETE]`
- **Most likely reason to miss dates:** Vela is not yet deployed on the Horizen network (today it is only on Base
  Sepolia with early access; Horizen is step 3 of its roadmap), and its BUSL license requires an agreement for
  production. Secondary risks: Stork feed availability for ZEN (none exists today; fallback: ETH/cbBTC collateral) and
  token inclusion in the `TokenAllowlist`, which Horizen administers.

## Long-term alignment & ZEN staking

- **ZEN utility:** ZEN as collateral, with risk parameters set by liquidity analysis; not subsidized at launch. `[ADJUST to the strategy]`
- **24 months with only this grant:** `[TO COMPLETE with a defensible projection]`
- **Staking contribution:** Share of protocol fees. `[TO COMPLETE the committed percentage]`
- **Token launch:** Undecided.
- **Ecosystem contribution:** Publish as a public good the reusable utilities for TinyGo Vela apps: exact 256/512-bit
  arithmetic (`MulDiv`), a hardened ABI decoder for trigger payloads, and a test harness against the official
  `WasmtimeRuntime`.

## DevRel support

- **Requesting hands-on DevRel support?** Yes. The concrete requests are in `docs/grant/devrel-request.md`
  (Vela access and contract addresses, `TokenAllowlist`, BUSL production terms) and `docs/ADR-001-vela-native.md` §6.
