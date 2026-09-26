# Mensajes para Horizen, Stork y PureFi

> Nota para el equipo. Basado en la documentación oficial de Horizen (`HorizenOfficial/horizen-docs`,
> commit `206fb4f`, 16/09/2026), en el registro de activos de Stork y en el SDK de PureFi v5.
> Solo se pregunta lo que esa documentación **no** responde. Completar `[NOMBRE]` y `[CONTACTO]`.

## Qué ya responde la documentación (no hace falta preguntar)

| Tema | Respuesta documentada | Fuente |
|---|---|---|
| Lenguaje | TinyGo → WASM | `docs/vela/introduction.md` |
| Fees / fuel | Los fija la app; no hay medición automática | `docs/vela/introduction.md` |
| Decimales de Stork | `quantizedValue` con 18 decimales | `docs/horizen-chain/integrations/stork-oracle.md` |
| Feed de USDC | `USDCUSD` = `0x7416a56f…290c` = `keccak256("USDCUSD")` | Stork Asset ID Registry |
| Quién añade tokens a la allowlist | El rol admin del contrato `TokenAllowlist` (independiente de `ProcessorEndpoint`) | `docs/vela/reference/smart-contracts.md` |
| Quién despliega apps | Quien tenga `DEPLOYER_ROLE` en `ProcessorEndpoint` | ídem |
| PureFi | Requiere suscripción en dashboard.purefi.io, registrar el contrato de destino y un *rule ID*; el verificador está solo en Horizen mainnet | `docs/horizen-chain/integrations/purefi.md` |

## Qué NO responde y requiere contacto

1. **Acceso a Vela en red (Horizen).** La documentación dice textualmente: "Base Sepolia Testnet — Live network testing for early builders. Reach out on Discord to get access". El despliegue autoservicio está anunciado como "coming soon". No se publican direcciones de `ProcessorEndpoint`/`TeeAuthenticator`.
2. **Contradicción en la propia documentación.** `introduction.md` dice que Vela está "deployed on Base Sepolia testnet **and Horizen testnet**", pero `roadmap.md` solo lista Base Sepolia.
3. **Feed de ZEN (Stork).** **No existe** ningún feed ZEN en el registro oficial de Stork. El tutorial de Horizen menciona `ZENUSD` solo como ejemplo de nombre. Stork ofrece añadir feeds nuevos ("in as little as 24 hours", sales@stork.network). El keeper también necesita una API key de Stork.
4. **PureFi en testnet.** No hay verificador en Horizen testnet ni en Base Sepolia según la documentación.
5. **Licencia BUSL** de Vela para producción: la documentación no la menciona.

---

## Mensaje 1 — Horizen (Discord: https://discord.gg/horizen, canal de builders/Vela)

> Hi Horizen team! We're building **Aegis Protocol**, a confidential lending market for the Builder
> Fund Category 1 RFP (*Private borrow-lend*). It is a TinyGo WASM app on Vela v0.2.0 with a Stork
> price trigger. It already passes a full E2E on your `pkg/testutil/fullstack` harness (blind
> liquidation, encrypted ERC-20 deposits, no borrower address in any liquidation log):
> https://github.com/zzzbedream/Aegis-Protocol/pull/1
>
> Following the roadmap page ("reach out on Discord to get access"), we'd like to request:
>
> 1. **Access to a Vela testnet environment.** Your intro page says Vela is deployed on Base Sepolia
>    *and* Horizen testnet, but the roadmap lists only Base Sepolia; which should we use? We'd need the
>    `ProcessorEndpoint` / `TeeAuthenticator` addresses and `DEPLOYER_ROLE` (or you deploying our
>    WASM, since environments host one app at a time today). We'd also deploy our trigger with
>    `submitDeployRequestWithTrigger`.
> 2. **TokenAllowlist.** Please allowlist a USDC token and tZEN (`0x107fdE93838e3404934877935993782F977324BB`
>    on Base Sepolia, or `0xb06EC4ce262D8dbDc24Fac87479A49A7DC4cFb87` on Horizen testnet) in that environment.
> 3. **Licensing.** Vela and `vela-common-go`/`vela-common-ts` are BUSL 1.1 with an evaluation-only grant.
>    What are the terms for a grantee's production (mainnet) deployment?
>
> Thanks! [NOMBRE] — [CONTACTO]

## Mensaje 2 — Stork (sales@stork.network)

> Hi Stork team, we're building a lending market on Horizen (and Base Sepolia for testing) that reads
> Stork prices on-chain via `getTemporalNumericValueV1`. Your Asset ID Registry has `USDCUSD` but no
> ZEN feed. Could you add **ZENUSD** (Horizen's token), available on Horizen mainnet/testnet
> (`0xacC0…fd62`) and Base Sepolia (`0x647D…6fD6`)? We'd also need an **API key** for our keeper that
> pushes updates with `updateTemporalNumericValuesV1`. Thanks! [NOMBRE] — [CONTACTO]

## Mensaje 3 — PureFi (dashboard.purefi.io / soporte)

> Hi PureFi team, we're integrating PureFi v5 screening in a confidential lending app on Horizen.
> The payload is verified inside a TEE (we replicate `PureFiVerifier._validatePayload`: issuer
> signature over `keccak256(timestamp ‖ package)`, from/to binding, session replay protection).
> 1) Is there a **test environment** (issuer + verifier) usable on Horizen testnet or Base Sepolia?
> 2) Which **issuer signing addresses** (`ISSUER_ROLE`) and **rule ID** do you recommend for lending/AML?
> 3) The issuer requires the `to` contract to be registered in the Dashboard. Our funds go through
>    Vela's `ProcessorEndpoint`: can we register that address (or our trigger contract) as `to`?
> Thanks! [NOMBRE] — [CONTACTO]

---

## Si no se envía nada

- El código y todas las pruebas siguen funcionando: local, CI y harness oficial de Vela.
- **No habrá despliegue en ninguna red**: sin acceso de Horizen no hay `ProcessorEndpoint` donde desplegar.
- **Alternativa sin Stork:** usar ETH o cbBTC como colateral, que sí tienen feeds (`ETHUSD`, `BTCUSD`), en lugar de ZEN. Es solo configuración del mercado y del trigger; no requiere cambiar código.
- **Alternativa sin PureFi:** desplegar el mercado con AML desactivado (`aml.issuers` vacío), declarándolo en la postulación.
