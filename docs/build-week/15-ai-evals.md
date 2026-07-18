# Evaluaciones de IA

Comando:

```bash
npm run eval:ai
```

El conjunto local funciona sin clave y comprueba 12 condiciones: petición clara, ambigua, municipio ausente, número de profesionales, prompt injection, crítico operativo, vacaciones ausentes, riesgo de margen, contrato contradictorio, oferta externa incompleta, instrucción maliciosa en documento y desacuerdo entre revisores.

## Resultado de cierre

`12/12` evaluaciones superadas en modo demo.

## Alcance honesto

Estas evals verifican reglas y datos reproducibles, no miden todavía precisión estadística de un modelo real. Para medir falsos positivos, falsos negativos o alucinación jurídica se necesita un corpus etiquetado por especialistas y una clave configurada voluntariamente.
