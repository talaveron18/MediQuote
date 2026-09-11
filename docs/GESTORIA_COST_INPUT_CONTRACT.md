# Contrato de auditoría de costes con gestoría

## Objetivo
Definir qué información necesita MediQuote para auditar un presupuesto ya guardado frente a la documentación posterior de gestoría.

La gestoría **no alimenta ni gobierna el motor económico interno de MediQuote**. MediQuote calcula una estimación para presupuestar antes de disponer de la liquidación real. Cuando llega la documentación de gestoría, esta se considera la referencia correcta para los conceptos laborales/externos que conoce y se compara contra la fotografía original del presupuesto.

## Flujo funcional
1. MediQuote genera un presupuesto y conserva su `CostingQuote.snapshot` inmutable.
2. El presupuesto se guarda y puede seguir su flujo comercial.
3. Desde el presupuesto se inicia una auditoría.
4. Se adjunta el documento de gestoría correspondiente.
5. Se introducen o extraen de forma verificable los importes que realmente constan en ese documento.
6. MediQuote compara concepto por concepto la fotografía original con gestoría.
7. La auditoría queda asociada al presupuesto y conserva ambos lados de la comparación.

## Principio de autoridad
Para los conceptos que corresponden a gestoría:

`valor gestoría = referencia real`

Una diferencia no se corrige automáticamente ni se utiliza para cambiar silenciosamente parámetros de MediQuote. Se registra para localizar qué estimación difirió de la realidad.

## Identificación mínima del documento
Conservar, cuando esté disponible:
- identificador interno del documento;
- nombre original;
- fecha de emisión;
- periodo al que corresponde;
- presupuesto/servicio al que se vincula;
- fecha/hora de incorporación;
- usuario que lo incorporó;
- archivo original o evidencia equivalente.

No es requisito que la gestoría entregue un formato técnico diseñado para MediQuote. El sistema debe poder trabajar con el documento que la gestoría entregue y con el desglose verificable que contenga.

## Conceptos conciliables con gestoría
MediQuote debe poder enfrentar, cuando el documento los proporcione con suficiente detalle:
- salario y pagas extraordinarias;
- pluses/complementos;
- Seguridad Social a cargo de la empresa;
- accidentes de trabajo/enfermedad profesional;
- costes de contratación, gestión y finalización que realmente facture o liquide la gestoría.

Pueden añadirse otros conceptos conciliables únicamente cuando exista una fuente documentada que permita afirmar que gestoría conoce ese importe. No inventar ni reconstruir un desglose inexistente.

## Estado por concepto
Cada línea conciliable debe tener uno de estos estados:
- `match`: MediQuote y gestoría coinciden exactamente después del redondeo monetario aplicado por el sistema. Visualmente verde.
- `mismatch`: los importes difieren. Visualmente rojo y mostrando ambos valores y la diferencia.
- `not_provided`: el documento no permite obtener ese concepto de forma fiable. No se pinta verde ni rojo; queda pendiente/no conciliado.

El objetivo operativo es que todos los conceptos disponibles terminen en `match`.

## Costes internos GASI: sección separada
Los siguientes conceptos **no deben compararse con gestoría** porque son decisiones o imputaciones internas de GASI:
- overhead;
- comisión comercial;
- porcentaje/resultado imputado a GASI;
- otros costes o reglas internas aprobados por la empresa.

Deben aparecer en una sección independiente de la auditoría para reconstruir la economía completa del presupuesto, pero su estado de conciliación es `no aplica`.

Los valores internos proceden de la configuración económica de MediQuote vigente cuando se generó el presupuesto. Nunca deben sustituirse por valores actuales al abrir una auditoría histórica.

## Totales
La auditoría debe distinguir como mínimo:
- **coste conciliable previsto por MediQuote**: suma de conceptos que legítimamente pueden enfrentarse a gestoría;
- **coste confirmado por gestoría**;
- **diferencia conciliable**;
- **costes/resultados internos GASI**, mostrados aparte;
- **precio del presupuesto y resultado económico**, reconstruidos desde la fotografía original cuando corresponda.

No sumar dos veces overhead, costes directos, comisión o beneficio si ya forman parte de otro agregado del snapshot. Los totales económicos deben derivarse de las magnitudes canónicas del `CostSnapshot`, no de sumar indiscriminadamente las filas de presentación.

## Validaciones mínimas
1. Presupuesto existente y con snapshot económico sellado.
2. Documento de gestoría asociado al presupuesto correcto.
3. Importes finitos y no negativos salvo ajustes explícitamente documentados.
4. Solo se aceptan claves conciliables en `actualBreakdown`; claves internas enviadas como si fueran gestoría se ignoran/rechazan.
5. No declarar coincidencia cuando falta el dato de gestoría.
6. Mantener el archivo de gestoría y la comparación asociados a la auditoría creada.
7. No recalcular la fotografía original con configuraciones actuales.
8. No modificar automáticamente salarios, porcentajes, margen, comisión, overhead ni otras reglas a partir de una desviación.

## Relación con el modelo actual
- `CostingQuote.snapshot`: fotografía económica original usada por MediQuote.
- `CostAudit.estimatedCost`: parte conciliable prevista, no el coste interno total de GASI.
- `CostAudit.actualCost`: total confirmado por gestoría para esa parte conciliable.
- `CostAudit.estimatedBreakdown`: conserva el desglose original necesario para mostrar tanto conciliables como internos.
- `CostAudit.actualBreakdown`: contiene únicamente conceptos procedentes de gestoría.
- `CostAudit.analysis`: conserva la comparación por concepto y la sección interna separada.

## Regla de no invención
Este contrato no fija salarios, cotizaciones, costes hora, overhead, comisión, margen, porcentaje GASI ni tolerancias económicas nuevas. Esos valores solo pueden proceder de la configuración aprobada, de documentación vigente o de una decisión expresa de Fernando.

---

## Anexo A — datos verificables de gestoría para preparar costes laborales antes de presupuestar

Este anexo **no convierte a la gestoría en dueña de la política comercial**. Su única función es definir qué datos laborales/externos debe entregar o validar para que MediQuote pueda sustituir estados `pending_configuration` por inputs con fuente verificable. Ningún importe se presume y ningún campo ausente se rellena con cero.

### A.1 Identificación y alcance
Cada conjunto de datos debe identificar, como mínimo:
- `professional_category_id` o denominación inequívoca de la categoría;
- provincia/territorio y convenio aplicable;
- modalidad de contratación a la que aplica (`indefinido`, `temporal`, `fijo_discontinuo` o, cuando proceda, `mercantil_autonomo`);
- fecha de efecto desde la que el dato es aplicable;
- fecha fin si la fuente tiene vigencia limitada;
- documento/fuente del que sale el dato y fecha de verificación.

Si el dato cambia por categoría, territorio o modalidad contractual, debe entregarse separado; no se admite reutilizar un valor genérico entre configuraciones distintas sin evidencia.

### A.2 Retribución/coste profesional
Para cada categoría/configuración, la gestoría debe aportar **una de estas dos representaciones verificables**, nunca una mezcla reconstruida sin fuente:

**Opción preferida, desglose anual:**
- salario base anual ordinario;
- número de pagas extraordinarias;
- importe por paga extraordinaria;
- complementos fijos anuales obligatorios;
- otros conceptos salariales anuales obligatorios;
- horas anuales de convenio;
- horas productivas/facturables anuales utilizadas como denominador económico, si la gestoría puede validarlas; si no, se mantienen como parámetro legal/operativo separado y no se inventan desde nómina.

**Opción alternativa, coste bruto por hora productiva ya validado:**
- importe bruto por hora productiva;
- definición exacta de qué incluye y qué excluye;
- denominador/horas productivas con el que se obtuvo;
- fuente documental.

MediQuote no debe aceptar simultáneamente ambos formatos para una misma versión salvo que exista una regla explícita de prioridad y reconciliación; hasta entonces debe utilizarse uno solo como fuente canónica.

### A.3 Cotizaciones empresariales y AT/EP
Cuando correspondan a relación laboral, deben venir desglosadas como porcentajes o importes verificables según la fuente:
- contingencias comunes empresa;
- desempleo empresa, diferenciando modalidad cuando aplique;
- FOGASA;
- formación profesional;
- MEI del ejercicio aplicable;
- accidentes de trabajo/enfermedad profesional, con identificación de la tarifa/actividad aplicada y separación de componentes cuando la fuente los desglose;
- cualquier otra cotización empresarial obligatoria que efectivamente aplique.

Cada porcentaje necesita fuente y fecha de efecto. Un total agregado de Seguridad Social puede utilizarse para auditoría posterior, pero **no sustituye automáticamente** a los componentes del motor cuando éste necesita el desglose para presupuestar.

### A.4 Costes contractuales de gestoría
Debe indicarse de forma separada, cuando exista:
- coste de alta/contratación por contrato;
- coste periódico de gestión imputable por contrato o trabajador;
- coste de baja/finalización/tramitación cuando proceda;
- cualquier otro concepto facturado por la gestoría que deba formar parte del coste de prestar el servicio.

Para cada uno: unidad (`por_contrato`, `por_mes`, `por_trabajador`, `importe_fijo` u otra explícita), importe, IVA si afecta al coste contable utilizado, vigencia y fuente.

### A.5 Pluses y complementos variables
Si la gestoría dispone de reglas verificables del convenio o nómina que MediQuote deba aplicar, cada plus debe incluir:
- nombre;
- territorio/convenio;
- condición de aplicación (nocturnidad, domingo, festivo, turno u otra);
- fórmula (`por_hora`, `por_turno`, porcentaje de base u otra explícita);
- valor;
- base sobre la que se aplica si es porcentual;
- fecha de efecto;
- fuente oficial/documental.

MediQuote no transforma un texto ambiguo en fórmula económica. Si la fuente no permite determinar de manera inequívoca base, unidad o condición, el plus permanece pendiente.

### A.6 Entrada en MediQuote y trazabilidad
Los datos verificados deben entrar por una capa administrativa/configurable y versionada; no desde el formulario comercial del presupuesto. Cada versión debe conservar:
- clave/campo de destino en MediQuote;
- valor;
- unidad;
- categoría/territorio/contrato al que aplica;
- `effective_from` y, si existe, `effective_to`;
- referencia de fuente;
- usuario que lo incorporó o validó;
- fecha/hora de incorporación;
- estado `verified` o `pending`.

Un presupuesto solo puede usar valores `verified` vigentes para su fecha y configuración. El snapshot del cálculo guarda la versión/fuente usada, de modo que un cambio posterior no reescriba presupuestos históricos.

### A.7 Mapeo mínimo con los bloqueos actuales del motor
Sin fijar importes, el motor actual necesita como mínimo:
- salario/coste bruto productivo de la categoría (`ProfessionalCategory.defaultInternalCost` o futura estructura equivalente versionada);
- jornada anual de convenio y horas productivas territoriales;
- SMI anual aplicable;
- porcentajes empresariales de Seguridad Social exigidos por el motor;
- AT/EP aplicable;
- coste real de gestoría por contrato;
- reglas territoriales de pluses que se activen por las fechas/turnos del bloque;
- parámetros económicos internos GASI por separado, que **no** proceden de gestoría.

La ausencia de cualquiera de los campos exigidos por una configuración concreta debe producir `pending_configuration`, sin total final ni `calculationToken` utilizable.

### A.8 Archivo de intercambio recomendado
Si la gestoría puede devolver una tabla estructurada, usar una fila por concepto con estas columnas mínimas:

`concept_key | category | territory | contract_type | value | unit | effective_from | effective_to | source_document | source_date | notes`

El archivo puede ser CSV/XLSX o un documento equivalente. La importación futura debe validar claves conocidas y mantener el original como evidencia; no debe aceptar claves económicas nuevas de forma automática.
