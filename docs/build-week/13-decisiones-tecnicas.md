# Decisiones técnicas

## No tocar el motor

El módulo consume un DTO `BudgetSnapshot`; no importa ni llama funciones de escritura del motor. Así se puede retirar sin alterar presupuestos.

## Demo primero

El modo demo permite presentar, probar y evaluar sin credenciales ni coste. El proveedor real es opcional y se carga dinámicamente solo en servidor.

## Esquemas estructurados

Zod valida peticiones y respuestas. Las fórmulas de escenarios, veredicto y coherencia son código determinista, no texto generado.

## Fallar de forma visible

Inputs no finitos, porcentajes imposibles, respuestas sin estructura e inyección detectada se bloquean en vez de producir un resultado silencioso.
