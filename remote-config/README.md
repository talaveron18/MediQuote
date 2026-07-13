# Administración Remota de Configuración — GASI Presupuestos

## Qué es

Sistema para sincronizar la configuración del programa de presupuestos (precios, recargos, festivos, reglas laborales, usuarios) entre el equipo de administración y los comerciales, **sin necesidad de servidor**.

Funciona con una carpeta compartida sincronizada via Google Drive, OneDrive, Dropbox o cualquier sistema similar.

---

## Flujo de trabajo

```
┌─────────────────┐          ┌──────────────────────┐          ┌─────────────────┐
│   ADMINISTRACIÓN │  export  │  Carpeta sincronizada │  sync    │    COMERCIAL    │
│   (oficina)      │ ──────>  │  (Drive/OneDrive/     │ ──────>  │   (sobre el     │
│                  │          │   Dropbox/USB)        │          │    terreno)     │
│  1. Modifica     │          │  gasi-config.json     │          │                 │
│     precios,     │          │                       │          │  4. Al abrir     │
│     recargos,    │          │                       │          │     la app,      │
│     festivos...  │          │                       │          │     detecta     │
│                  │          │                       │          │     config new  │
│  2. Pulsa        │          │                       │          │                 │
│     "Exportar    │          │                       │          │  5. Pulsa        │
│     config.      │          │                       │          │     "Aplicar"    │
│     remota"      │          │                       │          │                 │
│                  │          │                       │          │  6. Config       │
│  3. El archivo   │          │                       │          │     actualizada  │
│     se guarda en │          │                       │          │     localmente   │
│     remote-config│          │                       │          │                 │
└─────────────────┘          └──────────────────────┘          └─────────────────┘
```

---

## Configuración paso a paso

### Opción 1: Google Drive

1. En el PC de **administración**, crear una carpeta compartida en Google Drive (ej: `GASI-Config`)
2. Compartir esa carpeta con el email del comercial
3. En el PC de administración, crear un **acceso directo** (symlink) desde la carpeta del proyecto:
   ```bash
   # En Windows (cmd como admin)
   mklink /D "C:\ruta\al\proyecto\remote-config" "C:\Users\Admin\Google Drive\GASI-Config"
   
   # En macOS / Linux
   ln -s "/Users/Admin/Google Drive/GASI-Config" "/ruta/al/proyecto/remote-config"
   ```
4. En el PC del **comercial**, instalar Google Drive Desktop y esperar a que sincronice la carpeta
5. Crear el mismo symlink apuntando a la carpeta local de Google Drive:
   ```bash
   # En Windows (cmd como admin)
   mklink /D "C:\ruta\al\proyecto\remote-config" "C:\Users\Comercial\Google Drive\GASI-Config"
   
   # En macOS / Linux
   ln -s "/Users/Comercial/Google Drive/GASI-Config" "/ruta/al/proyecto/remote-config"
   ```

### Opción 2: OneDrive

1. Subir `gasi-config.json` a una carpeta compartida de OneDrive
2. Ambos PCs deben tener OneDrive instalado y sincronizando la misma carpeta
3. Crear symlinks igual que en la Opción 1

### Opción 3: Dropbox

1. Crear carpeta compartida en Dropbox
2. Ambos PCs con Dropbox Desktop sincronizando
3. Crear symlinks igual

### Opción 4: USB / red local

1. El admin exporta a `remote-config/gasi-config.json`
2. Copiar ese archivo a un USB o carpeta de red
3. El comercial lo copia a su carpeta `remote-config/`
4. Al abrir la app, se detecta y ofrece importar

---

## Estructura del archivo gasi-config.json

```json
{
  "_meta": {
    "version": "1.0.0",
    "exportedAt": "2026-07-10T12:00:00.000Z",
    "exportedBy": "admin@gasi.es",
    "calculationEngineVersion": "2.0.0",
    "appMinVersion": "1.0.0"
  },
  "categories": [...],
  "surcharges": [...],
  "laborRules": [...],
  "holidays": [...],
  "users": [...],
  "appConfig": { ... }
}
```

### Secciones

| Sección | Descripción | Comportamiento al importar |
|---------|-------------|---------------------------|
| `categories` | Categorías profesionales con precios de venta y costes internos | Upsert por nombre |
| `surcharges` | Recargos (nocturnidad, domingos, festivos, urgencia...) | Upsert por nombre |
| `laborRules` | Reglas laborales (40h/semana, nocturnidad 22-6h...) | Upsert por nombre |
| `holidays` | Calendario de festivos 2025-2028 | Reemplazo completo |
| `users` | Usuarios con email, nombre, rol y estado activo/inactivo | Upsert por email |
| `appConfig` | Configuración empresa: IVA, descuentos máx., textos legales, versión... | Upsert por clave |

Todas las secciones son **opcionales**. Solo se actualizan las secciones presentes en el archivo.

---

## Seguridad

- El **comercial NO puede editar precios manualmente**. Los campos de precio/hora, precio/unidad e IVA aparecen deshabilitados en el formulario de presupuesto.
- Solo puede importar configuración desde un archivo aprobado por administración.
- El archivo se valida antes de importar: estructura, tipos de datos, versión compatible.
- Cada importación queda registrada en el log de auditoría.

---

## Validación

El sistema rechaza la importación si:

- El archivo no es JSON válido
- Falta el campo `_meta` o `_meta.version`
- La versión major del archivo es superior a la versión del motor actual
- Cualquier categoría, recargo o festivo tiene datos inválidos

Los errores se registran en el audit log con detalle.

---

## Auditoría

Cada exportación e importación queda registrada con:

- Fecha y hora
- Usuario que realizó la acción
- Versión anterior y nueva
- Cambios aplicados (ej: `categories: 7, surcharges: 10, holidays: 84`)
- Origen del archivo
- Resultado (success / error)
- Mensaje de error si aplica

Se puede consultar en: **Admin > Config. Remota > Registro de auditoría**

---

## Detección automática

Cuando la app se abre con rol de comercial, comprueba automáticamente si existe `remote-config/gasi-config.json` con fecha más reciente que la última importación. Si la hay, muestra un diálogo:

> **Configuración remota disponible**
> Se ha detectado un archivo de configuración nuevo en la carpeta remota.
> [Ahora no] [Aplicar configuración]

---

## Notas técnicas

- El archivo se lee del sistema de archivos local (`process.cwd()/remote-config/gasi-config.json`)
- No hay servidor de configuración. Todo funciona a nivel de archivo local sincronizado.
- La comparación de versiones se basa en la fecha de modificación del archivo (mtime) vs la fecha del último import exitoso en la base de datos.
- Los festivos se reemplazan completamente (delete + createMany) porque son un conjunto coherente que debe ser idéntico en todos los equipos.