# CHANGELOG — MediQuote Pro (instancia GASI)

## [0.2.0] — 2026-07-10

### Añadido
- Sistema de usuarios con 3 roles: maestro, admin, comercial.
- Panel de gestión de usuarios (CRUD completo).
- Panel de Branding / Licencia (solo maestro).
- Permisisos granulares por usuario (campo JSON en User).
- Footer de licencia en PDF cliente.
- Documentación legal: README_TITULARIDAD.md, LICENSE_INTERNAL.md.
- .env.example para GitHub.
- favicon.svg para branding.
- Auditoría de acciones de usuario (crear, editar, desactivar, reset contraseña).
- Protección de rutas: comercial no accede a Administración.
- Tab de branding oculto para admin (solo visible para maestro).
- DEV_ROLE_SWITCH restringido a NODE_ENV=development.

### Cambiado
- Branding completo: MediQuote Pro como software base, GASI como instancia.
- Titular actualizado a Fernando Javier Suárez Talaverón en todos los archivos.
- Layout metadata actualizada (ya no referencia Z.ai).
- PDF incluye footer discreto de licencia MediQuote Pro.
- Admin panel permite acceso a maestro y admin.
- Sidebar: Administración visible para maestro.
- `isAdmin()` en store incluye maestro.
- `.gitignore` ampliado para excluir DB, backups, exports, logs, session files.

### Seguridad
- Contraseñas con bcrypt (hash + verificación con migración automática).
- Usuarios inactivos no pueden iniciar sesión.
- mustChangePassword en todos los usuarios iniciales.
- Admin no puede modificar, desactivar ni cambiar rol del maestro.
- Admin no puede crear maestros ni otros admins.
- Comercial no puede acceder a Administración, Usuarios, Branding.
- Config API: claves de licencia restringidas a maestro.

## [0.1.0] — 2026-07-09

### Añadido
- Motor de cálculo v2 con recargos automáticos y manuales.
- Gestión de presupuestos con bloques de servicio.
- Gestión de clientes.
- Categorías profesionales con precios e costes internos.
- Configuración de recargos.
- Festivos españoles.
- Reglas laborales.
- Exportación automática (JSON + CSV).
- Auditoría de operaciones.
- Backups SQLite.
- Configuración remota.
- Vista comercial con importación de configuración.
- Login con cookie de sesión.