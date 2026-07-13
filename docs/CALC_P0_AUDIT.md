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

## P0 pendientes de cálculo

### 1. Plantilla mínima basada en horas reales

Riesgo: el subtotal usa horas reales calculadas por turno, pero la plantilla mínima y avisos laborales usan `hoursPerDay - break`. En turnos custom puede infraestimar necesidad de personal.

Caso a blindar:

- Turno custom 05:00-23:00 = 18h reales.
- Si `hoursPerDay` llega como 8, el precio saldrá con 18h, pero la plantilla mínima puede calcularse como si fueran 8h.

### 2. Bloques simples y operador `||`

Riesgo: `quantity=0` o `fixedPrice=0` se sustituyen por defaults porque el motor usa `||`. Debe usar `??` y clamps explícitos.

### 3. Persistencia de campos especiales

Riesgo: el motor acepta `blockType`, `dateUIMode`, `accommodationNights`, etc., pero Prisma todavía no persiste todos esos campos. Puede calcular bien y reabrir mal.

## Regla de avance

No tocar de golpe el motor verde. Cada cambio debe ir con test de regresión específico y vector numérico claro.
