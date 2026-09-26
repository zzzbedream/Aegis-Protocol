# Aegis Protocol 🛡️

> Mercado de crédito confidencial sobre **Horizen Vela**. El libro de préstamos (colateral, deuda, factores de salud) se ejecuta cifrado dentro de un enclave AWS Nitro, y las posiciones insolventes se liquidan **sin revelar a quién pertenecen**.

Postulación a la RFP *Private borrow-lend protocol* del Horizen Builder Fund (Categoría 1). Decisión de arquitectura, modelo de amenazas y respuestas técnicas: [`docs/ADR-001-vela-native.md`](docs/ADR-001-vela-native.md).

## Estado actual (honesto)

| Componente | Estado |
|---|---|
| Motor de crédito (guest TinyGo) | ✅ Implementado y probado: unitarios, invariantes fuzz, WASM en el runtime oficial de Vela |
| Trigger de precios (Stork → Vela) | ✅ Implementado y probado en Foundry |
| E2E con el harness oficial de Vela v0.2.0 | ✅ Cadena simulada con los contratos reales de Vela, Manager, Executor y WASM |
| Despliegue en red real | ⏳ Vela hoy solo está en **Base Sepolia (acceso anticipado)**; pendiente de acceso ([`docs/grant/devrel-request.md`](docs/grant/devrel-request.md)) |
| Frontend | ⚠️ Interfaz de demostración; aún no conectada a Vela |
| Auditoría | ❌ No auditado. **No usar con fondos reales.** |

## Cómo funciona

```
Usuario ──(request cifrado P-521/AES-GCM + depósito ERC-20)──▶ ProcessorEndpoint (Horizen, on-chain)
                                                                      │  custodia de fondos
                                                                      ▼
                                   Manager ──▶ Executor (AWS Nitro) ──▶ aegis_lending.wasm
                                                                      │  estado cifrado AES-256-GCM
                                                                      ▼
                    stateUpdate firmado (secp256k1, verificado por TeeAuthenticator)
                    ├─ eventos cifrados por usuario
                    ├─ retiros (pull-payment, `claim`)
                    └─ AppEvent público: solo agregados de solvencia

AegisPriceTrigger (Stork) ──TRUSTPROCESS──▶ precios + reloj del guest (interés, frescura AML)
```

- **Liquidación ciega**: el liquidador envía un request cifrado `liquidate` indicando solo el colateral y el monto máximo; **no nombra al prestatario**. El enclave elige de forma determinista la posición con peor factor de salud bajo 1,0.
- **Solvencia demostrable**: `poke` publica agregados (activos, deuda, reservas, colateral total y posiciones liquidables) sin identidades.
- **Cumplimiento**: reportes de desanonimización cifrados hacia autoridades registradas en el `AuthorityRegistry` de Vela, y verificación opcional de PureFi v5 dentro del enclave.
- **Qué es público y qué no**: los depósitos y retiros (dirección, token, monto) son públicos por diseño de la custodia de Vela. El tipo de operación, la deuda, el colateral, el factor de salud y la identidad del liquidado son privados. Riesgos residuales (correlación temporal, frescura de precios): ADR §4.

## Estructura

| Ruta | Contenido |
|---|---|
| [`vela-app/`](vela-app/) | Guest TinyGo (`lending/`), tests del runtime y E2E (`wasmtest/`) |
| [`vela-app/trigger/`](vela-app/trigger/) | `AegisPriceTrigger.sol` (Foundry, dependencias como submódulos) |
| [`docs/`](docs/) | ADR, estrategia de mercado, borradores de la postulación y del mensaje a DevRel |
| [`frontend/`](frontend/) | Interfaz Vite + React (demo, aún simulada) |
| [`legacy/`](legacy/) | Implementación anterior (contratos propios y enclave Rust). **Tiene defectos críticos conocidos; no apta para uso.** Se conserva solo como referencia |

## Desarrollo

Requisitos: Go 1.24, TinyGo ≥ 0.39, Foundry, Node 22.

```bash
git submodule update --init vela-app/trigger/lib/forge-std vela-app/trigger/lib/openzeppelin-contracts vela-app/trigger/lib/vela

# Motor de crédito (Go puro)
cd vela-app && make test

# Trigger de precios
cd vela-app/trigger && forge build && forge test -vv

# WASM en el runtime de Vela + E2E completo (necesita el paso anterior)
cd vela-app && make test-wasm

# Frontend
cd frontend && npm ci && npm run build
```

El CI (`.github/workflows/ci.yml`) ejecuta todo lo anterior y falla si algún test se salta.

## Redes

| Red | Chain ID | RPC | Notas |
|---|---|---|---|
| Horizen mainnet | 26514 | `https://horizen.calderachain.xyz/http` | L3 OP Stack sobre Base; gas en ETH |
| Horizen testnet | 2651420 | `https://horizen-testnet.rpc.caldera.xyz/http` | Sobre Base Sepolia |
| Base Sepolia | 84532 | — | Donde está Vela hoy (acceso anticipado) |

Fuente: `HorizenOfficial/horizen-mcp`. El chain ID 7332 corresponde a la cadena Horizen EON, ya deprecada.

## Licencias y dependencias

Vela y `vela-common-go` usan **BUSL 1.1** con uso permitido solo para evaluación y pruebas; **producción requiere una licencia de la Horizen Foundation**. Stork SDK: Apache-2.0. OpenZeppelin: MIT. Este repositorio aún no declara una licencia propia.
