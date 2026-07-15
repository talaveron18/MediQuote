# MediQuote Pro — Instancia GASI

Herramienta de presupuestación sanitaria. Instancia interna configurada para GASI bajo licencia habilitada de MediQuote Pro.

**Software base:** MediQuote Pro  
**Titular:** Fernando Javier Suárez Talaverón  
**Instancia:** GASI  
**Versión:** 0.2.0

---

## Qué es MediQuote Pro

MediQuote Pro es un software de presupuestación sanitaria que permite crear, gestionar y exportar presupuestos para servicios sanitarios. Incluye motor de cálculo con recargos laborales, gestión de categorías profesionales, festivos españoles y reglas laborales.

## Qué es la instancia GASI

Esta es una instancia de MediQuote Pro configurada para uso interno de GASI. El branding visual muestra GASI como empresa usuaria, con la licencia de MediQuote Pro indicada de forma discreta.

---

## Arranque local

### Requisitos

- Node.js 18+
- npm o bun

### Instalación

```bash
npm install
npx prisma generate
npx prisma db push
npx tsx scripts/seed.ts
```

Antes de arrancar en producción, crear un secreto de sesión y guardarlo en `.env`:

```bash
openssl rand -base64 48
```

Asignar el resultado a `SESSION_SECRET`. La aplicación rechaza el inicio de sesión
en producción si el secreto no está configurado con al menos 32 bytes.

### Desarrollo

```bash
npm run dev
```

Abrir http://localhost:3000

### Producción local

```bash
npm run build
npm start
```

---

## Usuarios iniciales

El seed crea los usuarios iniciales de los roles maestro, admin y comercial. Las
contraseñas no están incluidas en el repositorio: pueden definirse mediante las
variables indicadas en `.env.example` o, si se omiten, se generan aleatoriamente
y se muestran una sola vez en la terminal durante la instalación.

Todos los usuarios iniciales tienen `mustChangePassword: true`. Hasta que cambien
la contraseña temporal, el servidor bloquea el acceso al resto de la aplicación.

### Roles

- **maestro** — Titular del software. Acceso total. Puede gestionar usuarios, branding, licencia y configuración global.
- **admin** — Responsable operativo de GASI. Puede gestionar comerciales, precios, recargos, auditoría y backups.
- **comercial** — Solo puede crear presupuestos, gestionar clientes y generar PDFs. No ve costes internos ni márgenes.

---

## Estructura de carpetas

```
├── prisma/           # Schema de base de datos
├── src/
│   ├── app/          # Páginas y API routes (Next.js App Router)
│   │   ├── api/      # Endpoints: auth, budgets, clients, config, users, pdf, etc.
│   │   └── login/    # Pantalla de login
│   ├── components/   # Componentes React
│   │   ├── ui/       # shadcn/ui
│   │   └── views/    # Vistas: admin, dashboard, budget-form, clients, etc.
│   ├── lib/          # Lógica: auth, cálculo, exportación, tipos
│   └── store/        # Zustand store
├── public/branding/  # Logos y favicon
├── scripts/          # Seed y tests
├── db/               # Base de datos SQLite (NO subir a GitHub)
├── exports/          # Exportaciones generadas (NO subir a GitHub)
└── backups/          # Backups de BD (NO subir a GitHub)
```

---

## Exportaciones

La herramienta genera automáticamente al guardar un presupuesto:

- **JSON** individual en `exports/presupuestos/json/{CODE}.json`
- **CSV** resumen en `exports/presupuestos_resumen.csv`
- **PDF** (HTML para impresión) vía botón manual

## Backups

Desde Administración → Auditoría se puede generar un backup completo de la base de datos SQLite. Se guarda en `backups/`.

## Configuración remota

Permite importar/exportar configuración (categorías, recargos, reglas laborales, festivos) desde un archivo JSON. Útil para sincronizar configuración entre instancias.

## Auditoría

Todas las operaciones críticas se registran en `AuditLog`: creación/edición/borrado de presupuestos, cambios de usuario, login/logout, cambios de configuración, etc.

## Branding

El panel de Branding / Licencia (solo maestro) permite configurar:

- Nombre de instancia, logo, colores corporativos
- Textos de licencia y copyright
- Datos fiscales para PDF
- Footer legal

## Titularidad

Ver `README_TITULARIDAD.md` y `LICENSE_INTERNAL.md` para información completa sobre titularidad del software y licencia de uso.

---

## GitHub privado

### Qué se sube

- Código fuente (`src/`, `prisma/`, `scripts/`)
- Archivos de configuración (`package.json`, `tsconfig.json`, `next.config.ts`, etc.)
- Documentación (`README.md`, `README_TITULARIDAD.md`, `LICENSE_INTERNAL.md`, `CHANGELOG.md`)
- `.env.example` (sin secretos)
- Assets de branding (`public/branding/` logos autorizados)
- Seed demo (`scripts/seed.ts`)

### Qué NO se sube

- `.env` (contiene DATABASE_URL real)
- Base de datos (`db/*.db`)
- Backups (`backups/`)
- Exportaciones (`exports/`)
- Configuración remota local (`remote-config/gasi-config.local.json`)
- Logs
- Archivos de sesión
- Archivos ZIP generados

### Repositorio recomendado

`mediquote-pro` o `mediquote-pro-gasi-instance`

### Primer commit sugerido

```
Initial private version of MediQuote Pro — GASI licensed internal instance
```

---

## Seguridad pendiente (antes de despliegue web)

- Cookie HttpOnly + SameSite
- Sesión server-side con expiración
- Protección CSRF
- Recuperación de contraseña por email (SMTP + token)
- Rate limiting en login
- Log de intentos fallidos con bloqueo temporal

---

## Tecnología

- Next.js 16 (App Router, standalone output)
- TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + SQLite
- Zustand (estado)
- bcryptjs (hash de contraseñas)
- date-fns (fechas)
