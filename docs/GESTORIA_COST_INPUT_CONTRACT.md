# Contrato de entrada de costes reales desde gestoría

## Objetivo
Definir exactamente qué datos debe entregar la gestoría para que MediQuote pueda comparar coste estimado y coste real sin inventar salarios, cotizaciones, pluses ni reglas económicas.

## Principio
MediQuote no debe inferir un coste real a partir de una cifra global si el desglose existe. Cada dato importado debe conservar periodo, categoría/profesional, territorio, tipo de contrato, fuente documental y unidad.

## Identificación obligatoria
- `source_document_id`: referencia interna al documento origen.
- `source_document_name`: nombre del documento de gestoría.
- `source_document_date`: fecha de emisión.
- `period_start` / `period_end`: periodo liquidado.
- `professional_category`: categoría profesional normalizada.
- `province` y, cuando afecte al convenio, `municipality`.
- `contract_type`: indefinido, temporal, fijo_discontinuo o mercantil_autonomo.
- `labor_contracts`: número de contratos incluidos.

## Costes salariales
Solicitar por separado, cuando sean aplicables:
- salario base bruto ordinario;
- pagas extraordinarias, indicando si están prorrateadas o separadas;
- complementos fijos de convenio;
- nocturnidad;
- domingos;
- festivos, diferenciando si la liquidación territorial distingue nacional/autonómico/provincial/municipal;
- horas extraordinarias;
- otros conceptos salariales, con nombre e importe.

Cada línea debe indicar importe y unidad (`EUR_periodo`, `EUR_hora`, `EUR_turno`, porcentaje u otra unidad explícita).

## Cotizaciones empresariales
Solicitar importes reales y, si la gestoría los facilita, bases y porcentajes para:
- contingencias comunes;
- desempleo;
- FOGASA;
- formación profesional;
- MEI;
- accidentes de trabajo/enfermedad profesional;
- otras cotizaciones empresariales.

No completar porcentajes ausentes con valores históricos o de otro CNAE/territorio.

## Costes de contratación y gestión
Solicitar por separado:
- coste de alta/contrato o tarifa de gestoría atribuible al contrato;
- costes de extinción/finiquito si existen en el periodo;
- provisiones efectivamente contabilizadas, si la gestoría las usa;
- otros costes administrativos directamente atribuibles.

## Costes directos no salariales
Cuando estén asociados al servicio, la entrada debe admitir líneas separadas para desplazamiento, kilometraje, peajes, parking, dietas, alojamiento, material, EPI, uniforme, equipamiento, vehículo, seguro específico, vigilancia de salud, selección/reclutamiento y otros.

## Campos de conciliación
- `actual_total_labor_cost`
- `actual_total_employer_contributions`
- `actual_total_contract_cost`
- `actual_total_direct_costs`
- `actual_total_cost`

La suma de las líneas debe cuadrar con `actual_total_cost`. Si no cuadra, la importación queda en estado `pending_reconciliation` y no alimenta una desviación definitiva.

## Vinculación con MediQuote
La estructura se mapea a `CostAudit.actualBreakdown` y `actualCost`. La comparación se realiza contra el `CostingQuote.snapshot`/`CostSnapshot` que estaba vigente al presupuestar, no contra una configuración recalculada posteriormente.

## Datos que NO debe inventar MediQuote
- salario bruto productivo;
- horas productivas anuales;
- porcentajes de cotización;
- AT/EP;
- pluses de convenio;
- coste de gestoría por contrato;
- provisiones de extinción;
- overhead;
- markup, suelo comercial, buffer o comisión.

Si falta cualquiera de esos datos y es necesario para el cálculo, el motor debe conservar `pending_configuration`.

## Validaciones mínimas
1. Importes finitos y >= 0 salvo ajustes/regularizaciones explícitamente marcados.
2. Periodo válido y no invertido.
3. Documento fuente obligatorio.
4. Territorio obligatorio para costes dependientes de convenio.
5. Tipo de contrato obligatorio para cotización laboral.
6. Suma de componentes = total dentro de tolerancia de redondeo de 0,02 EUR.
7. No mezclar varias categorías/territorios en una única línea agregada si impide reconciliación.
8. Conservar evidencia documental; nunca copiar credenciales o datos innecesarios de trabajadores.

## Salida para auditoría
Para cada presupuesto/servicio debe poder responderse: qué se estimó, con qué versión del motor, qué coste real comunicó la gestoría, qué documento lo respalda, qué componente explica la desviación y en qué fecha se incorporó.