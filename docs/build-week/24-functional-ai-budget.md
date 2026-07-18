# Presupuesto con IA — implementación funcional

## Alcance real

- Rama exclusiva: `feature/build-week-ai-review-loop`.
- `main`, producción y Netlify no se modifican.
- El flujo clásico `Nuevo Presupuesto` permanece disponible y utiliza el mismo componente que antes.
- `Presupuesto con IA` es una entrada adicional que reutiliza el formulario, el estado Zustand, los selectores territoriales y `/api/calculations` existentes.
- La IA prepara datos comerciales y operativos; no calcula precios, costes, márgenes, comisiones ni cotizaciones.
- Las correcciones manuales detectadas después de una propuesta de IA quedan protegidas frente a propuestas posteriores.

## Recorrido

1. El usuario describe el servicio o formula una consulta normativa.
2. El asistente prepara únicamente los campos identificables y pregunta como máximo dos datos necesarios.
3. El usuario revisa y edita el formulario real.
4. `Calcular` llama al motor determinista existente.
5. Tras un resultado válido se abre una revisión sobria de cobertura, jornada, advertencias, IVA por partidas y decisión humana.
6. Costes y datos internos solo aparecen para `admin` o `maestro`; el servidor sigue saneando la respuesta por rol.

## Consultas normativas

- Requieren `OPENAI_API_KEY`; sin clave el sistema se niega a inventar una respuesta.
- Utilizan búsqueda web y solo admiten enlaces de organismos oficiales/primarios en la salida.
- Cada fuente muestra organismo, publicación, consulta, apartado y enlace.
- Las respuestas incluyen el aviso profesional fijo y, si hay búsqueda, el aviso de fuentes externas.
- Ninguna consulta modifica reglas, convenios, parámetros ni cálculos.

## Retirada de la demo anterior

Se han eliminado la ruta `/demo/build-week`, el consejo de cinco personajes, votos, debates, animaciones y el frontend de revisión simulado. No forman parte del código ejecutable de esta fase.

## Calidad

- 25 evaluaciones específicas cubren extracción operativa, meses múltiples, precedencia manual, separación normativa, ausencia de campos económicos y detección de valores no finitos.
- El formulario clásico expone un callback opcional únicamente después de un cálculo válido; su uso por defecto no cambia.
- La marca visual del asistente es un indicador sobrio temporal, pendiente de sustituir por el recurso oficial de Gasito.
