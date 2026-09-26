# Horizen Builder Fund — Postulación Aegis Protocol (borrador v2)

> Borrador corregido tras la investigación técnica (ver `docs/ADR-001-vela-native.md`).
> `[COMPLETAR]` marca los datos que solo el equipo puede aportar; no se inventaron.
> **Pendiente de confirmar:** idioma de envío del formulario (¿inglés?).

## About you and your project

- **Project name:** Aegis Protocol
- **Contacto / web / GitHub:** `[COMPLETAR]` · https://github.com/zzzbedream/Aegis-Protocol
- **Where is your team primarily based?** Lo Espejo, Chile.
- **Team size / full-time:** `[COMPLETAR]` / `[COMPLETAR]`
- **In one sentence:** Aegis es un mercado de crédito confidencial sobre Horizen Vela para fondos, tesorerías e individuos de alto patrimonio: el tamaño de la deuda, el colateral y el factor de salud de cada posición se mantienen privados, y las posiciones insolventes se liquidan sin revelar a quién pertenecen.
- **Stage:** Prototipo. El motor de crédito es una app WASM de Vela (TinyGo) probada dentro del runtime oficial de Vela v0.2.0. Incluye liquidación ciega, reporte de solvencia, reservas del protocolo y verificación AML PureFi v5 dentro del enclave. El M1 la despliega en la red donde hoy está Vela (Base Sepolia, acceso anticipado) con un trigger de precios Stork, y en Horizen cuando Vela llegue allí.

## Privacy substance

- **What is confidential, and from whom?** El tamaño de la deuda, la composición del colateral dentro del protocolo, el factor de salud y la identidad de la posición liquidada son confidenciales frente al público, los liquidadores, los competidores y el operador del nodo. **Los depósitos y retiros son visibles on-chain**, porque la custodia de Vela es un contrato público. Lo confidencial es el estado interno.
- **What breaks without privacy?** En los mercados transparentes (Aave, Compound) el factor de salud de cada cuenta es público. Eso permite cazar liquidaciones de posiciones grandes, copiar el apalancamiento y ver la estrategia de la contraparte. Un prestatario con reputación que proteger queda en la práctica excluido del crédito on-chain.
- **Confidentiality approach:** TEE / confidential compute (Vela).
- **Why this primitive, and which tradeoffs?** La lógica de riesgo corre como app WASM dentro de Vela (AWS Nitro Enclaves). El `TeeAuthenticator` de Horizen verifica on-chain la atestación Nitro (PCR0) y la firma de cada transición de estado. El estado se cifra en reposo y los eventos se cifran por usuario. Aceptamos estos compromisos:
  - confianza en el hardware AWS Nitro y en la medición del enclave;
  - dependencia del operador (Manager) para la disponibilidad;
  - un canal de correlación temporal entre movimientos públicos de fondos y eventos internos.

  No usamos pruebas ZK: la RFP pide solvencia demostrable y la entregamos publicando agregados atestados.
- **Hardest unsolved problem and approach:** Liquidar sin revelar quién está insolvente. El liquidador no elige la posición: deposita el activo de repago y la app aplica el pago, de forma determinista, a la posición con peor factor de salud bajo 1,0 que tenga el colateral indicado. Le entrega el colateral con descuento y solo notifica, cifrado, al liquidador y al prestatario. On-chain solo se ve "el liquidador X depositó Y y retiró Z". Los precios entran mediante un contrato *trigger* que lee oráculos on-chain, porque la app es determinista y no tiene reloj ni red. Riesgos abiertos que declaramos: la frescura de precios entre actualizaciones y el sondeo por parte de liquidadores.
- **Existing implementations studied:** Aave y Compound publican el factor de salud de cada cuenta. NoctFinance entregó una demo de préstamo confidencial en Vela durante Horizen Acceleration. Agama (otro postulante a este fondo) optó por compromisos más pruebas ZK en Horizen y deja Vela para una fase 2. Aegis es nativo de Vela desde el M1: el libro de crédito completo vive en el enclave. `[COMPLETAR tras revisar el código de Noct: diferencias concretas]`
- **What do most teams get wrong?** Tratar la privacidad como ofuscar el grafo de transacciones y olvidar que los propios errores y eventos de la app filtran datos. En Aegis los mensajes de error son genéricos, los agregados se publican solo bajo demanda, y el acceso regulatorio pasa por el canal de desanonimización de Vela, controlado por `AuthorityRegistry`, en lugar de por puertas traseras.

## Demand & market

- **User:** `[COMPLETAR con un caso concreto: tipo de fondo, tamaño de posición, activo de colateral y por qué hoy no pide prestado on-chain]`
- **Evidence of demand:** `[COMPLETAR con evidencia citable: conversaciones con fondos (cartas de intención), datos públicos de liquidaciones de posiciones grandes, etc.]` *No afirmar "la principal barrera reportada" sin una fuente.*
- **How will it make money?** Una fracción configurable del interés pagado por los prestatarios (`reserveFactorBps`) se acumula como reservas del protocolo dentro del enclave y solo la tesorería puede retirarla. Ya está implementado y probado. Los fees de ejecución de Vela van al operador de la red, no a la app, así que los ingresos de Aegis salen del diferencial de intereses. *(Opcional futuro: una comisión sobre el bonus de liquidación.)*
- **First 100 users:** `[COMPLETAR: fondos ancla con nombre o tipo, canal de llegada; el programa "Aegis Shield Points" solo si está diseñado]`

## Team & execution capability

- **Team and prior shipping:** `[COMPLETAR]`
- **Who writes the privacy-critical code (TinyGo/WASM, Solidity trigger):** `[COMPLETAR nombre y experiencia]`
- **Full-time:** `[COMPLETAR]`

## RFP response

- **Fit and deliberate differences:** Responde directamente a la RFP *Private borrow-lend protocol*:
  - posiciones confidenciales;
  - solvencia demostrable (reporte agregado atestado);
  - intereses mediante un índice de préstamo;
  - liquidación que funciona sin exponer al prestatario.

  Nos diferenciamos en que el cumplimiento regulatorio usa el canal nativo de Vela (reportes de desanonimización cifrados hacia autoridades autorizadas) y está previsto integrar PureFi.
- **Where we disagree with the framing:** `[OPCIONAL]` Una observación honesta: en Vela, los depósitos y retiros son públicos. La "posición" confidencial es el estado interno, y la RFP podría explicitar el nivel de privacidad esperado frente a la correlación temporal.
- **Integration with the Horizen app cluster:** Colateral y activo de deuda de la `TokenAllowlist` de Vela (ZEN y stablecoins), y liquidez de las demás apps del clúster cuando existan. `[COMPLETAR solo con integraciones confirmadas]`
- **Long-term maintenance:** `[COMPLETAR]`

## Funding ask & use of funds

- **Amount:** `[COMPLETAR]` (tope de Core Apps: USD 150 000)
- **Breakdown:** `[COMPLETAR]`. Validar el costo de la auditoría con cotizaciones reales; el alcance es el guest TinyGo más el contrato trigger.
- **Current funding and runway:** `[COMPLETAR]`

## Milestones & timeline

- **M1 — Technical capability:**
  - App de crédito en Vela (TinyGo): depósito, colateral, préstamo, repago, intereses y liquidación ciega.
  - Contrato trigger de precios.
  - Despliegue en Vela sobre Base Sepolia (acceso anticipado); en Horizen testnet (2651420) cuando Vela esté disponible allí.
  - Tests del guest dentro del runtime de Vela y un E2E con el stack oficial.
  - CI.
  - **Fecha:** `[COMPLETAR]`
- **M2 — Security audit:** Sí, obligatorio. Alcance: `vela-app/` más el trigger.
- **M3 — Real usage:**
  - Despliegue en producción, sujeto a la disponibilidad de Vela en mainnet y al acuerdo de licencia BUSL con la Horizen Foundation.
  - Al menos una liquidación ciega ejecutada en producción.
  - `[N]` fondos ancla y `[USD X]` de TVL.
  - *Poner cifras de TVL solo con compromisos firmados. USD 1–3 M en 3–4 meses, con auditoría incluida, es muy agresivo.*
  - **Fecha:** `[COMPLETAR]`
- **Most likely reason to miss dates:** Vela aún no está desplegado en la red de Horizen (hoy solo en Base Sepolia con acceso anticipado; Horizen es el paso 3 de su roadmap) y su licencia BUSL exige un acuerdo para producción. Riesgos secundarios: feeds de Stork disponibles para ZEN y USDC, e inclusión de tokens en la `TokenAllowlist`, que administra Horizen.

## Long-term alignment & ZEN staking

- **ZEN utility:** ZEN como colateral, con parámetros de riesgo definidos por análisis de liquidez; no subsidiados de entrada. `[AJUSTAR según la estrategia]`
- **24 months with only this grant:** `[COMPLETAR con una proyección defendible]`
- **Staking contribution:** Share of protocol fees. `[COMPLETAR el porcentaje comprometido]`
- **Token launch:** Undecided.
- **Ecosystem contribution:** Publicar como bien público las utilidades reusables para apps Vela en TinyGo: aritmética exacta de 256/512 bits (`MulDiv`), decodificador ABI endurecido para payloads de trigger, y un harness de tests contra el `WasmtimeRuntime` oficial.

## DevRel support

- **Requesting hands-on DevRel support?** Sí. Las preguntas concretas están en `docs/ADR-001-vela-native.md` §6.
