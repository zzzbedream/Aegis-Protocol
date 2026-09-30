# ADR-001 — Arquitectura nativa de Horizen Vela

- **Estado:** Aceptada. M1: demo en vivo en Horizen testnet con Vela operado por el equipo (30/09/2026); falta el entorno atestado
- **Fecha:** 2026-09-26
- **Contexto de decisión:** postulación a la RFP *Private borrow-lend protocol* (Horizen Builder Fund, Categoría 1)

## 1. Contexto

La primera versión del repositorio (`contracts/src/core/*`, `tee-enclave/`, `frontend/`) implementaba un TEE propio: un servidor Rust con clave de firma fija, un Vault y Exitpoint propios, y un mock de zkVerify. Una revisión con pruebas de concepto confirmó varios defectos críticos:

- El destinatario de los retiros no estaba ligado a la firma, lo que permitía front-running.
- El Health Factor saturaba en `u128`, y una posición con HF 1,6 se leía como 0,068.
- El owner podía vaciar las allowances.
- El payload "cifrado" viajaba en claro.
- El colateral RWA quedaba bloqueado.

La investigación del starter kit oficial de Vela (`HorizenOfficial/vela-starterkit`, `HorizenOfficial/vela` v0.2.0) mostró además que esa arquitectura **no es una app de Vela**. Vela ya provee la custodia, la atestación, el cifrado y el canal de cumplimiento.

## 2. Decisión

Aegis se reconstruye como **app WASM nativa de Vela**, en `vela-app/`:

| Pieza | Responsable | Dónde |
|---|---|---|
| Custodia de fondos, cola de requests, pull-payments (`claim`) | `ProcessorEndpoint` (Horizen) | on-chain |
| Atestación Nitro (PCR0) y verificación de la firma del TEE | `TeeAuthenticator` (Horizen) | on-chain |
| Cifrado de payloads y eventos (P-521 ECDH → HKDF-SHA256 → AES-256-GCM) y del estado (AES-256-GCM) | Executor de Vela | enclave |
| Control de quién puede pedir reportes de cumplimiento | `AuthorityRegistry` (Horizen) | on-chain |
| **Libro de crédito, intereses, HF, liquidación ciega y solvencia** | `aegis_lending.wasm` (este repo) | enclave |
| **Precios** | `AegisPriceTrigger` (este repo, `vela-app/trigger/`, lee Stork) → `TRUSTPROCESS` | on-chain → enclave |

**zkVerify se retira del M1.** La doc oficial del trigger dice textualmente: *"no zero-knowledge proof is required"*. El ancla de confianza es la atestación Nitro verificada por `TeeAuthenticator`.

## 3. Diseño del guest (`vela-app/lending`)

- **Mercado:** un activo de deuda (p. ej. USDC) y N colaterales, cada uno con LTV, umbral de liquidación y bonus. `validateConfig` exige `LTV < LT` y `LT·(1+bonus) < 100%`, de modo que liquidar en el umbral nunca crea deuda incobrable.
- **Saldos "idle":** todo depósito (público, vía `submitRequest`) cae en un saldo idle. Las acciones `supply`, `add_collateral`, `repay` y `liquidate` son instrucciones cifradas aparte, así que lo único público es "X depositó Y del token Z".
- **Aritmética:** `types.Uint256` de `vela-common-go` no trae multiplicación ni división generales. `lending/math.go` implementa `MulDiv`/`MulDivUp` exactos con intermediario de 512 bits, verificados contra `math/big` en 20 000 casos aleatorios. Hay un test de regresión del bug de saturación.
- **Redondeos a favor del protocolo:**
  - La deuda escalada del borrower se redondea hacia arriba al pedir prestado y hacia abajo al repagar.
  - Las shares del lender se redondean hacia abajo al depositar y los activos hacia abajo al retirar.
- **Intereses:** índice de préstamo con APR fijo (`borrowAprBps`), interés simple por intervalo. Se acumula **solo** con cada actualización de precios del trigger: el guest es determinista y no tiene reloj propio.
- **Liquidación ciega:**
  - El liquidador envía `{"type":"liquidate","token":<colateral>,"maxRepay":...}` **sin nombrar a nadie**.
  - El guest elige, de forma determinista (claves ordenadas), la posición con peor HF bajo 1,0 que tenga ese colateral, excluyendo al propio liquidador.
  - Aplica el close factor, entrega el colateral con bonus al saldo idle del liquidador y emite solo eventos **cifrados** (uno para el liquidador y otro para el prestatario). No emite ningún `AppEvent`.
  - Si el colateral se agota, el saldo restante se castiga como `BadDebt` y lo absorben los lenders.
- **Solvencia demostrable:** `poke` (lo puede llamar cualquiera) publica un `AppEvent` `AEGIS.SOLVENCY` solo con agregados: activos, caja, deuda total, shares, deuda incobrable, totales de colateral, y número y deuda de posiciones liquidables. También emite `AEGIS.PRICE_REQUEST` para que el trigger responda con precios.
- **Reservas del protocolo:** `reserveFactorBps` desvía una parte del interés a `Reserves`, que solo `treasury` puede retirar (`collect_reserves`). Los fees de Vela van al operador (§6.7), así que esta es la vía de ingresos de la app.
- **AML PureFi (opcional):** el request `screen` verifica un payload PureFi v5 dentro del enclave (§6.6). Mientras la verificación esté vigente habilita `supply`, `add_collateral`, `borrow` y `liquidate`.
- **Cumplimiento:** las peticiones `DEANONYMIZATION` (controladas por `AuthorityRegistry`) devuelven un reporte con todas las posiciones. El executor lo cifra hacia la clave de la autoridad.
- **Atomicidad:** `Process` toma una instantánea del estado y la restaura si la operación falla.
- **Errores sin fugas:** los mensajes de error terminan en el `stateUpdate` público firmado, así que nunca contienen direcciones ni montos (hay un test que lo verifica).

### Formato de precios (contrato ↔ guest)

```
abi.encode(uint256 timestamp, address[] tokens, uint256[] prices)   // prices: USD con 18 decimales por token entero
```

`lending.DecodePriceUpdate` valida offsets y longitudes, rechaza precios en cero y tokens duplicados o no soportados, y exige un `timestamp` estrictamente creciente (anti-replay). Por la regla anti-bucle de Vela, un `TRUSTPROCESS` **no** emite `AppEvents`; hay un test que lo verifica.

## 4. Qué es y qué no es confidencial (modelo de amenazas honesto)

| Dato | ¿Visible on-chain? |
|---|---|
| Depósitos y retiros (remitente, token, monto, destino) | **Sí**, por diseño de la custodia de Vela |
| Tipo de operación (supply, borrow, repay, liquidate…) | No (payload cifrado) |
| Deuda, colateral y HF de cada cuenta | No |
| Identidad del prestatario liquidado | No |
| Agregados de solvencia (en cada `poke`) | Sí |
| Mensajes de error | Sí (por eso son genéricos) |

**Riesgos residuales**, que hay que declarar en la postulación:
- **Correlación temporal:** los depósitos y retiros son públicos, y un observador puede correlacionar un retiro de colateral con una liquidación. Además, las diferencias entre dos reportes de solvencia revelan flujos netos si hubo una sola operación entre ellos.
- **Sondeo del liquidador:** quien liquida aprende que existe *alguna* posición liquidable con ese colateral y el monto incautado.
- **Frescura de precios:** el guest no tiene reloj ni acceso al timestamp del request (§6.5), así que no puede rechazar un precio "viejo" al momento de un préstamo. Mitigación operativa: un keeper de `poke` frecuente.
- **Confianza:** hardware AWS Nitro y medición PCR0; el operador (Manager) para la disponibilidad; la fuente de oráculo del trigger.
- **Licencia:** Vela y `vela-common-go` usan **BUSL 1.1** con un *Additional Use Grant* que solo permite "evaluación y pruebas internas". **Producción (mainnet) requiere un acuerdo de licencia con la Horizen Foundation.**

## 5. Estado del código legado

`contracts/src/core/*`, `contracts/src/compliance/*`, `contracts/src/mocks/MockZkVerify.sol` y `tee-enclave/` quedan como **legado, no aptos para producción**. Se conservan solo como referencia hasta que el M1 nativo los reemplace por completo. El "ERC-7943" del repo no implementa el estándar final: el ERC-7943 real define `canSend`, `canReceive`, `canTransfer`, `getFrozenTokens`, `setFrozenTokens` y `forcedTransfer`.

## 6. Preguntas técnicas: respuestas investigadas (2026-09-26)

Certeza: **[V]** = verificado por nosotros (código o prueba ejecutada); **[O]** = fuente oficial de Horizen/proveedor leída; **[T]** = reportado por terceros, no verificado on-chain por nosotros.

### 6.1 ¿Rust o TinyGo?
- **[V]** La interfaz host↔guest de Vela v0.2.0 (`pkg/wasm/wasmtime_runtime.go`) no depende del lenguaje. Requiere:
  - los exports `allocate`, `deallocate`, `deploy`, `load_module`, `deposit`, `process_request` y (opcional) `trusted_request`;
  - la memoria exportada;
  - resultados como `[u32 LE longitud][JSON]`;
  - WASI preview1.
- **[V]** Compilamos un guest mínimo en **Rust** (`wasm32-wasip1`) y funcionó en el `WasmtimeRuntime` oficial: deploy, depósito, 3 requests y recarga tras un reinicio simulado.
- **[O]** La documentación del starter kit declara *"Supported languages: TinyGo (WASI target)"*.
- **Decisión:** seguimos con **TinyGo**. Es el lenguaje soportado, es el de las apps de referencia (vela-nova, NoctFinance, Legate) y el guest ya está hecho. Rust es técnicamente viable, pero quedaría fuera de soporte.

### 6.2 Red objetivo, chain IDs y direcciones
- **[O]** Datos de Horizen (`HorizenOfficial/horizen-mcp`, `data/chain-facts.json`):
  - **Mainnet:** chain ID **26514**, RPC `https://horizen.calderachain.xyz/http`, explorador `https://explorer.horizen.io/`, se liquida en Base.
  - **Testnet:** chain ID **2651420**, RPC `https://horizen-testnet.rpc.caldera.xyz/http`, explorador `https://explorer-testnet.horizen.io/`, se liquida en Base Sepolia.
  - **Gas token:** ETH.
  - `7332` es la cadena **Horizen EON, deprecada**. El repo la usaba y ya está corregido.
- **[T]** Vela está **en Base Sepolia (84532) solo para desarrolladores con acceso anticipado**, y **aún no en la red de Horizen**. El roadmap de Horizen Labs es "Base Sepolia → Base mainnet → Horizen testnet y mainnet". La página de limitaciones de docs.horizen.io dice que no está desplegada en ninguna red. Fuente: `agamafinance/agama-horizen` (medido el 15/09/2026), que cita `horizenlabs.io/vela` y `docs.horizen.io/vela/limitations`; no pudimos abrir esas páginas desde nuestro entorno.
- **[T]** Las direcciones de `ProcessorEndpoint`/`TeeAuthenticator` en Base Sepolia **no están publicadas**. Se obtienen pidiendo acceso ("tell us what you're building and we'll get you into an environment").
- **Decisión para M1:**
  - **Desarrollo:** stack local oficial (Docker, Anvil 31337, `TEE_NO_ATTESTATION=true`).
  - **Demo en red (actualizado 30/09/2026):** ~~Vela en Base Sepolia, previa solicitud de acceso anticipado~~. Se descartó esperar el acceso de terceros. Desplegamos **nuestra propia instancia de Vela v0.2.0 en Horizen testnet**: contratos oficiales con `all.ts` (somos `ADMIN` y `DEPLOYER_ROLE`), `NoAttestationTeeAuthenticator` y el executor oficial en Docker. Así controlamos la `TokenAllowlist` (tokens demo propios) y el oráculo (`DemoPriceFeed`: mediana de 4 exchanges, porque Stork no tiene feed de ZEN). **Costo de confianza, declarado en la UI:** sin atestación Nitro, el operador (nosotros) podría leer posiciones y firmar cualquier estado. Ficha: `docs/DEMO.md`. Operación: `ops/README.md`.
  - **Demo atestada:** el mismo WASM en Vela con atestación (Base Sepolia con acceso anticipado u Horizen), sin cambios de código.
  - **Producción:** Horizen, cuando Vela llegue allí (dependencia del roadmap de Horizen).

### 6.3 `TokenAllowlist` (ZEN, USDC, RWA)
- **[V]** Es **global** y solo la modifica el rol `ADMIN` del `ProcessorEndpoint` (`TokenAllowlist.addAllowedToken`, `onlyRole(keccak256('ADMIN'))`). En redes gestionadas eso es Horizen, así que **hay que pedírselo**. Cada app filtra además sus tokens en su configuración (lo hace nuestro guest).
- **[V]** Según el diseño oficial (`docs/design/ERC20_DEPOSITS_WITHDRAWALS_DESIGN.md`), deben excluirse los tokens rebasing, fee-on-transfer y ERC-777. Tokens pausables o con lista negra (USDC) funcionan, pero si el `ProcessorEndpoint` queda en la lista negra se bloquea todo ese token.
- **Consecuencia para RWA (ERC-7943):** `canReceive`/`canSend` del RWA deben permitir al `ProcessorEndpoint` y a cada destinatario. `forcedTransfer`/`setFrozenTokens` del emisor pueden sacar o congelar colateral en custodia, lo que rompería la verificación de solvencia por token. Hay que pedir al emisor que exima al endpoint y modelarlo como riesgo.
- **[O]** Direcciones en Horizen:
  - ZEN (18 dec): mainnet `0x57da…9280`, testnet `0xb06E…fB87`.
  - USDC.e (**6 dec**): solo mainnet, `0xDF71…6B6c`.
  - cbBTC (**8 dec**).
  - **[T]** Solo había unos 3.166 USDC.e en mainnet (15/09/2026): la liquidez hay que traerla.

### 6.4 Oráculos para el trigger
- **[O]** **Stork** está desplegado en Horizen mainnet y testnet (`0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62`) y en Base y **Base Sepolia** (`0x647DFd812BC1e116c6992CB2bC353b2112176fD6`). Fuente: `Stork-Oracle/Documentation`.
- **[V]** SDK `@storknetwork/stork-evm-sdk` 1.0.5 (Apache-2.0):
  - `getTemporalNumericValueV1(bytes32 id)` devuelve `{uint64 timestampNs, int192 quantizedValue}`, con verificación de antigüedad (típicamente 3600 s según su doc).
  - Es un oráculo *pull*: alguien debe enviar la actualización firmada con `updateTemporalNumericValuesV1`, que tiene coste (`getUpdateFeeV1`).
  - El feed ID es `keccak256("ETHUSD")`. En Horizen solo está documentado explícitamente ETHUSD.
- **Pendiente:** confirmar que existen feeds ZENUSD y USDCUSD y sus decimales en el registro de activos de Stork. Chainlink/Pyth en Horizen: **no hay evidencia**.
- **Decisión:** `AegisPriceTrigger` leerá Stork, normalizará `quantizedValue` a 18 decimales, rechazará valores ≤ 0, y convertirá `timestampNs` a segundos para el payload §3. Un keeper hará `updateTemporalNumericValuesV1` + `poke`.

### 6.5 Frescura: ¿el guest ve el timestamp del request?
- **[V]** No. `process_request` no recibe el timestamp del `PendingRequest`, y la guía exige determinismo (sin `time.Now()`).
- El reloj del guest es el timestamp del último precio de confianza. Los préstamos pueden ejecutarse con precios de hasta el intervalo del keeper.
- **Mitigación:** `poke` frecuente y documentar un intervalo máximo como parámetro operativo.

### 6.6 Verificar firmas externas (PureFi) dentro del guest
- **[V]** El esquema real de PureFi v5 (`purefiprotocol/sdk-solidity-v5`, `PureFiVerifier._validatePayload`):
  - `payload = abi.encode(uint64 ts, bytes sig, bytes pkg)`;
  - `digest = keccak256(abi.encodePacked(ts, pkg))`, sin prefijo EIP-191 ni chain ID;
  - firmante con `ISSUER_ROLE`, `graceTime` de 600 s y sesión de un solo uso;
  - `pkg = abi.encode(uint8 type, uint256 session, uint256 rule, address from, address to, …)`.
- **[V]** `decred/secp256k1` + `x/crypto/sha3` **compilan y se ejecutan en TinyGo/WASI**. `lending/aml.go` lo implementa: rechaza `s` alto como OpenZeppelin, exige que `from` o `to` sea el sender, rechaza los tipos 2/3 (sin vinculación al llamador), valida emisor y regla, quema la sesión, y usa como reloj el último precio de confianza.
- **Tests:** vectores generados de forma independiente con Foundry `cast`, más un test dentro del WASM real.
- **Solo bloquea la entrada** (`supply`, `add_collateral`, `borrow`, `liquidate`). Las salidas (`repay`, `withdraw`, `redeem`, `remove_collateral`) quedan abiertas para no atrapar fondos. Los depósitos no se pueden bloquear dentro del guest porque ya están en custodia.
- **[O]** El PureFi Verifier está **solo en Horizen mainnet** (`0x681Edd4906e2a0a277E2A6c394A4595f83e1329c`), no en testnet. Hace falta la lista de **emisores** (`ISSUER_ROLE`) y el **rule ID** de producción, y pedir a PureFi paquetes de prueba o un emisor de testnet.

### 6.7 Política de fee/fuel (liquidadores incluidos)
- **[V]** `executor.go` y `ProcessorEndpoint.sol`:
  - `fee = max(fuel × EXECUTOR_FUEL_PRICE_PER_UNIT, MIN_FEE_PER_REQUEST)`, **siempre en ETH**. Lo aporta quien envía el request (`maxFeeValue`) y el sobrante se devuelve.
  - El fee va al **`feeCollector` del operador**, no a la app.
  - Un request fallido cobra `MIN_FEE_PER_REQUEST`.
  - Los `TRUSTPROCESS` del trigger cuestan 0.
  - El **fuel lo declara la propia app**: no hay medición real en v0.2.0.
- **Consecuencias:**
  - Un liquidador paga un fee pequeño en ETH por intento, y un intento fallido cuesta la tarifa mínima.
  - **Los ingresos del protocolo deben generarse dentro de la app.** Por eso se añadió `reserveFactorBps` + `treasury`: una parte del interés va a reservas, que solo la tesorería puede retirar (`collect_reserves`). De ahí saldría la contribución al staking de ZEN.
- Facilitador (`submitRequestFor`, EIP-712 + EIP-2612): permite que un servicio pague el gas y el fee por el usuario en depósitos ERC-20.

### 6.8 Licencia
- **[V]** Vela, `vela-common-go` y vela-nova usan BUSL 1.1, con uso adicional limitado a "internal evaluation and testing". **Producción requiere una licencia de la Horizen Foundation.** Es la única pregunta que **solo Horizen puede responder**.

### 6.9 Verificación contra la documentación oficial (`HorizenOfficial/horizen-docs`, 16/09/2026)
- **[O] Vela:** v0.2.0. `introduction.md` dice "deployed on Base Sepolia testnet and Horizen testnet", mientras que `roadmap.md` lista solo Base Sepolia: la documentación se contradice. El acceso es "Reach out on Discord", el autoservicio está "coming soon" y hay una app por entorno.
- **[O] Fees:** "Fees are set by the application. There is currently no automatic metering." Confirma §6.7.
- **[O] Stork:** `quantizedValue` con **18 decimales**, así que el trigger se configura con `feedDecimals = 18`. El keeper necesita una API key de Stork.
- **[V] Registro de activos de Stork:** `USDCUSD` existe (`0x7416a56f…290c`, igual a `keccak256("USDCUSD")`). **No existe ningún feed ZEN.** Hay que pedirlo a Stork, o usar ETH/cbBTC (`ETHUSD`, `BTCUSD`) como colateral.
- **[O] PureFi:** requiere suscripción (dashboard.purefi.io), registrar el contrato `to` y un rule ID. El verificador está solo en Horizen mainnet.
- **[O] Direcciones de tokens:** tZEN en Base Sepolia `0x107fdE93838e3404934877935993782F977324BB`; ZEN OFT en Horizen testnet `0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87`.
- Los mensajes, separados por destinatario (Horizen, Stork y PureFi), se mantienen como documento interno del equipo, fuera del repositorio.

### Qué queda para Horizen DevRel (y solo eso)
1. Acceso anticipado a Vela en Base Sepolia y las direcciones de `ProcessorEndpoint`/`TeeAuthenticator`.
2. Incluir USDC y ZEN (y más adelante un RWA) en la `TokenAllowlist`.
3. Feeds Stork disponibles (ZENUSD, USDCUSD) y decimales.
4. Emisor y rule ID de PureFi para pruebas.
5. Licencia BUSL para producción y fecha estimada de Vela en Horizen.

## 7. Próximos pasos

1. ~~`AegisPriceTrigger.sol`~~ **Hecho** (`vela-app/trigger/`). Extiende el `AbstractTrigger` oficial (submódulo `HorizenOfficial/vela` fijado en `v0.2.0`, uso de evaluación y pruebas permitido por BUSL) y lee Stork. Normaliza decimales por feed, rechaza precios obsoletos, ≤ 0 o futuros, y siempre envía el conjunto completo de tokens. Usa `block.timestamp` como reloj del guest. Se probó con `MockTriggerEndpoint` y `TokenAllowlist` oficiales de Vela, más un vector compartido Solidity↔Go. **Pendiente:** confirmar los IDs y decimales reales de los feeds ZENUSD/USDCUSD (§6.4); son parámetros del constructor.
2. ~~E2E~~ **Hecho** (`vela-app/wasmtest/fullstack_e2e_test.go`), sin Docker, sobre el harness oficial `pkg/testutil/fullstack` de Vela v0.2.0. Ese harness levanta una cadena simulada con los contratos reales (`ProcessorEndpoint`, `TokenAllowlist`, `TeeAuthenticator`), el Manager, el Executor (cifrado ECDH/AES, `stateUpdate` firmados) y el runtime WASM real: es el camino de producción menos red y atestación Nitro.
   - **Flujo:** deploy con trigger → `poke` → TRUSTPROCESS con precios de Stork (mock) → depósitos ERC-20 cifrados (supply, add_collateral) → borrow y rechazo sobre el LTV → retiro y pending claim → caída de precio → liquidación ciega → retiro y `claim` del colateral incautado.
   - **Verificación de privacidad on-chain:** ningún log entre la liquidación y el retiro del liquidador contiene la dirección del prestatario. Un control positivo demuestra que el escaneo detecta direcciones.
   - **Pendiente:** el mismo recorrido contra el stack Docker oficial o Base Sepolia (acceso anticipado).
3. ~~Cliente en el frontend~~ **Hecho.** El frontend usa `@horizen/vela-common-ts` 0.2.0 (BUSL, versión fijada), cargado de forma diferida:
   - registro de clave P-521 derivada de la billetera (`ASSOCIATEKEY`);
   - instrucciones cifradas con depósito ERC-20 adjunto;
   - espera del `RequestCompleted`, eventos propios descifrados en el navegador, reporte de solvencia y `claim`.
   Se eliminaron la simulación, los datos inventados y el inspector de zkVerify.
   Verificación: un fixture de instrucciones compartido JS↔Go (el guest decodifica y ejecuta exactamente lo que construye la UI), interoperabilidad P-521 en ambos sentidos entre la librería del navegador y `vela/pkg/crypto`, y Playwright sobre los estados sin configuración y sin billetera.
   **Pendiente:** un flujo con billetera real contra Vela en Base Sepolia (requiere acceso, §6.2).
4. ~~Tasa por utilización~~ **Hecho.** Modelo de dos pendientes (`rateModel`) sobre U = deuda / (caja + deuda), con la APR evaluada al inicio de cada intervalo entre precios de confianza; U y la APR se publican en el reporte de solvencia. Tests de forma (extremos, continuidad en el kink, monotonía, pendiente mayor sobre el kink), valores exactos de acumulación al 50 % y 90 % de U, e invariantes fuzz con el modelo activo.
5. Colateral ERC-7943 real (§6.3), pendiente de la respuesta de DevRel sobre tokens restringidos.
6. ~~Demo en red~~ **Hecho (30/09/2026)** en Horizen testnet (§6.2, `docs/DEMO.md`). Aprendizajes operativos:
   - El RPC público de Caldera limita el ancho de banda por IP. graph-node usa un RPC aparte para no dejar al manager sin cuota.
   - El RPC limita `eth_getLogs` a 100.000 bloques (~27 h), así que todas las consultas de eventos van acotadas; el SDK nombra al revés `fromBlock` y `toBlock`.
   - CoinGecko bloquea IPs de datacenter y Binance bloquea EE. UU.: el keeper publica la mediana de Coinbase, OKX, KuCoin y CoinGecko, con al menos 2 fuentes.
   - El gas en Horizen testnet es de ~0,001 gwei: toda la demo costó menos de 0,0001 ETH.
7. Pendiente: la misma demo sobre Vela **atestado** y el oráculo Stork, cuando haya acceso o feed de ZEN.
