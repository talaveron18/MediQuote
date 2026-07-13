# Auditoría P0 de cálculo — MediQuote Pro / GASI

## Estado actual

El núcleo del motor ya cubre bien los puntos críticos de horas, recargos y totales básicos, pero la fiabilidad comercial depende también de los datos semilla, la persistencia y la API.

## P0 corregidos en PR #1

### 1. Recurrencia de festivos

Problema: `Holiday.recurring` estaba por defecto en `true`. Eso podía hacer que un festivo móvil como Jueves Santo coincidiera en otro año solo por compartir mes-día.

Corrección:

- `Holiday.recurring` ahora tiene `@default(false)`.
- Solo los festivos nacionales fijos se marcan como recurrentes.
- Semana Santa queda explícitamente como no recurrente.

### 2. Alcance territorial de festivos

Problema: el seed global podía incluir festivos autonómicos/locales de territorios no operativos, por ejemplo Cataluña. Eso podía hacer que un festivo autonómico afectara presupuestos fuera de esa comunidad.

Corrección:

- La generación global sin localización solo devuelve festivos nacionales.
- Los autonómicos/locales solo se devuelven si se pide ubicación explícita.
- Cataluña no entra en el seed global GASI.

### 3. CI mínimo de cálculo/integración

Corrección:

- `DATABASE_URL=file:./db/test.db` en CI.
- `prisma db push --skip-generate` para validar esquema.
- `npm test`.
- `npm run build`.
- Temporalmente usa `npm install` hasta regenerar y commitear un `package-lock.json` completo.

### 4. Plantilla mínima basada en horas reales

Problema: el subtotal usaba horas reales calculadas por turno, pero la plantilla mínima y avisos laborales podían usar `hoursPerDay - break`. En turnos custom podía infraestimar necesidad de personal.

Corrección:

- `calculateServiceBlock` acumula horas reales por fecha desde `calculateShiftHours`.
- La plantilla mínima, weekly breakdown, overtime y warnings se calculan con esas horas reales.
- Test: custom 05:00-23:00, 5 días, `hoursPerDay=8` pero 18h reales/día → 90h/semana → 3 profesionales.

### 5. Bloques simples y ceros explícitos

Problema: `quantity=0`, `fixedPrice=0` o `accommodationNights=0` se podían sustituir por defaults por usar `||`.

Corrección:

- Bloques simples usan `??` y clamps explícitos.
- Tests para material y alojamiento bloquean que cero se convierta en valor ausente.

## P0 pendientes de cálculo

### 1. Persistencia de campos especiales

Riesgo: el motor acepta `blockType`, `dateUIMode`, `accommodationNights`, etc., pero Prisma todavía no persiste todos esos campos. Puede calcular bien y reabrir mal.

## Regla de avance

No tocar de golpe el motor verde. Cada cambio debe ir con test de regresión específico y vector numérico claro.
