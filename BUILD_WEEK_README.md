# MediQuote Pro — Presupuesto con IA

> El formulario y el motor determinista de MediQuote, con una capa de preparación conversacional y revisión humana.

## Inicio

```bash
npm install
cp .env.example .env
# configure DATABASE_URL and SESSION_SECRET
npm run dev
```

Inicie sesión y abra **Presupuesto con IA** en el menú lateral. **Nuevo Presupuesto** conserva el recorrido clásico.

## Recorrido funcional

1. Describir la necesidad en lenguaje normal.
2. Revisar los campos preparados en el formulario real.
3. Corregir manualmente cualquier dato; la corrección humana tiene prioridad.
4. Ejecutar el motor determinista existente con **Calcular**.
5. Revisar cobertura, jornada, riesgos, IVA por partidas y pendientes antes de decidir.

El asistente no calcula precios, costes, márgenes, comisiones ni cotizaciones. Las consultas normativas usan fuentes oficiales cuando `OPENAI_API_KEY` está configurada y nunca cambian automáticamente una regla del motor.

## Calidad

```bash
npm test
npm run eval:ai
npx tsc --noEmit
npm run lint
npm run build
```

## Límites honestos

- La revisión es orientativa y no sustituye a gestoría ni asesoramiento profesional.
- Sin clave de búsqueda, una consulta normativa se rechaza de forma explícita; no se simula.
- La aprobación final sigue siendo humana.
- El indicador visual «G» es temporal hasta incorporar el recurso oficial de Gasito.

Detalles: [`docs/build-week/24-functional-ai-budget.md`](docs/build-week/24-functional-ai-budget.md).

## Aislamiento

Todo este trabajo pertenece exclusivamente a `feature/build-week-ai-review-loop`. No se ha fusionado, desplegado ni conectado a Netlify.
