# Evaluación y tests

La suite añade pruebas para:

- los cuatro revisores y el modo demo;
- prioridad de hallazgos críticos;
- simulación de absentismo y límites;
- contrato y contradicción de precio;
- enmascarado de datos;
- detección básica de prompt injection.

Puertas de calidad: `npm test`, `npx tsc --noEmit`, `npm run lint` y `npm run build`.

Resultado del cierre: 50 pruebas, TypeScript y build de producción correctos; lint del módulo nuevo correcto. El lint global conserva 14 errores preexistentes de `react-hooks/set-state-in-effect` y una regla de inmutabilidad en pantallas antiguas, fuera del alcance aislado de esta rama.
