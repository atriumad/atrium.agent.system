---
sidebar_position: 3.8
title: "Lealtad y la tarjeta de sellos"
description: "Cómo un local configura y usa la tarjeta de sellos, los límites que aplican y lo que todavía no está."
---

# Lealtad y la *tarjeta de sellos*

La tarjeta de sellos es la parte de lealtad del [CRM](../modules/crm). El guest escanea un QR en el local y recibe una tarjeta en el navegador del teléfono sin dar ningún dato. El personal agrega un sello después de cada visita y entrega el premio cuando la tarjeta se llena. Todo lo que pasa queda en las tablas propias de Atrium, junto a los guests, consentimientos y encuestas que el sistema ya tiene.

:::note
Hoy están construidos la API y los datos; la página de la tarjeta del guest (`apps/qr-card`) y las pantallas de Platform y Manager son la entrega B y van marcadas **próximamente** abajo. Mientras tanto las rutas se pueden probar con `curl` y la semilla demo, ver [probarlo en local](#probarlo-en-local).
:::

## Qué es una tarjeta

- **Anónima y ligada a un dispositivo.** Una tarjeta se crea sin nombre, email ni teléfono. La API pone una cookie propia, `atr_card_dev`, en el primer registro y deriva el dispositivo de ella; un id de dispositivo en el cuerpo de la petición se ignora. Ver [ADR 0022](../adr/0022-loyalty-card-device-bound).
- **Una tarjeta web, no un pase de wallet.** Se abre en el navegador y se puede agregar a la pantalla de inicio. Los pases de Apple y Google Wallet son una entrega posterior y irán detrás del mismo registro de tarjeta. Una tarjeta web no tiene avisos en la pantalla de bloqueo.
- **El progreso se deriva.** Los sellos de una tarjeta se cuentan desde su registro de eventos de solo agregar (`stamp`, `reward_earned`, `reward_redeemed`, `void`), nunca se guardan como un número corriente.
- **El email es opcional.** Un guest puede agregar un email con consentimiento para enterarse de sus premios. Solo entonces Core crea o encuentra un guest, y el consentimiento queda registrado con la fuente `loyalty_card`. El email vive solo en las tablas de guests de Core.

## Configurar el programa

Un programa por local. Los campos y sus límites:

| Campo | Regla |
| --- | --- |
| Sellos necesarios | 2 a 20, por defecto 8 |
| Premio | Texto de 1 a 80 caracteres |
| Enfriamiento | 0 a 1440 minutos entre dos sellos de una tarjeta, por defecto 240 (4 horas) |
| Acento | Uno de `lime`, `clay`, `charcoal`, `sage` (todavía sin subir logo) |
| Activo | Un programa en pausa sigue respondiendo, con `state: "paused"`, y no se puede sellar |

Configurar el programa requiere el permiso `loyalty:manage`: el admin de la agencia y el account manager (lo configuran, no están en el local) y el dueño del cliente. Toda la función es la función `retention` del paquete: un cliente donde está bloqueada recibe `403 feature_locked` en cada ruta de lealtad.

| Ruta | Propósito |
| --- | --- |
| `GET /api/loyalty/program?locationId=` | Leer el programa del local |
| `PUT /api/loyalty/program` | Crearlo o cambiarlo |
| `GET /api/loyalty/program/join-link?locationId=` | La URL de registro (`<QR_CARD_URL>/j/<joinToken>`) y el token para imprimir como QR |
| `POST /api/loyalty/program/rotate-qr` | Invalidar todos los QR de registro impresos y emitir uno nuevo |

El token de registro tiene la forma `jq1.<programId>.<version>.<firma>`. Rotar el QR sube la versión, así que los códigos impresos dejan de funcionar al instante. Es independiente del QR de la encuesta.

## En el mostrador

El personal son los roles propios del cliente: el dueño y el staff. Sellar y canjear están restringidos a los roles de cliente y a los locales que el usuario puede ver.

| Acción | Ruta | Quién |
| --- | --- | --- |
| Agregar un sello | `POST /api/loyalty/stamps` | dueño del cliente, staff del cliente |
| Entregar el premio | `POST /api/loyalty/redeem` | dueño del cliente, staff del cliente |
| Cancelar el último sello (un error) | `POST /api/loyalty/void` | `loyalty:manage` |

Un sello o un canje lleva un `locationId` obligatorio, el `code` corto (8 caracteres, mostrado `XXXX-XXXX`) o el `cardToken` leído del QR de la tarjeta, y una `idempotencyKey`. Enviar la misma clave dos veces es un solo sello. Reglas que un sello debe cumplir:

- el programa está activo y la tarjeta abierta;
- pasó el enfriamiento: justo el enfriamiento después del último sello se permite, un segundo antes se rechaza con `409 refused` y la hora para reintentar;
- un local fuera del alcance del usuario responde el mismo "no encontrado" que un código desconocido.

Cuando cae el último sello, la tarjeta gana un premio en la misma transacción. La respuesta del sello informa entonces `stampsInCycle` igual a los sellos requeridos, mientras la vista de la tarjeta muestra 0 y `rewardReady: true`. Canjear se permite con el programa en pausa y con la tarjeta cerrada, así un premio ya ganado nunca se pierde.

Un void cancela el último sello que no fue anulado y nunca borra nada. Un sello que ganó un premio no se puede anular en esta versión.

## Qué ve el dueño

- `GET /api/insights/loyalty?range=7d|30d|90d&place=` devuelve las cifras de la banda: tarjetas emitidas, tarjetas activas, sellos, premios ganados y premios canjeados, con el cambio frente a la ventana anterior.
- `GET /api/loyalty/activity` lista sellos, premios y tarjetas con paginación en el servidor, un filtro `kind` y el mismo rango y local.

Las pantallas de Platform y Manager para esto (la pantalla de sellado con escáner de cámara, la configuración del programa, la tarjeta imprimible de registro y la página de Activity) llegan **próximamente** en la entrega B.

## El lado del guest

Las rutas públicas no necesitan sesión, y el token de la tarjeta en la ruta es el único secreto. Nada de lo que devuelven contiene un guest ni un email.

| Ruta | Propósito |
| --- | --- |
| `POST /v1/loyalty/cards` | Registrarse con un `joinToken`. Devuelve una sola vez el token de la tarjeta y el código corto, y pone la cookie del dispositivo. |
| `GET /v1/loyalty/cards/:token` | La tarjeta: marca, premio, sellos, `rewardReady`, `state`. Soporta `ETag` e `If-None-Match` (un 304 no lleva cuerpo). |
| `POST /v1/loyalty/cards/:token/email` | El opt-in opcional: `{ email, consent: true }`. Responde 204. |

Un programa en pausa, un local suspendido o una tarjeta cerrada responde 200 con `state: "paused"` o `"closed"`. Un token desconocido o mal formado es 404. Las cookies son `HttpOnly`, `SameSite=Lax`, `Path=/`, y `Secure` cuando la petición es https, cuando un proxy de confianza dice que lo fue, cuando `QR_CARD_URL` empieza con `https://`, o en producción.

## Los límites

Los contadores viven en Postgres y un límite responde `429` con `Retry-After`.

| Límite | Valor |
| --- | --- |
| Intentos de registro por dirección IP | 20 por hora |
| Tarjetas por dispositivo y programa | 1 por 24 horas móviles |
| Tarjetas nuevas por programa, quien sea que se registre | 200 por hora |
| Lecturas por token de tarjeta | 120 por minuto |
| Intentos de sellar y canjear por usuario del personal | 10 por minuto |

Dos consecuencias a conocer antes de un lanzamiento: el WiFi compartido de un local comparte las 20 altas por IP por hora, y las 200 tarjetas por programa por hora las puede agotar alguien que abuse del QR del póster. El límite por dispositivo es antiabuso, no de integridad: dos registros en el mismo instante pueden saltárselo.

## Ajustes

| Variable | Efecto |
| --- | --- |
| `LOYALTY_SECRET` | Firma los tokens de registro y hashea la cookie del dispositivo. Sin ella las rutas de lealtad no se montan. |
| `TRUST_PROXY` | Poner `1` solo cuando un proxy que controlas pone `X-Forwarded-For`. Entonces el primer salto es la dirección del cliente; si no, lo es la dirección del socket. |
| `QR_CARD_URL` | Origen público de la app de la tarjeta, usado en la URL de registro imprimible. Por defecto en desarrollo: `http://localhost:3006`. |

## Probarlo en local

`bun run seed:loyalty` (solo desarrollo) da a cada local demo un programa activo e imprime la URL de registro de cada uno. Primero levanta la base de datos y la API con la guía de [desarrollo local](./local-development).

## Lo que todavía no está

- La página de la tarjeta y las pantallas de Platform y Manager (entrega B).
- Pases de wallet y avisos de wallet (entrega D).
- Segmentos de guests, automatizaciones, campañas y el ciclo de vida (entrega C). El opt-in de email no está verificado: quien tenga un token de tarjeta puede asociar un email conocido, y un email de confirmación (doble opt-in) llega con la entrega C.
- Un logo en la tarjeta (necesita almacenamiento de archivos), varias tarjetas por local, tiers.
- La herramienta de agente `crm.get_loyalty_card` existe pero no está registrada en el servicio de agentes hasta que el agente de CRM tenga su manifiesto.
