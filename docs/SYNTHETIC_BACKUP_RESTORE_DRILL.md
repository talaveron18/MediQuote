# Drill sintético de backup/restore — MediQuote

## Alcance
Este control prueba recuperación técnica exclusivamente sobre la base PostgreSQL efímera de QA, con seed sintético. No accede a producción, Netlify ni datos reales y no sustituye una política aprobada de backup de producción.

## Qué demuestra
En cada `Automation QA` de ramas `automation/mediquote-production-*`:

1. se captura inventario y número de filas de todas las tablas `public`, definición del esquema y estado de secuencias;
2. `pg_dump` genera un backup custom no vacío y `pg_restore --list` demuestra que el artefacto es legible;
3. se destruye de forma deliberada el esquema `public` de la base efímera, evitando un falso positivo que solo pruebe lectura;
4. se restaura desde el backup con `--exit-on-error`;
5. se exige igualdad exacta de tablas/recuentos, definición del esquema y secuencias antes/después.

Cualquier diferencia hace fallar el gate de QA.

## Evidencia
Script: `scripts/qa-synthetic-backup-restore.sh`.
Workflow: `.github/workflows/automation-qa.yml`, pasos `Synthetic backup and destructive restore drill` y `Enforce restore drill gate`.

## Límites
Este drill no acredita por sí solo retención, cifrado, almacenamiento externo, RPO/RTO ni restauración de un backup real de producción. Esos puntos requieren infraestructura/configuración real aprobada y no deben inferirse a partir del entorno sintético.

## Fallback
Mientras no exista evidencia de backup/restore de producción aprobada, una incidencia real debe mantener el procedimiento manual verificable vigente y no declarar recuperación productiva validada por este drill sintético.
