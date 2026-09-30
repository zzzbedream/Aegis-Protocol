# Aegis testnet demo — runbook

Runs Aegis **live on Horizen testnet (chain 2651420)** on a Vela environment we operate
ourselves. No early-access favours needed. The demo has three honest limitations, and the UI states them:

- The executor runs **without AWS Nitro attestation** (`NoAttestationTeeAuthenticator`). The same WASM runs
  attested on Horizen's Vela environment.
- Prices come from `DemoPriceFeed`: a keeper publishes the live ZEN/USD rate as the median of Coinbase, OKX, KuCoin and CoinGecko (at least 2 must answer). There is no Stork ZEN feed yet.
- Tokens are worthless `DemoToken`s with a faucet: aUSDC (6 decimals) and tZEN (18 decimals).

Vela is BUSL 1.1 (evaluation and testing only): keep this on testnet, with no real funds.

```
browser ── MetaMask ──▶ Horizen testnet: ProcessorEndpoint · TokenAllowlist · NoAttestationTeeAuthenticator
                                     ▲         AegisPriceTrigger ◀── DemoPriceFeed ◀── keeper (median of 4 exchanges)
                                     │ stateUpdate
       WSL / VPS (docker compose): manager ◀──▶ executor (aegis_lending.wasm) · authority service · graph-node
```

## 0. Toolchain (once)

```bash
# Ubuntu 24.04 (WSL2 or VPS). Clone inside the Linux filesystem, not /mnt/c (Docker I/O is much faster).
git clone https://github.com/zzzbedream/Aegis-Protocol.git ~/aegis && cd ~/aegis
git submodule update --init vela-app/trigger/lib/forge-std vela-app/trigger/lib/openzeppelin-contracts vela-app/trigger/lib/vela
bash ops/wsl-setup.sh      # asks for your sudo password (apt + Docker); open a new shell afterwards
```

## 1. Wallets and testnet ETH

```bash
for r in admin manager keeper lender borrower; do echo "== $r"; cast wallet new; done
```

Store every key in a password manager, **never in git**. Gas on Horizen is ETH. Fund these accounts on Horizen testnet:

- **admin**: deploys the contracts and the app. Also seeds gas for `lender`/`borrower` (≈0.01 ETH total).
- **manager**: pays gas for **every** state update. It is the one that needs funds over time.
- **keeper**: one price update plus one `poke` per interval.

Testnet ETH is free, and gas on Horizen testnet costs about **0.001 gwei**. Deploying everything takes
about 0.00003 ETH, so a **single faucet claim of 0.01 ETH covers the whole demo**:

- direct faucet: <https://thirdweb.com/horizen-testnet> (0.01 ETH/day)
- or a Base Sepolia faucet (e.g. <https://www.alchemy.com/faucets/base-sepolia>) and then the
  Horizen bridge to testnet (<https://docs.horizen.io/overview/horizen-bridge/>)

Claim into **admin**, then send about 0.002 ETH each to manager and keeper
(`cast send <addr> --value 0.002ether --private-key <admin key> --rpc-url https://horizen-testnet.rpc.caldera.xyz/http`).

## 2. Executor keys (fresh; never reuse the public dev keys from Vela's `.env.dev`)

```bash
cd vela-app/trigger/lib/vela && go run ./cmd/keytool
```

`keytool` prints every key with a `0x` prefix. **Drop the `0x`** for the `EXECUTOR_FIXED_*` variables:

| keytool line | goes to |
|---|---|
| `Secp256k1 (private)` | `EXECUTOR_FIXED_SIGNING_KEY` (no 0x) |
| `Secp256k1 (Ethereum address)` | `TEE_SIGNER_ADDRESS` (step 3) |
| `P521 (private)` | `EXECUTOR_FIXED_COMMUNICATION_KEY` (no 0x) |
| `P521 (public)` | `TEE_PUB_P521` (step 3, with 0x) |
| `AES` | `EXECUTOR_FIXED_STATE_KEY` (no 0x) |

`MANAGER_KEY_SECP256` is the **manager** wallet's private key from step 1, without `0x`.

## 3. Vela core contracts on Horizen testnet (official script)

```bash
cd vela-app/trigger/lib/vela/contracts && npm ci
export NETWORK=horizen-l3-testnet PRIVATE_KEY=<admin key> ADMIN=<admin address> \
       UPDATE_STATUS_OPERATOR=<manager address> MIN_FEE_PER_REQUEST=10 \
       TEE_NO_ATTESTATION=true TEE_SIGNER_ADDRESS=<step 2> TEE_PUB_P521=<step 2> \
       DEPLOY_OUTPUT_DIR=$HOME/aegis/ops/vela-operator/deploy-data
cast block-number --rpc-url https://horizen-testnet.rpc.caldera.xyz/http   # → SUBGRAPH_START_BLOCK
npx hardhat run scripts/deploy/all.ts
```

`deploy-data/deployed_addresses.env` now holds `CHAIN_PROCESSOR_ADDRESS`, `CHAIN_TEEAUTHENTICATOR_ADDRESS` and `CHAIN_TOKEN_ALLOWLIST_ADDRESS`.

## 4. Demo tokens, price feed and trigger

```bash
cd ~/aegis/vela-app/trigger && source ../../ops/vela-operator/deploy-data/deployed_addresses.env
PROCESSOR_ENDPOINT=$CHAIN_PROCESSOR_ADDRESS TEE_AUTHENTICATOR=$CHAIN_TEEAUTHENTICATOR_ADDRESS \
TOKEN_ALLOWLIST=$CHAIN_TOKEN_ALLOWLIST_ADDRESS KEEPER=<keeper address> \
forge script script/DeployDemo.s.sol --rpc-url https://horizen-testnet.rpc.caldera.xyz/http \
  --private-key <admin key> --broadcast
```

This writes `deployments/2651420.json`. It holds public addresses only: commit it.

## 5. Start the operator

```bash
cd ~/aegis/ops/vela-operator && cp .env.example .env   # fill in steps 2–3 + a random SUBGRAPH_DB_PASSWORD
docker compose up -d && docker compose logs -f manager executor
```

The manager should complete the handshake with the executor and start polling the chain. The authority service listens on `127.0.0.1:8081`.

## 6. Build and deploy the app

```bash
cd ~/aegis/vela-app && make test && make production_build
# Optional locally: `make test-wasm` (CI runs it on every push). It links wasmtime + Vela via cgo; if
# WSL crashes while building it, raise `memory=` under [wsl2] in %UserProfile%\.wslconfig or rely on CI.
cd ~/aegis/ops && npm ci
CHAIN_ID=2651420 RPC_URL=https://horizen-testnet.rpc.caldera.xyz/http AUTHORITY_URL=http://127.0.0.1:8081 \
DEPLOYER_PRIVATE_KEY=<admin key> npm run deploy-app
```

`applicationId` and `deployBlock` are added to `deployments/2651420.json`. Commit it again.

## 7. Keeper and seed data

```bash
export CHAIN_ID=2651420 RPC_URL=https://horizen-testnet.rpc.caldera.xyz/http
KEEPER_PRIVATE_KEY=<keeper key> INTERVAL_SEC=300 npm run keeper      # keep it running (tmux / systemd)
DEPLOYER_PRIVATE_KEY=<admin key> SEED_LENDER_KEY=<lender key> SEED_BORROWER_KEY=<borrower key> npm run seed
```

The seed creates a lender with 50,000 aUSDC and a borrower with 1,000 tZEN of collateral. The borrower
borrows 65 % of that collateral's value, which a −30 % price move makes liquidatable.

## 8. Frontend (Vercel)

Set these in the Vercel project and redeploy. The values come from `deployments/2651420.json`.

```
VITE_NETWORK_NAME="Horizen testnet · Aegis demo operator"   VITE_CHAIN_ID=2651420
VITE_RPC_URL=https://horizen-testnet.rpc.caldera.xyz/http  VITE_EXPLORER_URL=https://explorer-testnet.horizen.io
VITE_VELA_PROCESSOR_ENDPOINT  VITE_VELA_TEE_AUTHENTICATOR  VITE_AEGIS_APP_ID  VITE_DEPLOY_BLOCK
VITE_USDC_ADDRESS (= usdc)  VITE_ZEN_ADDRESS (= zen)  VITE_DEMO_OPERATOR=true  VITE_DEMO_FAUCET=true
```

## 9. Live blind-liquidation demo

1. In the browser, use a third wallet as liquidator: faucet aUSDC and register its key.
2. Run a price shock: `SHOCK=-30% ONCE=1 KEEPER_PRIVATE_KEY=<keeper key> npm run keeper`.
   It publishes ZEN at −30 %, labelled as a demo shock in the keeper log.
3. Liquidator tab → liquidate tZEN. The enclave picks the insolvent position. The liquidator never names it.
4. In the Horizen testnet explorer, open the liquidation and the claim transactions: the borrower's address appears in none of their logs.
5. Restart the normal keeper: the price goes back to the live rate on the next tick.

## Moving to a VPS

Repeat steps 0 and 5 on the VPS (Ubuntu 24.04, 4 GB RAM), copying `ops/vela-operator/.env` and `deploy-data/` securely.
The manager's database lives in a Docker volume: stop WSL **before** starting the VPS, so two managers never
process the same queue. The frontend only talks to the chain, so it needs no change.
