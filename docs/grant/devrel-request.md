# Mensaje para Horizen DevRel

> Nota para el equipo: mensaje listo para enviar (Discord/Telegram/email de Horizen Labs o el
> formulario de acceso de Vela). Está en inglés porque es el idioma del equipo de Horizen.
> Completar `[NOMBRE]` y `[CONTACTO]` antes de enviar. Cada pedido corresponde a ADR-001 §6.

---

**Subject:** Aegis Protocol — Vela early access + 5 concrete asks (Builder Fund, Category 1: private borrow-lend)

Hi Horizen team,

We are building **Aegis Protocol**, a confidential lending market for the Category 1 RFP
(*Private borrow-lend protocol*). It is Vela-native:

- the credit ledger (collateral, debt, health factors, interest, blind liquidation, aggregate solvency reporting) runs as a TinyGo WASM guest;
- custody goes through `ProcessorEndpoint`;
- prices arrive from Stork through an `AbstractTrigger` contract as `TRUSTPROCESS` requests.

What already works, on Vela v0.2.0 (PR: https://github.com/zzzbedream/Aegis-Protocol/pull/1):

- **Full-stack E2E on your `pkg/testutil/fullstack` harness.** It runs a simulated chain with the real `ProcessorEndpoint` / `TokenAllowlist` / `TeeAuthenticator`, plus Manager, Executor and the WASM runtime. The flow is: trigger-fed prices → encrypted ERC-20 deposits → borrow → price drop → blind liquidation (the liquidator never names the borrower) → claim.
- **Borrower privacy at chain level.** The test checks that no log emitted by the liquidation contains the borrower's address.
- **PureFi v5 screening verified inside the enclave** (keccak + secp256k1 in TinyGo), tested with independently generated vectors.
- Green CI on every commit.

To move from the harness to a real network we need five things:

1. **Vela early access on Base Sepolia.** Could you add us to the early-access environment and share the `ProcessorEndpoint` and `TeeAuthenticator` addresses, the RPC you recommend, and the deployer-role process? We also want to confirm the Horizen testnet/mainnet timeline for Vela (your roadmap lists Base Sepolia → Base mainnet → Horizen).
2. **`TokenAllowlist` additions.** Please allowlist USDC (the debt asset) and ZEN (collateral) on the environment we get. Later we would add an ERC-7943 RWA token; is there a review process for restricted tokens (`canReceive` / `forcedTransfer`)?
3. **Stork feeds.** Your docs list `ETHUSD` on Horizen. Are `ZENUSD` and `USDCUSD` (or equivalent) available on Base Sepolia and on Horizen? What are their encoded IDs and `quantizedValue` decimals? Our trigger takes these as constructor parameters.
4. **PureFi for testing.** Your verifier is listed on Horizen mainnet only. Is there a PureFi issuer or rule ID we can use for test packages on the network where Vela runs? Is there a recommended AML rule for lending?
5. **License.** Vela and `vela-common-go` are BUSL 1.1 with an evaluation/testing grant. What are the licensing terms for a grantee's production deployment?

Two smaller technical questions:

- Can a guest learn the `PendingRequest.timestamp`? Today our only clock is the trigger's `block.timestamp`.
- Is guest-reported fuel the intended long-term model? Our liquidation scans all positions, so its cost grows with the book.

We are happy to share the ADR (`docs/ADR-001-vela-native.md`) or walk through the E2E live.

Thanks,
[NOMBRE] — Aegis Protocol
[CONTACTO] · https://github.com/zzzbedream/Aegis-Protocol
