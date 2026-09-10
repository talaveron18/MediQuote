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
