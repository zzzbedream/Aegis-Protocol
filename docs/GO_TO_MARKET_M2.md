# Aegis Protocol: Estrategia Go-To-Market (GTM) y Captación de Liquidez Institucional (Hito 2 y Hito 3)

## 1. Visión Ejecutiva
Para cumplir y superar los criterios de evaluación de **Thrive Protocol** y el **Horizen Builder Fund** en el Hito 2 (M2: Tracción, TVL y Uso Real), Aegis Protocol desplegará una estrategia de salida al mercado orientada exclusivamente a contrapartes institucionales, fondos de cobertura y emisores de RWA, respaldada por la privacidad técnica demostrada en el Hito 1 (M1).

---

## 2. Perfil de Contrapartes y Liquidez Semilla (POL)

### 2.1 Protocol-Owned Liquidity (POL) de la Fundación Horizen
- **Activo Base**: Token ZEN (LayerZero OFT / ERC-20).
- **Asignación Semilla**: $500.000 a $1.000.000 USD en ZEN depositados en `AegisVault.sol` como colateral inicial institucional.
- **Propósito**: Proporcionar profundidad inicial en el mercado de crédito institucional, garantizando un piso de TVL desde el día 1 de Mainnet.

### 2.2 Fondos Cripto y Market Makers Institucionales (2-3 Alianzas Ancla)
- **Pain Point Resuelto**: Las mesas de trading institucional y los creadores de mercado enfrentan cacerías de liquidación (*liquidation hunting*) e inspección de balances en protocolos DeFi públicos (Aave, Compound). Aegis les permite apalancarse o acceder a liquidez sin revelar sus factores de salud ni sus direcciones públicas.
- **Onboarding**: Validación rápida de cumplimiento normativo mediante el SDK de **PureFi** (Regla 43: Tier 1 Institucional) sin recopilación ni almacenamiento de PII en la cadena.

---

## 3. Arquitectura de Rendimiento e Incentivos: "Aegis Shield Points"

```
[Depósito Confidencial de Colateral (ZEN / RWA)]
                       │
                       ▼
         ┌───────────────────────────┐
         │   Aegis Shield Points     │
         │  (Volumen × Duración)     │
         └─────────────┬─────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[Rendimiento Subvencionado]   [Multiplicador Retroactivo]
   8-12% APY en ZEN              Onboarding antes del
(Grants Ecosistema Horizen)       Día 30 de Mainnet (2.0x)
```

### 3.1 Puntos "Aegis Shield"
- **Mecánica**: Los puntos se acumulan por dólar de colateral confidencial depositado y por dólar prestado por día.
- **Multiplicador de Fidelidad**: 1.5x para posiciones bloqueadas a más de 60 días; 2.0x para instituciones que completen la verificación PureFi durante los primeros 30 días de Mainnet.
- **Conversión**: Ponderación para futura gobernanza descentralizada del protocolo en el Hito 3.

### 3.2 Rendimiento Subvencionado
- Tasa preferencial en depósitos de ZEN y bonos RWA subvencionada mediante tramos de financiación del ecosistema Horizen.
- Costo de endeudamiento competitivo en stablecoins (USDC) para maximizar la tasa de utilización del mercado de crédito.

---

## 4. Red Abierta de Liquidadores Ciegos (`@aegis/blind-liquidator-bot`)

Para garantizar la solvencia permanente del protocolo durante periodos de alta volatilidad sin comprometer la privacidad del deudor:

1. **SDK Institucional de Código Abierto**:
   - Bot en TypeScript sobre `@horizen/vela-common-ts` (a construir).
   - Monitorea el reporte público de solvencia (`AppEvent` `AEGIS.SOLVENCY`), que expone solo la cantidad y la deuda agregada de posiciones liquidables, sin identidades.
2. **Incentivo Económico**:
   - Bonificación de liquidación del **5% al 8%** de descuento sobre el colateral incautado (ZEN o RWA).
3. **Onboarding Descentralizado**:
   - Cualquier firma de arbitraje o market maker con verificación AML de PureFi (si el mercado la exige) puede liquidar enviando a Vela un request cifrado `liquidate` con el colateral y el monto máximo a repagar.
   - **Garantía de privacidad**: el liquidador no elige ni nombra la posición. El enclave aplica el pago a la posición con peor factor de salud bajo 1,0, y on-chain solo se ve el depósito del liquidador y su retiro del colateral. Verificado en el E2E (`vela-app/wasmtest/fullstack_e2e_test.go`): ningún log de la liquidación contiene la dirección del prestatario.

---

## 5. Cronograma de Fases (90 Días) y Métricas de Thrive Protocol

| Fase | Ventana | Hitos Operativos y Técnicos | Métricas Clave de Thrive Protocol |
| :--- | :--- | :--- | :--- |
| **Fase 1: Auditoría y Mainnet** | Días 1 – 30 | • Auditoría externa de seguridad de contratos Solidity.<br>• Despliegue en Horizen L3 Mainnet (Liberación del 20%).<br>• Inyección de liquidez semilla POL de Horizen ($500k-$1M). | • Despliegue 100% verificado en Mainnet.<br>• TVL Inicial: $1.000.000 USD.<br>• Auditoría de seguridad aprobada. |
| **Fase 2: Adquisición Institucional** | Días 31 – 60 | • Lanzamiento del *Aegis Shield Points Program*.<br>• Onboarding de 2-3 fondos cripto ancla vía PureFi.<br>• Publicación del SDK de bot de liquidación ciega. | • TVL: $2.000.000 – $3.000.000 USD.<br>• 25+ Carteras Activas Mensuales (MAW).<br>• Volumen Acumulado: $2.5M USD. |
| **Fase 3: Expansión RWA y Madurez** | Días 61 – 90 | • Activación de colaterales RWA (bonos ERC-7943).<br>• Conexión con mesas OTC y custodia institucional.<br>• Preparación para el Hito 3 (Escalado cross-chain). | • **TVL Objetivo: $3M+ USD**.<br>• **>50 MAW institucionales**.<br>• **Volumen Total: >$5M USD**.<br>• 100% de liquidaciones ciegas exitosas. |

---

## 6. Argumentario Clave para la Solicitud Formal (Thrive Protocol)

1. **Eficiencia de Capital**: El protocolo no depende de subsidios infinitos, sino de una utilidad genuina: protección institucional contra cacerías de liquidación en DeFi.
2. **Utilidad Directa para el Ecosistema**: Eleva la demanda y utilidad del token ZEN como colateral institucional de primer nivel en Horizen L3.
3. **Cumplimiento Realista**: Resuelve la dicotomía entre privacidad y regulación al incorporar PureFi AML y ERC-7943 desde el núcleo del protocolo.
