# Seguridad y privacidad

- Ruta autenticada y proveedor real solo en servidor.
- DNI, NIE, pasaporte, IBAN, tokens y campos secretos se enmascaran.
- El texto de usuario se trata como dato no confiable.
- Se detectan patrones básicos de inyección de prompt.
- La API limita longitud y valida números finitos.
- Doce solicitudes por usuario y minuto; caché efímera por huella de la foto.
- `store:false` en llamadas OpenAI.
- Sin escritura en presupuestos, motor o aprobaciones.
- No se deben introducir datos clínicos ni de pacientes.

El prototipo no sustituye una evaluación de impacto ni una revisión jurídica del tratamiento real.
