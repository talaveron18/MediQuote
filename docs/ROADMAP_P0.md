# Roadmap P0/P1 — MediQuote Pro / GASI

## Estado base

Repositorio publicado con baseline canónica verde:

- Motor de cálculo versionado.
- Proyecto Next.js + Prisma + SQLite local.
- Scripts Windows de instalación, arranque, backup y reset.
- Documentación interna, comercial y de titularidad.
- CI inicial con TypeScript, Prisma y tests.

## P0 — proteger base

1. Mantener CI verde en cada push.
2. Rotar credenciales seed antes de cualquier uso real.
3. No subir `.env`, bases SQLite reales, `.next` ni `node_modules`.
4. Validar instalación limpia en Windows.

## P1 — hardening comercial

1. Revisar permisos por rol, especialmente borrado/caducado de presupuestos.
2. Revalidar PDF cliente: snapshot, totales, IVA, descuento, bloques mixtos.
3. Revisar guardado/reapertura de calendarios complejos.
4. Asegurar recálculo servidor en PUT parcial.

## P2 — producto

1. Pulir flujo comercial completo.
2. Mejorar legal registry y trazabilidad de fuentes.
3. Preparar demo local estable para GASI.
