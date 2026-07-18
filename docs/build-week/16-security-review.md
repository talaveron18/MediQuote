# Revisión de seguridad del módulo Build Week

## Controles comprobados

- `/api/ai-review` exige sesión y cambio inicial de contraseña resuelto.
- La ruta pública `/demo/build-week` solo usa datos ficticios y no consulta la base.
- Claves y llamadas reales permanecen en módulo `server-only`.
- `store:false`, tiempo máximo y un reintento en Responses API.
- Peticiones validadas con Zod; números finitos y límites de longitud.
- DNI, NIE, pasaporte, IBAN, Bearer tokens y claves por nombre se enmascaran.
- Detección básica de prompt injection antes del proveedor.
- React escapa todo el texto; no se usa `dangerouslySetInnerHTML` ni Markdown generado.
- Caché segmentada por usuario, modo y huella del presupuesto.
- Doce solicitudes por usuario y minuto.
- Un revisor fallido genera un crítico explícito; nunca se simula éxito.
- Si `OPENAI_DEMO_MODE=false` y falta clave, se devuelve error; no hay fallback silencioso.
- La proyección de cliente omite coste y margen y tiene prueba de no fuga.
- El registro verificable declara que no es firma ni certificado.

## No aplicable en esta fase

No existe carga de archivo, por lo que MIME, nombres, path traversal, antivirus y almacenamiento documental quedan fuera. Si se añade ingestión, deberán bloquearse por defecto hasta implantar esos controles.

## Riesgos restantes

- El detector de prompt injection es heurístico.
- El proveedor real no ha sido probado con una clave en este entorno.
- Decisiones y timeline de demo no son un registro corporativo persistente.
- La API acepta una foto suministrada por el cliente autenticado; la integración real deberá construirla en servidor desde un presupuesto autorizado.
- No hay E2E de navegador automatizado.
