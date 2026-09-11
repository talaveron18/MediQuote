# Matriz QA funcional E2E — MediQuote

## Objetivo
Detectar fallos de uso real que no aparecen en tests unitarios: elementos repetidos que no abren, sumas que no cambian, persistencia incompleta, doble envío, permisos incorrectos y discrepancias entre UI y servidor.

## Entorno obligatorio
- Navegador automatizado con Playwright salvo incompatibilidad técnica demostrada.
- Base PostgreSQL de prueba aislada.
- Seed exclusivamente sintético.
- Sin llamadas a producción, Netlify ni datos reales.
- Cada bug confirmado debe terminar con test de regresión reproducible.

## Personas de prueba
- `maestro`: acceso total esperado.
- `admin`: según permisos configurados.
- `comercial_a`: solo capacidades comerciales autorizadas.
- `comercial_b`: sirve para comprobar aislamiento entre comerciales.

## Viaje E2E-01 — presupuesto básico completo
1. Login.
2. Crear cliente sintético.
3. Crear presupuesto.
4. Añadir bloque profesional.
5. Calcular.
6. Guardar.
7. Salir al dashboard.
8. Reabrir.
9. Verificar igualdad de servicio, fechas, horas, profesionales, territorio y totales.
10. Editar un dato.
11. Guardar y recargar.
12. Generar PDF.
13. Crear solicitud de firma si el flujo está habilitado.

Invariante: `UI total == servidor total == PDF total` dentro de tolerancia de 0,02 EUR.

## E2E-02 — múltiples profesionales
Matriz mínima: 1, 2 y 3 profesionales/puestos; misma categoría y categorías diferentes cuando el modelo de bloque lo permita.

Comprobar:
- el número visible coincide con el persistido;
- cada cambio fuerza recálculo válido;
- eliminar una unidad revierte solo su contribución correspondiente;
- costes fijos no se multiplican accidentalmente;
- no se supone linealidad si el motor separa costes fijos y variables.

## E2E-03 — bloques repetidos
Crear tres bloques, incluyendo dos con misma categoría.

Acciones: abrir/cerrar segundo y tercero, editar solo el segundo, clonar primero, reordenar, eliminar intermedio y volver a abrir los restantes.

Invariantes:
- cada control actúa sobre su propio `block_id`;
- no hay referencias compartidas entre clon y original;
- el orden persistido coincide tras recarga;
- eliminar un bloque no cambia datos de los otros.

## E2E-04 — territorios y centros
Probar dos localizaciones sintéticas y múltiples centros cuando la UI lo permita.

Comprobar que el territorio usado por el motor es el mismo que muestra la UI y que un cambio de provincia/municipio invalida o recalcula los parámetros dependientes del convenio.

## E2E-05 — calendario y turnos
Casos: día único, rango, varios días, noche cruzando medianoche, fin de semana, domingo, festivo y exclusiones.

Invariantes:
- horas totales = desglose horario del servidor;
- un festivo no se cuenta dos veces por reglas solapadas;
- persistencia exacta de fechas y horas tras recarga.

## E2E-06 — añadir/quitar/clonar/reordenar
Ejecutar secuencias rápidas y repetidas, incluyendo doble clic controlado.

Comprobar idempotencia de botones que puedan crear o enviar recursos. Ningún doble clic debe crear dos presupuestos, dos bloques o dos solicitudes de firma.

## E2E-07 — entradas inválidas
Casos: campos vacíos, cantidades 0 y negativas, fechas invertidas, hora inválida, descuento fuera de rango, categoría inexistente/desactivada y datos no finitos por manipulación de request.

Resultado esperado: bloqueo explícito; nunca `NaN`, infinito, total silencioso 0 ni HTTP 500 con detalle interno sensible.

## E2E-08 — navegación
Tras cambios no guardados: refresh, back/forward y navegación a otra vista. Verificar comportamiento definido y ausencia de corrupción. Tras cambios guardados, recargar debe reconstruir el mismo estado.

## E2E-09 — permisos
- comercial A no ve costes internos ni presupuestos ajenos salvo permiso explícito;
- comercial B no puede modificar recursos de A sin permiso;
- admin respeta overrides;
- maestro conserva control completo;
- API y UI deben aplicar el mismo límite: ocultar un botón no basta.

## E2E-10 — PDF y firma
- PDF usa snapshot/valores guardados coherentes;
- hash/documento de firma corresponde a la versión enviada;
- editar presupuesto después de crear una solicitud no debe hacer parecer que la firma cubre una versión distinta;
- doble clic no genera solicitudes duplicadas;
- token inválido/caducado/revocado no permite aceptar.

## E2E-11 — recuperación de contraseña
- respuesta de solicitud no revela existencia de cuenta;
- token de un solo uso;
- token expirado rechazado;
- nueva contraseña cumple política;
- después del reset las sesiones anteriores dejan de ser válidas;
- rate limit de solicitud y login.

## E2E-12 — vigencias históricas de costes verificados
Usar exclusivamente fixtures sintéticos `verified` con dos vigencias no solapadas (`v1` y `v2`) para la misma categoría, territorio, modalidad contractual y conceptos obligatorios.

Invariantes:
- un presupuesto guardado bajo `v1` conserva al reabrirse su total, artefacto inmutable y fuentes `v1`, aunque después se incorpore `v2`;
- el PDF cliente y una firma posterior del presupuesto histórico se generan desde el presupuesto/snapshot guardado y no sustituyen silenciosamente sus fuentes por `v2`;
- un presupuesto nuevo cuya fecha de servicio cae en `v2` consume exclusivamente fuentes `v2`;
- editar y recalcular un borrador histórico con fechas que ya caen en `v2` crea una nueva versión económica con fuentes `v2`, sin reutilizar el snapshot `v1`;
- un bloque cuya prestación atraviesa el límite entre `v1` y `v2` queda `pending_configuration`, sin total ni `calculationToken`, salvo que exista una regla económica explícita aprobada para prorratear vigencias.

Regresión ejecutable: `e2e/verified-labor-version-history.spec.ts`. Las cifras de esta suite son sintéticas y no representan salarios, cotizaciones ni costes reales de GASI.

## Evidencia por fallo
Cada fallo confirmado debe registrar: ID, precondiciones, pasos exactos, esperado, real, captura/log sin secretos, archivo probable, severidad y test añadido.

## Criterio de readiness
No marcar MediQuote como listo para presupuestos reales hasta que E2E-01, 02, 03, 05, 07, 09, 10 y 12 estén automatizados y verdes; recuperación segura de contraseña debe estar resuelta antes de depender operativamente de una única cuenta maestra.
