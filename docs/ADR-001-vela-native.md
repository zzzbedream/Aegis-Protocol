# ADR-001 — Arquitectura nativa de Horizen Vela

- **Estado:** Aceptada (M1 en construcción)
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
| **Precios** | `AegisPriceTrigger` (este repo, **pendiente**) → `TRUSTPROCESS` | on-chain → enclave |

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
- **Frescura de precios:** el guest no tiene reloj, así que no puede rechazar un precio "viejo" al momento de un préstamo. Mitigación operativa: un keeper de `poke` frecuente. Queda como pregunta abierta a DevRel (ver §6).
- **Confianza:** hardware AWS Nitro y medición PCR0; el operador (Manager) para la disponibilidad; la fuente de oráculo del trigger.
- **Licencia:** Vela y `vela-common-go` usan **BUSL 1.1** con un *Additional Use Grant* que solo permite "evaluación y pruebas internas". **Producción (mainnet) requiere un acuerdo de licencia con la Horizen Foundation.**

## 5. Estado del código legado

`contracts/src/core/*`, `contracts/src/compliance/*`, `contracts/src/mocks/MockZkVerify.sol` y `tee-enclave/` quedan como **legado, no aptos para producción**. Se conservan solo como referencia hasta que el M1 nativo los reemplace por completo. El "ERC-7943" del repo no implementa el estándar final: el ERC-7943 real define `canSend`, `canReceive`, `canTransfer`, `getFrozenTokens`, `setFrozenTokens` y `forcedTransfer`.

## 6. Preguntas abiertas para Horizen DevRel

1. ¿Se aceptan guests en Rust (`wasm32-wasi`), o TinyGo es el único lenguaje soportado?
2. ¿Qué red se usa para el M1 (devnet público de Vela, Base Sepolia u Horizen L3)? ¿Cuál es el chain ID/RPC oficial y cuáles son las direcciones de `ProcessorEndpoint`/`TeeAuthenticator`?
3. ¿Qué proceso hay para incluir tokens en la `TokenAllowlist` (ZEN, USDC y un RWA ERC-7943)? ¿`canReceive` del RWA debe autorizar al `ProcessorEndpoint`?
4. ¿Qué oráculos (Chainlink/Pyth/otro) están disponibles en la red objetivo para el trigger?
5. ¿Puede el guest acceder al `timestamp` del `PendingRequest` para validar la frescura de los precios?
6. ¿Hay un patrón recomendado para verificar firmas externas (PureFi) dentro del guest, sin go-ethereum?
7. ¿Cuál es la política de fee/fuel? ¿Se puede cobrar un fuel variable (la liquidación recorre todas las cuentas)?
8. ¿Cuáles son los términos de licencia (BUSL) para el despliegue en producción de un grantee?

## 7. Próximos pasos

1. `AegisPriceTrigger.sol` (extiende `AbstractTrigger`): cuando `appEventData.subTypes` contiene `bytes32("AEGIS.PRICE_REQUEST")`, lee el oráculo y devuelve el payload de §3. Queda pendiente de la respuesta 4 y de cómo obtener los contratos de Vela como dependencia (BUSL).
2. E2E con el stack Docker del starter kit (`horizen/cce-*:v0.2.0`). No se pudo ejecutar en el entorno de desarrollo actual porque no hay daemon de Docker.
3. Cliente `@horizen/vela-common-ts` en el frontend, reemplazando la simulación.
4. Tasa de interés por utilización, integración PureFi v5 y colateral ERC-7943 real.
