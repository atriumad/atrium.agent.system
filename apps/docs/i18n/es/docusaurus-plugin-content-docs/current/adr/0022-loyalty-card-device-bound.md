---
id: 0022-loyalty-card-device-bound
sidebar_position: 23
title: "0022 · La tarjeta de lealtad es anónima y ligada a un dispositivo"
sidebar_label: "0022 · La tarjeta de lealtad es anónima y ligada a un dispositivo"
description: "La tarjeta de lealtad es anónima y ligada a un dispositivo"
---

# ADR 0022: La tarjeta de lealtad es anónima y ligada a un dispositivo

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-19 | Atrium · producto y tecnología |

## Contexto

Los clientes necesitan una tarjeta de sellos digital al estilo de Rondafy: el guest escanea un QR en el local y tiene una tarjeta al instante, sin formulario. Core no puede crear un guest sin email o teléfono, y el guest no debería tener que dar ninguno para empezar. Los registros relevantes (tarjetas, sellos, premios) deben quedar igualmente en los datos propios de Atrium, con seguridad por fila, rastro de auditoría y eventos como cualquier otro módulo.

## Decisión

- **La tarjeta es anónima y pertenece a un dispositivo, no a una persona.** Se crea con un token aleatorio de 128 bits cuyo texto plano existe solo en el navegador del guest; la base de datos guarda su hash sha-256. Una tarjeta recibe un guest solo si el guest hace opt-in con un email y consentimiento, y entonces Core resuelve el guest y registra el consentimiento (fuente `loyalty_card`). Varias tarjetas pueden apuntar a un mismo guest.
- **El dispositivo es una cookie propia.** La API pone `atr_card_dev` (httpOnly, `SameSite=Lax`, `Path=/` en el origen de la app de la tarjeta) y hashea su valor con HMAC bajo `LOYALTY_SECRET`. Un id de dispositivo en un cuerpo nunca se lee. El valor es un UUID sin firmar que el servidor generó; se acepta porque falsificarlo solo cambia el dispositivo que el falsificador ya es.
- **Web antes que wallet.** La tarjeta es una página web que se puede agregar a la pantalla de inicio. Apple y Google Wallet necesitan cuentas de desarrollador que el dueño debe abrir (un certificado y una cuenta de emisor), así que los pases llegan después detrás del mismo registro de tarjeta.
- **Un token de registro público, separado del QR de la encuesta.** Formato en el cable `jq1.<programId>.<version>.<sig>`, donde la firma es un HMAC-SHA256 bajo `LOYALTY_SECRET` sobre `join:<programId>:<version>`. Rotar la versión invalida los códigos impresos. Un token de QR de encuesta nunca verifica como token de registro, ni al revés.
- **Las búsquedas públicas usan funciones `security definer`.** Quien llama a una ruta pública no tiene tenant, así que `crm.card_scope(token_hash)` y `crm.program_scope(program_id)` devuelven los ids detrás de un hash o id completo y exacto y nada más (sin listado, sin coincidencia por prefijo), y la ruta corre entonces bajo la seguridad por fila de ese cliente. Es el mismo enfoque que `client_id_for_location` de Core. Los contadores de los límites se escriben con `crm.hit_rate`.
- **El progreso se deriva de un registro de eventos de solo agregar.** `stamp`, `reward_earned`, `reward_redeemed` y `void` nunca se actualizan ni se borran. Sellar, canjear y anular toman un bloqueo consultivo sobre la tarjeta, son idempotentes por tarjeta y clave, y escriben una entrada de auditoría.
- **Eventos.** `loyalty.card.issued`, `loyalty.stamp.added`, `loyalty.reward.earned`, `loyalty.reward.redeemed` y `contact.captured`, solo con ids. `loyalty.reward.earned` reemplaza al `loyalty.milestone.reached` de la página anterior de CRM; ese nombre nunca estuvo en los contratos.
- **Acceso.** La función es la función `retention` del paquete. Core suma el recurso de permisos `loyalty` (`read`, `stamp`, `redeem`, `manage`): los roles de agencia leen y gestionan, el dueño del cliente tiene los cuatro, el staff del cliente lee, sella y canjea. Solo los roles de cliente sellan o canjean.

## Consecuencias

- Un guest con dos teléfonos tiene dos tarjetas. El opt-in de email enlaza ambas a un guest para el CRM, no sus sellos. Un teléfono perdido significa una tarjeta nueva.
- **El opt-in de email no está verificado.** Quien tenga un token de tarjeta puede asociar una dirección que conozca, y el consentimiento se registra para ella. El doble opt-in es la entrega C.
- **Redes compartidas.** El NAT de un local comparte las 20 altas por IP por hora. Las 200 tarjetas nuevas por programa por hora las puede agotar un abuso del QR del póster; la especificación lo aceptó.
- **El límite por dispositivo es antiabuso, no de integridad.** Es un conteo móvil de 24 horas de tarjetas emitidas por dispositivo y programa, y registros concurrentes pueden saltárselo.
- **IP del cliente.** La app de la tarjeta llega a la API solo a través de un route handler del mismo origen en `/loyalty-api/*`, no de un rewrite de Next (un rewrite conserva el `X-Forwarded-For` que escribió el cliente). El handler construye la petición a la API desde una lista permitida, así que lleva como mucho un `X-Forwarded-For`, la entrada que está `QR_CARD_PROXY_HOPS` lugares desde la derecha de la cadena (ninguna cuando es 0, el valor por defecto), y limita los cuerpos a 8 KiB mientras llegan (`413`). qr-card debe ser alcanzable solo a través de los proxies contados, y una entrada que no sea una IP sola (con puerto, por ejemplo) falla cerrado. La API no cree la cabecera por su palabra: para las rutas de lealtad confía en `X-Forwarded-For` y `X-Forwarded-Proto` solo cuando `TRUST_PROXY` está activo, `LOYALTY_PROXY_SECRET` tiene 32 o más caracteres y la petición lo lleva en `x-atrium-proxy`; si no, usa la dirección del socket, y un `X-Forwarded-Proto` no confiable no hace `Secure` la cookie.
- **Pendiente conocido.** `apps/api/src/onboarding.ts` confía en `X-Forwarded-For` sin compuerta. Es anterior a las rutas de lealtad y queda fuera de ellas.
- **Clave IPv6.** Los límites se calculan sobre la dirección completa. Un cliente con un /64 de IPv6 puede rotar por todo un prefijo de direcciones, así que los límites por IP no lo contienen; calcular sobre el /64 es un pendiente.
- **El poller debe enviar `If-None-Match` por su cuenta.** Las rutas públicas responden `Cache-Control: no-store`, así que el navegador no hará peticiones condicionales solo. La página de la tarjeta de la entrega B guarda el último cuerpo y el `ETag` y envía `If-None-Match`.
- **Un void no escribe un evento propio para los consumidores.** Los consumidores de sellos no pueden descontar los voids; el pendiente de Retention debe resolverlo.
- **Las bases locales que aplicaron un `crm/0001` anterior** durante esta rama necesitan `drop schema crm cascade; delete from public.schema_migrations where module='crm'` y luego `bun run db:migrate`.
- **La cookie no está firmada.** Un UUID hasheado con el secreto, no un valor firmado. Aceptado.
- **Un sello que completa informa `stampsInCycle` igual a los sellos requeridos**, mientras la vista de la tarjeta muestra 0 y `rewardReady`. Los clientes de la API deben leer ambos.
- **Un void no puede cancelar un sello que ganó un premio** en esta versión.
- **Canjear se permite con el programa en pausa y con la tarjeta cerrada**, así un premio ganado nunca se pierde.
- **El control de retención es solo a nivel de cliente.** No hay control por local.
- Un programa en pausa, un local suspendido o una tarjeta cerrada responde 200 con un estado; un token desconocido es 404. Quien tiene el token no aprende nada nuevo de "cerrada".
- `crm.get_loyalty_card` existe en el módulo pero no está registrada en el servicio de agentes hasta que la entrega C dé un manifiesto al agente de CRM. El worker sí registra el consumidor de borrado que desvincula una tarjeta de un guest borrado.
- Las tarjetas web no tienen avisos en la pantalla de bloqueo. Dicho con claridad en la documentación.

## Entrega B (2026-10-20)

La app de la tarjeta (`apps/qr-card`, puerto 3006), las pantallas de Platform y Manager y el proxy de arriba están construidos.

- **El QR de la tarjeta contiene el código corto (`XXXX-XXXX`), nunca el token.** Una foto del QR da al personal una clave de búsqueda y nada que abra la tarjeta.
- **El token vive en la ruta `/c/<token>`**, así que un acceso directo en la pantalla de inicio hecho desde la página de la tarjeta lo lleva consigo. La página de registro se reemplaza por la de la tarjeta y el navegador recuerda el token en su propio almacenamiento.
- **Sin web manifest.** Un acceso directo funciona; no se promete una app instalable.
- La app de la tarjeta responde `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` y `Cache-Control: no-store`, porque la URL de una tarjeta es una credencial.

## Alternativas descartadas

- **Pases de wallet primero:** dependen de cuentas que el dueño no ha abierto, y el registro de la tarjeta tendría que existir igual.
- **Una tarjeta atada a un email desde el inicio:** pide datos al guest antes de darle algo, que es la fricción que el producto quita, y Core no puede guardar un guest sin contacto.
- **Un id de dispositivo enviado por el cliente:** se falsifica sin esfuerzo para obtener una segunda tarjeta.
- **Una cookie de dispositivo firmada:** más maquinaria para un valor que no protege nada que el hash no proteja.
- **Un QR de tarjeta rotativo:** la respuesta prevista contra las capturas de pantalla, se deja para después; el enfriamiento y la presencia del personal lo limitan hoy.
