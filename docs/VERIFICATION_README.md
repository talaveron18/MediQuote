# MediQuote Pro / GASI — README de verificación

Este documento deja un mapa verificable de lo hecho hasta ahora y de lo que viene. El objetivo es que Fernando pueda auditar después sin perder el hilo.

## Regla de alcance

No se ha tocado el motor de costes, precios, margen, salario, Seguridad Social, AT/EP, overhead ni viabilidad económica. Ese bloque queda reservado para trabajarlo con Fernando presente.

Lo trabajado hasta ahora está limitado a:

- motor de calendario, horas y recargos;
- persistencia de campos de bloques;
- permisos de presupuestos;
- configuración legal básica de descanso;
- documentación y trazabilidad de hallazgos.

## Pull requests abiertos

### PR #1 — `fix(calc): corregir recurrencia y alcance de festivos`

Rama: `fix/calc-p0-holidays-recurring`

Bloque base de cálculo/persistencia.

Incluye:

- `Holiday.recurring` por defecto a `false`.
- Festivos fijos nacionales marcados explícitamente como recurrentes.
- Semana Santa no recurrente y calculada por año.
- Festivos autonómicos/locales fuera del seed global salvo localización explícita.
- Tests de recurrencia y alcance territorial.
- Arreglos de motor ya auditados: plantilla mínima con horas reales, ceros explícitos en bloques simples y persistencia de campos especiales.
- Panel legal recuperado sin amputar funcionalidad.

Estado conocido: CI verde.

### PR #4 — `fix(budgets): enforce role and ownership permissions`

Rama: `fix/budget-permissions`

Bloque de seguridad de presupuestos.

Incluye:

- Helpers puros de permisos en `src/lib/budget-permissions.ts`.
- Tests de roles y propiedad.
- `GET /api/budgets` filtra por `createdById` cuando el usuario no es `admin`/`maestro`.
- `POST /api/budgets` exige permiso de escritura.
- `PUT /api/budgets` y `DELETE /api/budgets` exigen permiso y propiedad.
- Mantiene saneado de campos internos para roles no internos.

Estado conocido: CI verde.

### PR #6 — `fix(legal): align rest minimum with Spanish ET`

Rama: `fix/calc-audit-findings`

Bloque legal mínimo derivado de auditoría.

Incluye:

- `LaborRule.minRestBetweenShiftsH` de 11h a 12h.
- Seed de `Regla General 40h` con 12h.
- Documentación de que `maxDailyHours = 12` es supuesto operativo/convenio, no límite legal universal.

Estado conocido: CI verde.

### PR pendiente — `fix/calc-midnight-holiday`

Rama: `fix/calc-midnight-holiday`

Bloque P0 de turnos nocturnos que cruzan a festivo.

Incluye:

- `calculateShiftHours()` reparte las horas de día especial por fecha real cuando el turno cruza medianoche.
- Ejemplo cubierto: 31/12 22:00-06:00 con 01/01 festivo nacional.
- Mantiene nocturnidad compatible con festivo porque son conceptos distintos.
- Añade tests específicos en `src/lib/midnight-holiday.test.ts`.

Estado: pendiente de CI en el momento de crear este README.

## Issues de seguimiento

### Issue #5 — P0-CALC: repartir festivos en turnos que cruzan medianoche

Bug caro: antes el turno se clasificaba por fecha de inicio. Un turno 31/12 22:00-06:00 no cobraba las 6h del 01/01 como festivo.

Criterio esperado:

- 22:00-24:00 se clasifica como 31/12.
- 00:00-06:00 se clasifica como 01/01.
- Festivo > domingo > fin de semana por tramo.
- Nocturnidad se mantiene aparte y puede acumularse con festivo.

### Issue #7 — P1-LEGAL: documentar supuesto de jornada diaria máxima 12h

No cambiar motor de precios. Alcance: documentación y trazabilidad legal.

### Issue #8 — P1-CALC: decidir política de descanso en turnos 24h

Decisión pendiente: el descanso en turnos 24h se prorratea actualmente. No es P0, pero debe quedar decidido explícitamente.

## Orden recomendado de verificación

1. Verificar PR #1.
2. Verificar PR #4.
3. Verificar PR #6.
4. Verificar PR `fix/calc-midnight-holiday`.
5. Solo después entrar con Fernando al motor de costes/precios/margen.

## Comandos de verificación local

```bash
npm install
npx prisma generate
npx prisma db push --skip-generate
npx tsc --noEmit
npm test
npm run build
```

## Casos manuales mínimos

### Calendario/festivos

- 31/12/2026 22:00-06:00, con 01/01/2027 festivo nacional:
  - total: 8h;
  - nocturnidad: 8h;
  - festivo nacional: 6h;
  - subtotal a 30 €/h: 240 €;
  - nocturnidad 25%: 60 €;
  - festivo nacional 75%: 135 €;
  - total con recargos: 435 €.

### Legal panel

- Administración > parámetros legales:
  - buscar;
  - filtrar;
  - crear;
  - editar;
  - eliminar/desactivar;
  - vincular ficha legal;
  - abrir drawer legal.

### Permisos

- `maestro/admin`: ven todos los presupuestos y campos internos.
- `comercial`: ve solo sus presupuestos y no ve campos internos.
- `comercial`: no puede modificar/caducar presupuestos ajenos.
- `gestor/readonly`: no escriben presupuestos.

## No hecho todavía

- Motor de costes reales.
- Margen bruto/neto.
- Convenios salariales completos.
- Seguridad Social empresa.
- AT/EP.
- Overhead.
- Comisiones comerciales reales.
- Cálculo de viabilidad económica.
- Reglas finales con gestoría.

Ese bloque queda congelado hasta sesión específica con Fernando presente.
