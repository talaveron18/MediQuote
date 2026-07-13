# GASI Presupuestos — Guía de Uso (Comercial)

## Iniciar la aplicación

Doble clic en **`start.bat`**. Se abre el navegador en `http://localhost:3000`.

## Credenciales de demostración

| Rol       | Usuario                | Contraseña   |
|-----------|------------------------|--------------|
| Comercial | `comercial@gasi.local` | `comercial1234` |

## Crear un cliente

1. Ir a la sección **Clientes** en el menú lateral.
2. Pulsar **Nuevo cliente**.
3. Rellenar nombre, NIF, dirección y datos de contacto.
4. Guardar.

## Crear un presupuesto

1. Ir a la sección **Presupuestos**.
2. Pulsar **Nuevo presupuesto**.
3. Seleccionar el cliente.
4. Añadir líneas con categoría profesional, cantidad y horas.
5. El sistema calcula automáticamente totales, recargos y festivos.
6. Guardar — se genera el **JSON** y se actualiza el **CSV resumen** automáticamente.

## Exportaciones automáticas (al guardar)

Al crear o modificar un presupuesto se generan automáticamente:

- **JSON:** `exports/presupuestos/json/<código-presupuesto>.json`
- **CSV resumen:** `exports/presupuestos_resumen.csv` (actualizado con la última versión del presupuesto)

Ambos se crean de forma inmediata al guardar. Además se registra una entrada en el log de auditoría.

## Exportar PDF (manual)

El PDF no se genera automáticamente al guardar para evitar ralentizar la aplicación. Para obtener el PDF:

1. Ir a **Admin > Auditoría > Exportar paquete** (solo admin), o
2. Usar la opción **"Generar PDF"** desde la vista de presupuesto si está disponible.

El PDF se guarda en `exports/presupuestos/pdf/<código-presupuesto>.pdf`.

## Importar configuración remota

1. Pulsar el botón **"Importar Config."** en la barra lateral.
2. El sistema lee el archivo `remote-config/gasi-config.json` y actualiza precios, recargos y festivos.

## Enviar auditoría al administrador

1. Los logs de auditoría se guardan en `exports/auditoria/`.
2. Comprime esa carpeta y envíala al administrador por unidad compartida (Google Drive, OneDrive, etc.).

## Si la aplicación falla

1. Cierra la ventana de `start.bat`.
2. Ejecuta **`reset-db.bat`** (escribe `SI` para confirmar).
3. Vuelve a ejecutar **`start.bat`**.

## Notas

- Las contraseñas se almacenan en texto plano. Esto es una mejora temporal pendiente de implementar hash seguro.