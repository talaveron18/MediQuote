# Recuperación segura de contraseña — especificación implementable

## Problema
El login actual no ofrece recuperación cotidiana. `change-password` exige sesión válida y contraseña actual; existe una vía de emergencia separada para el rol maestro, que debe conservarse como break-glass y no usarse como mecanismo normal.

## Flujo objetivo
1. En `/login`, enlace `¿Olvidaste tu contraseña?`.
2. Formulario solicita correo.
3. La API responde siempre con un mensaje genérico equivalente, exista o no la cuenta.
4. Si la cuenta activa existe, generar token criptográficamente aleatorio de un solo uso.
5. Guardar solo hash del token, usuario, fecha de creación, expiración y fecha de uso; nunca el token en claro.
6. Enviar enlace mediante proveedor transaccional/SMTP configurado por entorno.
7. En la pantalla de reset, validar token, expiración y estado de uso; pedir contraseña nueva y confirmación.
8. Aplicar la política de contraseña existente.
9. Cambiar contraseña, marcar token usado e invalidar todas las sesiones previas en una única transacción lógica.
10. Registrar auditoría sin token, contraseña ni datos sensibles.

## Invalidación de sesiones
Requisito P0: una contraseña restablecida no puede dejar sesiones antiguas funcionando.

Implementación preferida: contador `sessionVersion` por usuario. El token de sesión incluye `sessionVersion`; en cada autenticación se compara con el valor actual. Cambio o reset de contraseña incrementa el contador. Alternativa válida: `passwordChangedAt` incluido/verificado en sesión.

No basta con borrar la cookie del navegador que realiza el reset.

## Token de recuperación
- al menos 32 bytes aleatorios;
- codificación segura para URL;
- expiración breve: objetivo 20 minutos; puede ajustarse entre 15 y 30 sin decisión comercial;
- un solo uso;
- el hash debe ser SHA-256 o equivalente adecuado para token aleatorio;
- comparación resistente a timing cuando proceda;
- cualquier uso exitoso consume el token;
- solicitudes posteriores invalidan tokens anteriores no usados del mismo usuario.

## Protección contra abuso
- rate limit por IP y por identificador normalizado;
- respuesta idéntica para cuenta existente/inexistente;
- no registrar token en logs;
- no incluir detalles de base de datos en errores al cliente;
- añadir `Cache-Control: no-store` en endpoints y páginas sensibles;
- limitar intentos de validación del token.

## Auditoría
Eventos mínimos:
- `password_reset_requested` (sin revelar en respuesta si existe cuenta);
- `password_reset_email_queued`;
- `password_reset_token_invalid`;
- `password_reset_completed`;
- `password_reset_rate_limited`.

Nunca registrar contraseña, token en claro ni URL completa de reset.

## Break-glass maestro
La ruta de recuperación de emergencia existente debe mantenerse separada, protegida por secreto de entorno y claramente documentada como contingencia. No debe aparecer en la UI normal ni compartir token/flujo con recuperación por correo.

## Dependencia externa antes de producción
Hace falta seleccionar/configurar un proveedor real de correo transaccional o SMTP. Hasta que exista, puede implementarse y probarse el flujo con un transport de prueba que capture el enlace únicamente en entorno de test; producción debe fallar de forma segura si el proveedor no está configurado.

## Tests obligatorios
1. Solicitud para email existente/inexistente devuelve mismo status y cuerpo público.
2. Token válido permite reset una sola vez.
3. Token expirado falla.
4. Token ya usado falla.
5. Segundo token invalida el primero.
6. Contraseña débil falla.
7. Reset incrementa versión de sesión / invalida sesión anterior.
8. Nueva contraseña permite login.
9. Contraseña anterior deja de permitir login.
10. Rate limit bloquea abuso sin revelar existencia.
11. Ruta break-glass continúa funcionando de forma separada.

## Criterio de cierre
No considerar resuelto el P0 hasta que el flujo sea usable desde fuera del sistema, tenga envío real configurado, invalide sesiones anteriores y esté cubierto por tests de API + navegador.