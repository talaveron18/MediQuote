# Registro de decisiones

Bitácora de decisiones de auditoría y arquitectura. Cada tanda deja constancia
escrita de qué se cambió, por qué, y qué se decidió asumir o posponer.

---

## Tanda 1 — Auditoría de seguridad y coherencia de versiones (2026-08-31)

Rama `auditoria/tanda-1`. Etiqueta de estado previo: `pre-auditoria-2026-08`
(commit `a44793b`).

### Commits y hallazgo asociado

| Commit | Hallazgo |
|--------|----------|
| `b6c543e` | La importación de configuración remota (`type=import`) solo exigía sesión. `applyRemoteConfig` reescribe `professionalCategory` incluido `defaultInternalCost`, que el motor lee como salario bruto por hora productiva. Restringido a `requireRole(['admin','maestro'])`: el rol comercial no puede tocar la base de coste. |
| `7947e4f` | `verifyPassword` aceptaba contraseñas en texto plano y las auto-migraba con `updateMany`. Eliminada esa rama: solo se autentican hashes bcrypt; `false` si el valor almacenado no empieza por `$2`. |
| `31e4c08` | El `GET /api/holidays` no exigía sesión. Añadido `requireAuth`, como en el resto de rutas. |
| `f3e1ae4` | Siete declaraciones de la versión del motor (unas `1.0.0`, otras `2.0.0`) y tres valores por defecto de la versión de app. El snapshot económico sellaba `1.0.0` mientras el `AuditLog` del mismo cálculo sellaba `2.0.0`. Unificadas en `COST_ENGINE_VERSION` y un nuevo `APP_VERSION` en `src/lib/costing/cost-types.ts` como únicas fuentes, importadas en todos los puntos. Quitadas las dos variables de `.env.example`. |
| `713e600` | Aunque se cambiara el seed, la versión seguía siendo configurable desde BD (`appConfig.calculationEngineVersion \|\| …`). Cortadas ambas lecturas en `remote-config.ts`; eliminadas las filas `calculationEngineVersion` y `appMinVersion` del seed; `APP_VERSION` pasa a salir de `package.json`. |
| `dba4172` | `remote-config/gasi-config.json` (con costes internos y márgenes) estaba versionado. Sacado del repositorio con `git rm --cached`, añadido a `.gitignore`, y sustituido por `gasi-config.example.json` con la misma estructura y valores ficticios. |

### Decisiones conscientes

- **`APP_VERSION` sube de `0.2.0` a `0.3.0` y pasa a salir de `package.json`**
  (campo `version`, la fuente canónica en Node). Todo lo que se selle a partir
  de ahora (snapshots económicos, `AuditLog`, paquetes de auditoría) lleva esa
  versión.

- **La versión de motor y de app dejan de ser configurables por entorno y por
  base de datos.** Las fuentes únicas son `COST_ENGINE_VERSION` (`1.0.0`) y
  `APP_VERSION` (desde `package.json`) en `cost-types.ts`. Decisión consciente:
  una instalación no puede declarar una versión distinta de la que ejecuta, que
  era exactamente la causa del desfase snapshot/AuditLog.

- **`remote-config/gasi-config.json` sale del repositorio.** Estuvo versionado
  desde el **13/07/2026** (commit `f9145c6`, *baseline*), unas 7 semanas, y el
  repositorio fue **público unas horas** durante ese periodo. Contenía
  `defaultInternalCost` y `defaultPricePerHour` de las 13 categorías (el margen
  bruto interno de GASI), más CIF, dirección, teléfono y email de empresa.
  **Riesgo asumido tras valoración**, no ignorado: no son credenciales rotables,
  no tienen valor en el mercado de datos filtrados (los bots que rastrean repos
  públicos van a por claves/tokens/`.env`), y la ventana pública fue corta. El
  archivo real lo genera la app al exportar; los lectores ya toleran su ausencia
  con un error claro.

### Pendiente decidido a futuro

- **Reescritura de historial** (`git filter-repo`) para purgar
  `gasi-config.json` del historial y del remoto. Se hará **al cerrar la
  auditoría**, cuando no queden ramas vivas que rebasar, para no coordinar
  reescrituras sobre ramas en curso.

### Retirado de la auditoría (no era defecto)

- Los errores de `tsc` en `src/lib/sqlite-backup.ts` eran el **cliente de Prisma
  sin generar** en el entorno de trabajo. Tras `npx prisma generate`
  desaparecen. No es un defecto del código; el CI no está en rojo por tipos.

### Anotado sin tocar (para tanda de limpieza)

- `applyRemoteConfig` sigue **escribiendo** en BD las claves
  `calculationEngineVersion` y `appMinVersion`, ya **sin lectores** tras la
  tanda 1. Suciedad inerte, no riesgo. El `gasi-config.example.json` no las
  incluye en `appConfig` a propósito, para no perpetuarlas.
