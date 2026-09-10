# Fotografías inmutables de presupuesto y auditoría

## Regla
Cada presupuesto emitido/guardado formalmente y cada auditoría completada debe conservar una fotografía canónica inmutable. Un PDF puede ser una representación de consulta, pero no es por sí solo el registro canónico.

## Presupuesto
Al sellar una versión de presupuesto se conserva como mínimo:
- identificador de presupuesto;
- número de versión;
- fecha/hora de creación;
- usuario autor;
- datos del cliente/servicio incluidos en esa versión;
- inputs económicos usados;
- versión del motor;
- configuración económica interna usada;
- resultado del cálculo y precio;
- snapshot serializado canónico;
- hash criptográfico del contenido canónico;
- referencia a la versión anterior cuando exista.

Editar después un presupuesto no modifica la fotografía anterior. La siguiente emisión genera una nueva versión enlazada.

## Auditoría
Cada auditoría cerrada conserva como mínimo:
- identificador propio;
- presupuesto y versión exacta auditados;
- fecha/hora;
- usuario que audita;
- snapshot económico original contra el que se compara;
- documento de gestoría aportado, con nombre/tipo y hash;
- valores de gestoría introducidos/extraídos;
- comparación por concepto;
- sección de costes internos GASI no conciliables;
- resultado de conciliación;
- hash del registro canónico de auditoría.

Una reauditación no sobrescribe la anterior: crea una nueva fotografía vinculada.

## Integridad
- Los registros canónicos no admiten `UPDATE` destructivo del contenido sellado.
- Las correcciones se representan mediante nuevas versiones, nunca reescritura silenciosa.
- El hash se calcula sobre una serialización determinista/canónica, no sobre JSON con orden arbitrario.
- Los archivos adjuntos se hashean por bytes.
- La descarga PDF se genera a partir de la fotografía correspondiente y debe identificar presupuesto, versión y auditoría cuando proceda.
- El historial general de `AuditLog` complementa estas fotografías; no las sustituye.

## Configuración económica interna
Los cambios en comisión, overhead, porcentaje/resultado GASI u otros parámetros internos afectan únicamente a cálculos futuros. Cada presupuesto conserva la versión/valores usados al crearse. Abrir una versión histórica no puede sustituirlos por la configuración vigente.

## Criterio de aceptación
Se considera implementado cuando puede demostrarse automáticamente que:
1. sellar v1 y cambiar configuración no altera el hash ni los importes de v1;
2. editar y volver a emitir produce v2 con nuevo identificador/hash y vínculo a v1;
3. cerrar una auditoría y modificar después el presupuesto no altera la auditoría;
4. reauditación crea un nuevo registro sin sobrescribir el anterior;
5. cualquier alteración de bytes/documento o snapshot hace fallar la verificación de hash.

## No decisión económica
Este contrato no fija ningún salario, coste, margen, comisión, overhead ni porcentaje GASI.
