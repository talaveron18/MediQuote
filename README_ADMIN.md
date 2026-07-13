# GASI Presupuestos — Guía de Administración

## Credenciales de demostración

| Rol   | Usuario            | Contraseña |
|-------|--------------------|------------|
| Admin | `admin@gasi.local` | `admin1234` |

## Configurar precios

1. Ir a **Admin > Categorías Profesionales**.
2. Editar el precio por hora de cada categoría.
3. Guardar cambios.

## Configurar recargos

1. Ir a **Admin > Recargos**.
2. Ajustar los porcentajes de recargo aplicables.
3. Guardar cambios.

## Configurar festivos

1. Ir a **Admin > Festivos**.
2. Añadir o eliminar días festivos del calendario.
3. Guardar cambios.

## Configurar reglas laborales

1. Ir a **Admin > Reglas Laborales**.
2. Definir horarios, horas extraordinarias, dietas, etc.
3. Guardar cambios.

## Configurar datos de la empresa

1. Ir a **Admin > Configuración Empresa**.
2. Rellenar razón social, NIF, dirección, logotipo y datos fiscales.
3. Guardar cambios.

## Revisar registro de auditoría

1. Ir a **Admin > Auditoría**.
2. Se muestran todas las acciones realizadas en el sistema con fecha, usuario y detalle.

## Crear backup

1. Ir a **Admin > Auditoría > Crear backup**.
2. O ejecutar **`backup.bat`** directamente. El archivo se guarda en `backups/`.

## Exportar paquete de auditoría

1. Ir a **Admin > Auditoría > Exportar paquete**.
2. Se genera un ZIP con todos los logs en `exports/auditoria/`.

## Exportar configuración remota

1. Ir a **Admin > Config. Remota > Exportar**.
2. Se genera el archivo `remote-config/gasi-config.json` con toda la configuración actual.

## Estructura de carpetas

```
my-project/
├── db/                  # Base de datos SQLite
├── exports/
│   ├── presupuestos/
│   │   ├── pdf/         # PDFs de presupuestos
│   │   └── json/        # JSONs de presupuestos
│   ├── auditoria/       # Logs y paquetes de auditoría
│   └── presupuestos_resumen.csv
├── backups/             # Copias de seguridad de la base de datos
└── remote-config/
    └── gasi-config.json # Configuración compartible
```

## Preparar la app para otro comercial

1. Copiar toda la carpeta del proyecto.
2. El comercial ejecuta **`install.bat`**.
3. Inicia con **`start.bat`** e inicia sesión con sus credenciales.

## Sincronización remota

El archivo `remote-config/gasi-config.json` puede sincronizarse mediante **Google Drive**, **OneDrive** o **Dropbox**. Cuando el comercial pulse "Importar Config.", el sistema leerá la última versión disponible en esa carpeta.

## Notas

- Las contraseñas se almacenan en texto plano. **TODO:** migrar a bcrypt.