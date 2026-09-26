# aegis_lending — Aegis credit market as a Horizen Vela app

TinyGo/WASI guest executed by Horizen Vela inside an AWS Nitro Enclave. Design, threat
model and open questions: [`../docs/ADR-001-vela-native.md`](../docs/ADR-001-vela-native.md).

## Build & test

```bash
make test        # pure-Go unit tests of the credit engine (Go 1.24)
make build       # build/aegis_lending.wasm (TinyGo >= 0.39)
make test-wasm   # runs the compiled WASM inside Vela's WasmtimeRuntime (TinyGo + cgo)
```

## Deploy parameters (`submitDeployRequest` constructor JSON)

```json
{
  "debt": {"address": "0x…usdc", "decimals": 6},
  "collaterals": [
    {"address": "0x…zen", "decimals": 18, "ltvBps": 7500, "liqThresholdBps": 8000, "liqBonusBps": 500}
  ],
  "rateModel": {"baseAprBps": 200, "slope1Bps": 800, "slope2Bps": 6000, "kinkBps": 8000},
  "closeFactorBps": 5000,
  "reserveFactorBps": 1000,
  "treasury": "0x…",
  "aml": {"issuers": ["0x…purefi-issuer"], "ruleId": "0x…", "graceSeconds": 600, "validitySeconds": 2592000}
}
```

## PROCESS payloads (encrypted to the enclave by `@horizen/vela-common-ts`)

Amounts are hex strings (`"0x…"`), as serialized by `vela-common-go` `Uint256`.

| `type` | Fields | Effect |
|---|---|---|
| *(deposit)* | assets attached to any request | credits the sender's idle balance |
| `supply` | `amount` | idle debt token → pool shares |
| `redeem` | `shares` | shares → idle debt token |
| `add_collateral` | `token`, `amount` | idle → collateral |
| `remove_collateral` | `token`, `amount` | collateral → idle (must stay within LTV) |
| `borrow` | `amount` | pool cash → idle, bounded by LTV |
| `repay` | `amount` | idle → repays own debt (capped at the debt) |
| `withdraw` | `token`, `amount`, `to` | idle → on-chain pull-payment to `to` |
| `liquidate` | `token`, `maxRepay` | repays the worst HF<1 position holding `token`, receives collateral + bonus; the borrower is never named |
| `poke` | — | public `AEGIS.PRICE_REQUEST` + `AEGIS.SOLVENCY` aggregates |
| `screen` | `payload` (hex PureFi v5 payload) | AML screening; required for supply/add_collateral/borrow/liquidate when `aml.issuers` is set |
| `collect_reserves` | `amount` | treasury only: protocol reserves → treasury idle balance |

Borrow rate: two-slope "kink" model on utilization U = debt / (cash + debt), accrued on each
trusted price update (`borrowAprBps` is a fixed-rate fallback when `rateModel` is omitted).

TRUSTPROCESS (price trigger): `abi.encode(uint256 timestamp, address[] tokens, uint256[] prices)`.
DEANONYMIZATION (AuthorityRegistry-gated): full position report, encrypted to the authority.

## Licensing note

This module links `github.com/HorizenOfficial/vela-common-go` and its tests use
`github.com/HorizenOfficial/vela`, both BUSL 1.1 with an additional use grant limited to
internal evaluation and testing. Production use requires a license from the Horizen Foundation.
