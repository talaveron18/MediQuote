# Tabla de verdad de implementación

No se equipara una demo determinista con una integración productiva. Esta tabla describe el estado comprobable de la rama.

| Función | UI | Backend | Persistencia | OpenAI real | Demo | Tests | Estado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Dashboard ejecutivo | Sí | No necesaria | Sesión | No | Sí | Dominio | REAL Y CONECTADA |
| Flujo guiado de siete pasos | Sí | No necesaria | Sesión | No | Sí | Flujo | REAL Y CONECTADA |
| Intake natural | Sí | API autenticada | No | Implementado, no probado con clave | Determinista | Sí | PARCIAL |
| Cuatro revisores | Sí | API autenticada | Caché efímera | 4 llamadas aisladas | Reproducible | Sí | REAL; proveedor real no validado en vivo |
| Comité progresivo | Sí | Consume revisiones | Sesión | Compatible | Sí | Build | REAL Y CONECTADA |
| Veredicto conjunto | Sí | Determinista | No | No recalcula | Sí | Sí | REAL Y CONECTADA |
| Contradicciones | Sí | Determinista | No | No | Sí | Sí | REAL Y CONECTADA |
| Fiscal vs. Defensa | Sí | Determinista sobre resultados | No | Fiscal admite resultado real | Sí | Parcial | REAL Y CONECTADA |
| Riesgos y evidencias | Sí | DTO tipado | No | Campos opcionales | Sí | Build | REAL EN DEMO; PARCIAL EN REAL |
| Decisiones humanas | Sí | No | Memoria de sesión | No | Sí | Flujo | FUNCIONAL SOLO EN DEMO |
| Timeline | Sí | No | Memoria de sesión | No | Sí | Build | FUNCIONAL SOLO EN DEMO |
| Escenario de absentismo | Sí | Fórmula determinista | No | Solo explica | Sí | Sí | REAL Y CONECTADA |
| Contrato | Sí | API / generador determinista | No | No | Sí | Sí | REAL COMO BORRADOR |
| Anexo operativo | Sí | Generador determinista | No | No | Sí | Sí | REAL COMO BORRADOR |
| Coherencia de tres artefactos | Sí | Determinista | No | No | Sí | Sí | REAL Y CONECTADA |
| Comparación de versiones | Sí | Determinista | No | No | Sí | Sí | FUNCIONAL SOLO EN DEMO |
| Revisión desactualizada | Sí | Determinista | No | No | Sí | Sí | FUNCIONAL SOLO EN DEMO |
| Registro verificable JSON | Sí | Hash SHA-256 en cliente | Descarga | No | Sí | Sí | REAL; NO ES FIRMA |
| Vista cliente sin costes | Sí | Proyección determinista | No | No | Sí | Sí | REAL Y CONECTADA |
| Ruta `/demo/build-week` | Sí | No requiere clave | No | No | Sí | Build | REAL Y CONECTADA |
| Auditoría PDF/DOCX con página | No | No | No | No | No | No | DOCUMENTADA PERO NO IMPLEMENTADA |
| Tres casos demo completos | No | No | No | No | Un caso principal | No | PARCIAL |
| E2E de navegador con capturas | No | No | No | No | No | Flujo de dominio | PARCIAL |
| PDF del registro | No | No | No | No | No | No | DOCUMENTADA PERO NO IMPLEMENTADA |

La ausencia de Playwright, persistencia productiva y proveedor real probado impide describir esta rama como lista para producción. Sí está lista como prototipo de concurso reproducible.
