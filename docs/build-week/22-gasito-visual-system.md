# Sistema visual Gasito — fase 3

## Decisión de implementación

El repositorio no contiene actualmente una ilustración fuente identificada como Gasito ni variantes licenciadas por rol. Para no presentar como oficial un activo inexistente, la candidatura usa un único componente visual coherente, construido en React y CSS a partir de los rasgos proporcionados: robot sanitario blanco, cabeza redondeada, visor oscuro, ojos azules, detalles GASI y proporciones compactas.

Los cinco actores comparten exactamente la misma anatomía. Solo cambian herramienta, detalle cromático, estado y movimiento:

| Actor | Detalle | Función |
| --- | --- | --- |
| Gasito | Azul, estetoscopio | Modera; no vota ni calcula |
| Gasito Gestoría | Verde, portapapeles | Personal y costes laborales |
| Gasito Finanzas | Azul oscuro, calculadora | Viabilidad económica |
| Gasito Auditor | Naranja, búsqueda documental | Riesgos, evidencia y control |
| Gasito Legal | Violeta, balanza | Riesgo legal y contractual |

Legal no promete ni certifica cumplimiento.

## Estados y movimiento

La animación se deriva del estado, no de una decoración aleatoria: `Esperando`, `Revisando`, `Con hallazgos`, `De acuerdo`, `En desacuerdo`, `No disponible` y `Completado`.

Solo existe una animación principal a la vez. En una contradicción se activa el emisor y el destinatario recibe una señal breve distinta. Un crítico no dispara animaciones festivas. Todo el movimiento usa `transform` y opacidad.

`prefers-reduced-motion: reduce` desactiva animaciones y transiciones no esenciales. El texto, los badges y los atributos ARIA conservan toda la información sin movimiento.

## Activo pendiente

Cuando GASI aporte la ilustración oficial de Gasito con autorización de uso, el cuerpo CSS podrá sustituirse por esa única fuente preservando estados, accesorios, etiquetas y accesibilidad. No se han usado imágenes externas ni se ha fingido que existe un activo oficial dentro del repositorio.
