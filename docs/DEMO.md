# Demo en vivo — Aegis en Horizen testnet

**URL:** <https://aegis-horizen.vercel.app> (dossier para revisores, con el mercado en vivo) · **App:** <https://aegis-horizen.vercel.app/app> · **Red:** Horizen testnet (chain ID 2651420, gas en ETH) ·
**En línea desde:** 30/09/2026

Aegis corre en **Horizen testnet** sobre una instancia de **Vela v0.2.0 que opera el equipo**. Usa los contratos
oficiales de Horizen, desplegados con su script `all.ts`, y el executor oficial en Docker. La demo no dependió
de accesos anticipados de terceros. El motor de crédito es el mismo WASM que pasa el E2E sobre el harness
oficial de Vela en CI.

## Qué es real y qué es demo (declarado también en la UI)

| Real | Demo |
|---|---|
| Contratos de Vela en una red pública (custodia, cola de requests, `stateUpdate` firmados) | El executor **no tiene atestación AWS Nitro** (`NoAttestationTeeAuthenticator`): el `TeeAuthenticator` solo verifica la firma del executor que configuramos |
| Motor de crédito en WASM: intereses por utilización, liquidación ciega, reporte de solvencia | Tokens de prueba sin valor (`aUSDC`, `tZEN`) con faucet |
| Precio real de ZEN: mediana de Coinbase, OKX, KuCoin y CoinGecko (se necesitan al menos 2 fuentes) | El feed lo publica nuestro keeper, no Stork (Stork aún no tiene feed de ZEN) |
| Cifrado P-521/AES-GCM de instrucciones y eventos, igual que en producción | AML (PureFi) desactivado en este mercado |

## Direcciones (fuente: [`vela-app/trigger/deployments/2651420.json`](../vela-app/trigger/deployments/2651420.json))

Explorador: `https://explorer-testnet.horizen.io/address/<dirección>`

| Contrato | Dirección |
|---|---|
| ProcessorEndpoint (Vela, custodia) | [`0xaf01a93073977F04dbE729bfA701303F0e151919`](https://explorer-testnet.horizen.io/address/0xaf01a93073977F04dbE729bfA701303F0e151919) |
| NoAttestationTeeAuthenticator | [`0x3806ad450417B140fA171756A25A8F086A2E85C8`](https://explorer-testnet.horizen.io/address/0x3806ad450417B140fA171756A25A8F086A2E85C8) |
| TokenAllowlist | [`0x9a038e9eB1dB526bc02D8E917ff4331d17b713bC`](https://explorer-testnet.horizen.io/address/0x9a038e9eB1dB526bc02D8E917ff4331d17b713bC) |
| AegisPriceTrigger | [`0x177940696E2e4AeF67bea4657b3c535FED467aBc`](https://explorer-testnet.horizen.io/address/0x177940696E2e4AeF67bea4657b3c535FED467aBc) |
| DemoPriceFeed | [`0xD2a0a98cB49ccE83d688062449d7248B833ea07d`](https://explorer-testnet.horizen.io/address/0xD2a0a98cB49ccE83d688062449d7248B833ea07d) |
| aUSDC (6 decimales) | [`0x2DEEf22bbC25AF3dAdF3531B72dA584dC75F3e9a`](https://explorer-testnet.horizen.io/address/0x2DEEf22bbC25AF3dAdF3531B72dA584dC75F3e9a) |
| tZEN (18 decimales) | [`0x0D6a47E910E65b9f9c00025112e22b94Ff9211a0`](https://explorer-testnet.horizen.io/address/0x0D6a47E910E65b9f9c00025112e22b94Ff9211a0) |

- **Application ID:** `14934387600044074235`, desplegada en el bloque 29142024.
- **WASM:** sha256 `3b65605f7184389815a1ac50e04187a029d7fb071333a2e29b43e23042a46202`. Es reproducible con `make production_build`.
- **Firmante del executor:** `0x47Bd375A17eEe8A3Bea728905717f431B0Bf34d3`. **Keeper:** `0xe65646Eeaf77E2d78ddA1e5a556D41895d517ed3`.

## Parámetros del mercado

- Deuda aUSDC. Colateral tZEN: LTV 75 %, umbral de liquidación 80 %, bonus 5 %.
- Tasa de dos pendientes: 2 % base, +8 % hasta el kink del 80 %, +60 % sobre el kink. Close factor 50 %. Reserve factor 10 %.
- **Siembra inicial:** un lender con 50.000 aUSDC y un borrower con 1.000 tZEN de colateral que pidió el 65 % de su valor.
  Queda sano al precio actual y se vuelve liquidable con una caída de −30 %.

## Cómo verificarlo tú mismo

1. **Mercado en vivo sin wallet:** el panel *Live market (public)* lee el `AppEvent AEGIS.SOLVENCY` más reciente.
   Muestra solo agregados (depositado, prestado, utilización, APR, colateral total, posiciones liquidables).
2. **Privacidad on-chain:** en el explorador, abre cualquier transacción al `ProcessorEndpoint`. Los depósitos son
   públicos (remitente, token, monto), pero la instrucción viaja cifrada y los eventos de cada usuario también.
   En una liquidación, ningún log contiene la dirección del prestatario (lo verifica el E2E de CI).
3. **Probar como usuario:** conecta MetaMask; la app agrega la red sola. Pide aUSDC/tZEN en el faucet y ETH de gas
   en <https://hub-testnet.horizen.io/>. Luego registra tu llave de cifrado y deposita, pide prestado o liquida.

## Demo de liquidación ciega (en vivo)

Desde el VPS del operador: `SHOCK=-30% ONCE=1 npm run keeper` (en `~/aegis/ops`). Publica ZEN a −30 %, y el log del
keeper lo marca como *DEMO SHOCK*. Un liquidador, desde la pestaña *Liquidator*, repaga deuda de tZEN sin nombrar a
nadie: el enclave elige la posición insolvente. El siguiente tick normal del keeper restaura el precio real.

## Operación

- **Servidor:** VPS Contabo (6 vCPU, 11 GB, Ubuntu 24.04), unos USD 9 al mes. Tiene SSH solo con llave, firewall con
  solo el puerto 22 y fail2ban. Los servicios escuchan en `127.0.0.1`.
- **Servicios:** stack de Vela en Docker (`ops/vela-operator`) y keeper como servicio systemd `aegis-keeper` cada 5 minutos.
- **Costo en gas:** unos 0,001 gwei por transacción; toda la demo costó menos de 0,0001 ETH de testnet.
- **Runbook completo y problemas conocidos:** [`ops/README.md`](../ops/README.md).
