# Fase 3 — familia Gasito y animación contextual

## Entregado

- Mesa del Consejo con cinco Gasitos alineados.
- Moderador identificado permanentemente y sin voto.
- Cuatro revisores con especialidad, estado, voto, hallazgo y acceso a evidencia.
- Animación contextual controlada por estado.
- Solo un actor con movimiento principal.
- Interacción visual Auditor → Gestoría cuando existe contradicción.
- Gasito contextual con recomendación, motivo, origen y acción.
- Modo de movimiento reducido.
- Estados visibles y textuales para revisores no disponibles.
- Pruebas funcionales y de accesibilidad sin depender de tiempos exactos.

## Límites honestos

- No existe en el repositorio una ilustración oficial fuente de Gasito; se usa un componente de interfaz coherente y reemplazable.
- No hay vídeo, audio ni animación prerenderizada.
- La animación no altera el resultado, el voto ni la lógica de revisión.
- La vista cliente conserva las garantías ya probadas de no mostrar coste interno ni margen.

## Puertas de calidad

- Tests: 68/68.
- Evaluaciones de IA: 12/12.
- TypeScript: sin errores.
- Lint del módulo Build Week y AI Review: sin errores.
- Build de producción: correcto; `/demo/build-week` se genera como ruta estática.
- Advertencia heredada: Turbopack detecta un trazado amplio desde `data-paths`/`sqlite-backup`; no lo introduce esta fase y no bloquea el build.

## Aislamiento

Todo el trabajo pertenece exclusivamente a `feature/build-week-ai-review-loop`. No modifica el motor determinista, Prisma, cálculos, política comercial, `main` ni producción.
