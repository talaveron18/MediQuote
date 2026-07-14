# MediQuote Pro / GASI — preparación del motor de costes

Documento de preparación. No implementa el motor de costes.

## Alcance congelado

No tocar todavía:

- coste real final;
- margen;
- comisión;
- descuento comercial;
- snapshot económico;
- UI de viabilidad;
- autorización comercial.

Ese bloque se trabajará con Fernando presente.

## Objetivo futuro

Separar dos piezas:

1. Motor de coste interno: convenio, grupo profesional, salario, SMI, jornada anual, pluses, Seguridad Social empresa, AT/EP, overhead y alertas.
2. Motor de viabilidad comercial: margen objetivo, margen mínimo, descuento máximo, comisión, semáforo, precio sugerido y autorización.

## Estructura propuesta

```text
src/lib/costing/
  cost-engine.server.ts
  cost-hours-adapter.ts
  commercial-policy.ts
  commercial-projection.ts
  cost-snapshot.ts
  cost-types.ts

src/lib/costing/data/
  convenios.json
  perfilmap.json
  salarios.json
  smi.json
  pluses.json
  seguridad-social.json
  atep.json
  overhead.json
  pricing-policy.json
  sources.json
```

## Datos mínimos pendientes

- Convenio aplicable por provincia.
- Perfil GASI a grupo de convenio.
- Salario anual por grupo.
- Jornada anual.
- SMI por año.
- Pluses por fórmula real.
- Seguridad Social empresa por tipo de contrato.
- AT/EP por CNAE y año.
- Fuentes legales.
- Estado de dato: verificado, provisional, pendiente gestoría o bloqueado.

## Decisiones de Fernando

- Margen objetivo.
- Margen mínimo.
- Comisión comercial.
- Descuento máximo político.
- Tipo de contrato por defecto.
- Jornada anual vs horas facturables.
- Overhead inicial.
- Política con datos pendientes de gestoría.

## Guardarraíles técnicos

- El motor debe consumir el calendario y desglose de MediQuote.
- No debe recalcular un segundo calendario.
- Después del PR de festivo cruzando medianoche, el coste debe leer el `shiftBreakdown` real.
- El motor interno debe ser server-only.
- Los roles no internos solo deben recibir una proyección comercial saneada.
