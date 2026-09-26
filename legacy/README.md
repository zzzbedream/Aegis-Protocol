# Legado — NO USAR

Implementación anterior de Aegis (contratos `AegisVault` / `AegisEntrypoint` / `AegisExitpoint`,
verificador PureFi propio, token "ERC-7943" basado en particiones y enclave Rust con servidor propio).
Se conserva solo como referencia histórica. Fue reemplazada por la app nativa de Vela en
[`../vela-app/`](../vela-app/).

Defectos críticos confirmados con pruebas de concepto (detalle en `../docs/ADR-001-vela-native.md` §1):

- El destinatario del retiro no está ligado a la firma del TEE, lo que permite front-running.
- El Health Factor satura en `u128`: una posición sana (HF 1,6) se lee como 0,068 y se puede liquidar.
- El owner del Vault puede vaciar las allowances de terceros.
- El payload "cifrado" viaja en claro, y la clave del enclave está fija en el código.
- El colateral RWA queda bloqueado; la deuda repagada queda sin contabilizar.

No tiene CI. `docs/` contiene documentos que describen esa arquitectura y no la actual.
