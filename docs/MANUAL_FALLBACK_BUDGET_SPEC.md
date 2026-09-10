# Fallback manual mínimo para presupuestos GASI

## Finalidad
Permitir preparar y verificar un presupuesto cuando MediQuote no esté listo para producción, sin inventar reglas económicas y manteniendo los mismos inputs/outputs esenciales que el motor.

## Estructura recomendada de hoja de cálculo
Crear 5 pestañas: `DATOS`, `BLOQUES`, `COSTES`, `RESUMEN`, `CONTROL`.

### DATOS
Campos obligatorios:
- código provisional de presupuesto;
- cliente;
- fecha;
- validez;
- provincia;
- municipio;
- descripción del servicio;
- IVA aplicable si está validado;
- observaciones.

No incluir una categoría profesional como disponible hasta que exista capacidad documentada por PERSONAL_CAPACIDAD.

### BLOQUES
Una fila por bloque de servicio con:
- `block_id` único;
- servicio;
- categoría profesional;
- tipo de contratación;
- puestos simultáneos/profesionales solicitados;
- fecha inicio/fin o fechas específicas;
- días de semana;
- hora inicio/fin;
- horas por día;
- cantidad/unidades;
- territorio;
- observaciones.

No combinar dos categorías distintas en una sola fila.

### COSTES
Una fila por componente y bloque:
- `block_id`;
- tipo de coste: salario, plus, cotización, AT/EP, gestoría/contrato, overhead, coste directo;
- concepto;
- unidad;
- cantidad;
- coste unitario;
- importe;
- fuente;
- estado de fuente: verificada / pendiente_gestoria / pendiente_decision.

Si una línea necesaria está pendiente, el bloque no puede marcarse como `LISTO_PARA_PRECIO`.

### RESUMEN
Outputs mínimos por bloque y totales:
- coste interno total;
- precio mínimo ordinario antes de IVA, solo si la política comercial vigente está documentada;
- precio de lista inicial antes de IVA, solo si está documentado;
- precio de cierre antes de IVA;
- descuento en EUR y %;
- comisión en EUR y %, solo con regla vigente documentada;
- beneficio final GASI;
- retorno sobre coste %;
- margen sobre venta %;
- IVA;
- total cliente;
- semáforo/requiere autorización, solo con umbrales vigentes documentados.

### CONTROL
Checks obligatorios antes de enviar:
1. Todos los bloques tienen `block_id` único.
2. Todas las líneas de COSTES apuntan a un `block_id` existente.
3. No hay campos económicos requeridos con estado pendiente.
4. Coste total = suma de componentes.
5. Precio de cierre >= 0.
6. Total cliente = base + IVA dentro de 0,02 EUR.
7. Si existe descuento, se calcula contra el precio de lista documentado.
8. Si existe comisión, la tasa usada tiene fuente/decisión vigente.
9. Cliente, servicio, fechas y territorio coinciden con la propuesta comercial.
10. Se conserva una copia inmutable/PDF de la versión enviada al cliente.

## Fórmulas conceptuales
- `importe_linea = cantidad * coste_unitario`
- `coste_bloque = SUMA(importes_linea del block_id)`
- `coste_total = SUMA(coste_bloque)`
- `descuento_eur = precio_lista - precio_cierre`
- `descuento_pct = descuento_eur / precio_lista` cuando precio_lista > 0
- `beneficio_antes_comision = precio_cierre - coste_total`
- `beneficio_final = beneficio_antes_comision - comision`
- `retorno_sobre_coste_pct = beneficio_final / coste_total` cuando coste_total > 0
- `margen_sobre_venta_pct = beneficio_final / precio_cierre` cuando precio_cierre > 0
- `iva_eur = precio_cierre * iva_pct`
- `total_cliente = precio_cierre + iva_eur`

La hoja NO debe contener fórmulas con porcentajes económicos hardcodeados. Los porcentajes se introducen únicamente desde una tabla de parámetros cuya fuente esté identificada.

## Criterio de uso
Este fallback sirve para no bloquear una venta, pero no sustituye MediQuote. Cada presupuesto manual debe revisarse por segunda persona antes de envío y posteriormente poder reconciliarse con MediQuote sin cambiar inputs ni resultados económicos.

## Criterio de bloqueo
No enviar un precio si falta un coste obligatorio, una regla comercial necesaria, un territorio/convenio aplicable o una decisión de Fernando sobre precio/margen/comisión.