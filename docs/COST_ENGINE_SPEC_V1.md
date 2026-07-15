# Especificación funcional — motor económico MediQuote Pro v1

## Alcance

El motor económico consume las horas y el calendario ya calculados por MediQuote. No mantiene un segundo calendario y no parte de un precio introducido manualmente.

Se divide en dos capas:

1. Coste interno inevitable de prestar el servicio.
2. Política comercial GASI aplicada sobre ese coste.

## Coste salarial

El salario anual aplicable incluye siempre:

- suma anual de mensualidades ordinarias;
- pagas extraordinarias;
- complementos fijos anuales;
- otros conceptos salariales obligatorios;
- ajuste hasta SMI cuando el total contractual quede por debajo.

Las pagas extraordinarias se calculan como:

```text
pagasExtraAnuales = numeroPagasExtra × importePorPaga
```

`paymentMode` registra si se abonan prorrateadas o separadas. La modalidad cambia el calendario de pago, pero nunca el coste anual. El motor incluye casos de regresión que garantizan que prorratear una paga no la elimina ni la duplica.

El coste salarial por hora productiva es:

```text
costeSalarialHoraProductiva = salarioAnualAplicable / horasProductivasAnuales
```

Se conservan también las horas anuales de convenio para auditoría. El denominador económico son las horas realmente productivas/vendibles, de modo que vacaciones, permisos, descansos retribuidos y tiempo no facturable no desaparezcan del precio.

## Pluses

Los pluses pueden configurarse como:

- importe por hora;
- porcentaje del coste salarial/hora;
- importe por día;
- importe por turno;
- porcentaje del salario del servicio;
- importe fijo total.

Los tramos horarios proceden del desglose operativo: ordinarias, nocturnas, domingos, fin de semana y festivos nacionales, autonómicos, provinciales o municipales.

## Cotizaciones y contratación

Sobre la base salarial del servicio y sus pluses se calculan separadamente:

- contingencias comunes;
- desempleo;
- FOGASA;
- formación profesional;
- MEI;
- otras cotizaciones empresariales configuradas;
- AT/EP por incapacidad temporal;
- AT/EP por invalidez, muerte y supervivencia.

También se añaden:

- gestoría por número real de contratos laborales;
- provisión de finalización cuando corresponda;
- otros costes contractuales configurados.

El tipo de contratación es obligatorio: indefinido, temporal, fijo discontinuo o mercantil/autónomo. No existe modalidad silenciosa por defecto.

## Overhead y costes directos

El overhead se aplica sobre el coste completo anterior a estructura: coste
laboral ampliado, gestoría, provisión contractual y costes directos reales.

```text
costeLaboralAmpliado = salarioServicio + pluses + SS empresa + AT/EP
baseOverhead = costeLaboralAmpliado + gestoría + provisiones + costesDirectos
overhead = baseOverhead × porcentaje + importeFijo
```

Los gastos directos no laborales se añaden por su coste real y forman parte de la base de overhead. Incluyen desplazamiento, kilometraje, peajes, aparcamiento, dietas, alojamiento, materiales, EPIs, uniformidad, equipamiento, vehículos, seguros específicos, vigilancia de la salud, selección y otros costes directos.

## Coste interno total

```text
costeTotalInterno =
  costeLaboralAmpliado
  + gestoría
  + provisiónFinalización
  + otrosCostesContractuales
  + overhead
  + costesDirectosNoLaborales
```

## Construcción del precio

Los tres porcentajes se calculan sobre el coste total interno:

```text
precioMinimoOrdinario = costeTotalInterno × (1 + 40% + 12%)
precioInicial = precioMinimoOrdinario + costeTotalInterno × 8%
```

Por tanto:

```text
precioMinimoOrdinario = costeTotalInterno × 1,52
precioInicial = costeTotalInterno × 1,60
```

El comercial puede negociar dentro de esos ocho puntos calculados sobre coste. El descuento visible al cliente es la reducción real entre el precio inicial y el precio de cierre. Un servicio ordinario no puede cerrarse por debajo del precio mínimo ni por encima del precio inicial mediante el flujo normal.

## Comisión

La capa del 12 % utilizada para construir el precio no se confunde con la liquidación de la comisión.

```text
netoPrecomision = precioCierreSinIVA - costeTotalInterno
comision = netoPrecomision × porcentajeTramo
beneficioFinalGASI = netoPrecomision - comision
```

Tramos v1:

| Posición de cierre | Comisión sobre neto precomisión |
|---|---:|
| Precio mínimo ordinario | 12 % |
| Entre mínimo e inicial | 13,5 % |
| Precio inicial | 15 % |

## Semáforo

El semáforo utiliza el beneficio final de GASI después de comisión y lo compara con el coste total interno:

```text
retornoGASI = beneficioFinalGASI / costeTotalInterno × 100
```

- Verde: retorno igual o superior al 40 %.
- Amarillo: retorno igual o superior al 30 % e inferior al 40 %.
- Rojo: retorno inferior al 30 %.

Se informa además del margen final sobre venta, pero no es el denominador del semáforo de esta política.

## Datos pendientes

No existen fallbacks económicos ni ceros silenciosos. Salarios, pluses, cotizaciones y AT/EP necesitan fuente verificada. Cuando falte un dato, sea inválido o su fuente esté pendiente, el motor devuelve:

```text
status: pending_configuration
action: complete_in_administration
issues: [campo y motivo exactos]
```

El presupuesto permanece en borrador hasta completar los datos.

## Seguridad y trazabilidad

- El endpoint económico solo admite Maestro y Administrador autorizado.
- La proyección comercial elimina salario, coste, margen, comisión e importe de beneficio.
- Cada cálculo correcto genera un snapshot con entradas, resultados, fecha y versión del motor.
- Los snapshots se diseñan para persistirse de forma inmutable junto al presupuesto.
