# AegisPriceTrigger

Vela trigger contract that feeds [Stork](https://docs.stork.network) prices into the
`aegis_lending` guest as `TRUSTPROCESS` requests. Design: `../../docs/ADR-001-vela-native.md`.

```bash
git submodule update --init vela-app/trigger/lib/forge-std vela-app/trigger/lib/openzeppelin-contracts vela-app/trigger/lib/vela
forge build && forge test -vv
```

Dependencies (git submodules, pinned): `forge-std` v1.9.7, `openzeppelin-contracts` v5.3.0,
`HorizenOfficial/vela` v0.2.0 (BUSL 1.1 — evaluation/testing use; production needs a license
from the Horizen Foundation).

Deployment parameters: `ProcessorEndpoint` address, Stork address
(`0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62` on Horizen, `0x647DFd812BC1e116c6992CB2bC353b2112176fD6`
on Base/Base Sepolia), the debt token and every collateral token with their Stork feed id
(`keccak256("<ASSET>USD")`) and feed decimals, and `maxPriceAge` in seconds. Wire it with
`ProcessorEndpoint.submitDeployRequestWithTrigger`.
