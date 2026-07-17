# Modelo de datos

Objetos principales:

- `BudgetSnapshot`: foto económica inmutable y validada.
- `SpecialistReview`: resultado de un especialista.
- `ReviewFinding`: evidencia, gravedad, recomendación y validación humana.
- `JointVerdict`: bloqueo y condiciones conjuntas.
- `HumanDecision`: resolución trazable.
- `ContractDraft`: cláusulas y campos pendientes.
- `ConsistencyCheck`: contradicciones entre artefactos.
- `ScenarioResult`: resultado numérico determinista.

La demo persiste historial y decisiones en almacenamiento local del navegador; producción requeriría tablas servidor y política de retención.
