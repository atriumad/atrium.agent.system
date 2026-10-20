---
sidebar_position: 3.8
title: "Lealtad y la tarjeta de sellos"
description: "Cómo un local configura y usa la tarjeta de sellos, cómo la app de la tarjeta llega a la API, los límites que aplican y lo que todavía no está."
---

# Lealtad y la *tarjeta de sellos*

La tarjeta de sellos es la parte de lealtad del [CRM](../modules/crm). El guest escanea un QR en el local y recibe una tarjeta en el navegador del teléfono (la app de la tarjeta, `apps/qr-card`, puerto 3006) sin dar ningún dato. El personal agrega un sello después de cada visita y entrega el premio cuando la tarjeta se llena. Todo lo que pasa queda en las tablas propias de Atrium, junto a los guests, consentimientos y encuestas que el sistema ya tiene.

## Qué es una tarjeta

- **Anónima y ligada a un dispositivo.** Una tarjeta se crea sin nombre, email ni teléfono. La API pone una cookie propia, `atr_card_dev`, en el primer registro y deriva el dispositivo de ella; un id de dispositivo en el cuerpo de la petición se ignora. Ver [ADR 0022](../adr/0022-loyalty-card-device-bound).
- **Una tarjeta web, no un pase de wallet.** Se abre en el navegador y se puede agregar a la pantalla de inicio. Los pases de Apple y Google Wallet son una entrega posterior y irán detrás del mismo registro de tarjeta. Una tarjeta web no tiene avisos en la pantalla de bloqueo.
- **El progreso se deriva.** Los sellos de una tarjeta se cuentan desde su registro de eventos de solo agregar (`stamp`, `reward_earned`, `reward_redeemed`, `void`), nunca se guardan como un número corriente.
- **El email es opcional.** Un guest puede agregar un email con consentimiento para enterarse de sus premios. Solo entonces Core crea o encuentra un guest, y el consentimiento queda registrado con la fuente `loyalty_card`. El email vive solo en las tablas de guests de Core.

## Usarla

### El guest

1. El guest escanea el QR de registro impreso. Abre `<QR_CARD_URL>/j/<joinToken>`, que crea la tarjeta y se reemplaza por `/c/<token de la tarjeta>`, así que la página de registro no queda en el historial de Atrás.
2. La tarjeta muestra el local, la cuadrícula de sellos con el acento del programa, el premio, el código corto (`XXXX-XXXX`) y un QR de ese código. **El QR contiene el código corto, nunca el token.** Una foto del QR no da acceso a la tarjeta misma.
3. El token de la tarjeta vive en la ruta `/c/<token>`, así que un acceso directo en la pantalla de inicio hecho desde esa página abre la misma tarjeta. No hay web manifest. El navegador además recuerda la tarjeta en su propio almacenamiento y la reabre desde la página de inicio de la app.
4. La página vuelve a preguntar a la API cada 5 segundos mientras está visible y cada 30 segundos oculta, con `If-None-Match`, así que una tarjeta sin cambios cuesta un `304`. Un `429` o un fallo hacen más lento el sondeo. Un sello nuevo aparece con un aviso para lectores de pantalla.
5. Al final el guest puede agregar un email con la casilla de consentimiento marcada; es opcional y el formulario no vuelve a aparecer una vez hecho.

La app de la tarjeta envía `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, y no admite ser enmarcada, porque la URL de una tarjeta es una credencial. No hace ninguna petición a terceros. Las páginas de la tarjeta y del registro se generan en cada petición (el layout lee las cabeceras de la petición), así que Next las responde con `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, y el handler `/loyalty-api` responde `Cache-Control: no-store` en cada respuesta.

**Limitación conocida: el token de la tarjeta se guarda solo en el `localStorage` del navegador.** El diseño (spec §2) nombra también una cookie; no está implementada. Safari borra el almacenamiento escrito por scripts tras unos 7 días sin interacción cuando la tarjeta no se añadió a la pantalla de inicio. Un guest que vuelva a escanear el QR de la mesa después recibe una tarjeta nueva (el límite por dispositivo es de 24 horas) y los sellos antiguos quedan huérfanos. Una cookie `httpOnly` puesta por el servidor es el posible seguimiento.

### El personal

En Platform, el dueño y el staff del cliente ven **Retention** con **Stamp a card**, **Loyalty activity** y **Program & QR**. En Manager la agencia ve **Loyalty** con **Activity** (solo lectura) y **Programs & QR**. Un cliente cuyo paquete bloquea Retention ve la página bloqueada en las páginas del menú. La pantalla de sellar también abre desde una URL directa (`/loyalty/stamp`) y responde bloqueado en su primera búsqueda, y entonces muestra la página bloqueada. La tarjeta pública sigue abriendo.

1. **Stamp a card** (`/loyalty/stamp`, dueño y staff). Elige el local, escribe el código de la tarjeta o escanea el QR en el teléfono del guest. Luego **Add stamp**; cuando la tarjeta está llena, **Redeem reward**. El dueño también puede usar **Void last stamp**, con un motivo de hasta 200 caracteres.
2. La pantalla crea una clave de idempotencia por acción. Un error de red, un 5xx o un 429 conservan la clave, así que **Try again** la reutiliza y nunca puede agregar un segundo sello. Un sello rechazado (por ejemplo por el enfriamiento) es definitivo y muestra la hora para reintentar.
3. El escáner de cámara necesita HTTPS o `localhost` y un navegador con `BarcodeDetector` (Chrome en Android, por ejemplo). No se sube nada. Donde falta, escribir el código siempre funciona.

### El dueño

1. **Program & QR** (`/loyalty/program`). Define los sellos, el premio, el enfriamiento, el acento y si el programa está activo, por local, y guarda. Un programa en pausa deja de sellar; la tarjeta dice "This card is paused" (o su traducción según el idioma del navegador).
2. **Rotate QR** invalida de una vez todos los QR de registro impresos; las tarjetas ya emitidas siguen funcionando.
3. **Print poster** da una hoja A4 con el QR de registro. **Print table cards** da cuatro por hoja A4, cada una en una celda de 90 x 130 mm (dos de las tarjetas de 148 x 105 mm planeadas al principio no caben en el ancho imprimible de un A4). Las dos se abren sin el marco de la app, listas para el diálogo de impresión del navegador.
4. **Activity** (`/loyalty/activity`) muestra la banda de resumen (tarjetas emitidas, tarjetas activas, sellos, premios ganados y canjeados, frente a la ventana anterior) y una tabla de sellos, premios y tarjetas, con filtros de rango, local y tipo.

## Configurar el programa

Un programa por local. Los campos y sus límites:

| Campo | Regla |
| --- | --- |
| Sellos necesarios | 2 a 20, por defecto 8 |
| Premio | Texto de 1 a 80 caracteres |
| Enfriamiento | 0 a 1440 minutos entre dos sellos de una tarjeta, por defecto 240 (4 horas) |
| Acento | Uno de `lime`, `clay`, `charcoal`, `sage` (todavía sin subir logo) |
| Activo | Un programa en pausa sigue respondiendo, con `state: "paused"`, y no se puede sellar |

Configurar el programa requiere el permiso `loyalty:manage`: el admin de la agencia y el account manager (lo configuran, no están en el local) y el dueño del cliente. Toda la función es la función `retention` del paquete: un cliente donde está bloqueada recibe `403 feature_locked` en cada ruta del personal (`/api/loyalty/*` y `/api/insights/loyalty`). Las rutas públicas de registro y de la tarjeta siguen abiertas.

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

Un sello o un canje lleva un `locationId` obligatorio, el `code` corto (8 caracteres, mostrado `XXXX-XXXX`) o el `cardToken` (el token secreto de la tarjeta, que el QR nunca contiene), y una `idempotencyKey`. Enviar la misma clave dos veces es un solo sello. Reglas que un sello debe cumplir:

- el programa está activo y la tarjeta abierta;
- pasó el enfriamiento: justo el enfriamiento después del último sello se permite, un segundo antes se rechaza con `409 refused` y la hora para reintentar;
- un local fuera del alcance del usuario responde el mismo "no encontrado" que un código desconocido.

Cuando cae el último sello, la tarjeta gana un premio en la misma transacción. La respuesta del sello informa entonces `stampsInCycle` igual a los sellos requeridos, mientras la vista de la tarjeta muestra 0 y `rewardReady: true`. Canjear se permite con el programa en pausa y con la tarjeta cerrada, así un premio ya ganado nunca se pierde.

Un void cancela el último sello que no fue anulado y nunca borra nada. Un sello que ganó un premio no se puede anular en esta versión.

## Qué ve el dueño

- `GET /api/insights/loyalty?range=7d|30d|90d&place=` devuelve las cifras de la banda: tarjetas emitidas, tarjetas activas, sellos, premios ganados y premios canjeados, con el cambio frente a la ventana anterior.
- `GET /api/loyalty/activity` lista sellos, premios y tarjetas con paginación en el servidor, un filtro `kind` y el mismo rango y local.

La página Activity de Platform y de Manager muestra ambas, ver [Usarla](#usarla).

## El lado del guest

Las rutas públicas no necesitan sesión, y el token de la tarjeta en la ruta es el único secreto. Nada de lo que devuelven contiene un guest ni un email.

| Ruta | Propósito |
| --- | --- |
| `POST /v1/loyalty/cards` | Registrarse con un `joinToken`. Devuelve una sola vez el token de la tarjeta y el código corto, y pone la cookie del dispositivo. |
| `GET /v1/loyalty/cards/:token` | La tarjeta: marca, premio, sellos, `rewardReady`, `state`. Soporta `ETag` e `If-None-Match` (un 304 no lleva cuerpo). |
| `POST /v1/loyalty/cards/:token/email` | El opt-in opcional: `{ email, consent: true }`. Responde 204. |

Errores de registro: `410 invalid` para un token malo, rotado o ajeno y `410 paused` para un programa en pausa, `409 device_limit` cuando el dispositivo ya tiene una tarjeta, y `429` con `Retry-After` al pasar un límite.

Un programa en pausa, un local suspendido o una tarjeta cerrada responde 200 con `state: "paused"` o `"closed"`. Un token desconocido o mal formado es 404. La cookie del dispositivo es `HttpOnly`, `SameSite=Lax`, con el `Path` reescrito a `/loyalty-api` por la app de la tarjeta (ver abajo), y `Secure` cuando la petición es https, cuando un proxy de confianza dice que lo fue, cuando `QR_CARD_URL` empieza con `https://`, o en producción.

## Cómo la app de la tarjeta llega a la API

El navegador nunca llama a la API directamente. La app de la tarjeta tiene un route handler del mismo origen en `/loyalty-api/*` que reenvía las tres rutas de la tarjeta (`POST /cards`, `GET /cards/<token>`, `POST /cards/<token>/email`) a `<API_URL>/v1/loyalty/...`, y nada más. Es un route handler y no un rewrite de Next porque un rewrite conserva el `X-Forwarded-For` que escribió el cliente.

- **Reescribe las cabeceras en lugar de pasarlas.** La petición a la API se construye desde una lista permitida (`content-type`, `accept`, `accept-language`, `if-none-match` y la cookie del dispositivo), nunca se copia. Lleva como mucho un `X-Forwarded-For`, la dirección del cliente que el handler calculó por su cuenta; lo que el cliente envió se descarta. `X-Forwarded-Proto` solo se pasa cuando se cuenta un proxy de confianza.
- **La dirección del cliente** es la entrada que está `QR_CARD_PROXY_HOPS` lugares desde la derecha del `X-Forwarded-For` que añadieron los proxies de delante. Con `QR_CARD_PROXY_HOPS=0` (el valor por defecto) el handler no envía dirección y la API cuenta el socket de la propia app de la tarjeta: todos los guests comparten los mismos límites. En producción pon el número de proxies que corres delante de qr-card. qr-card debe ser alcanzable solo a través de esos proxies, o un cliente podría escribir la entrada que se cuenta. Una entrada que no sea una dirección IP sola (por ejemplo una con puerto) se descarta, y la API vuelve al socket.
- **El cuerpo tiene un tope de 8 KiB** mientras llega por streaming; uno mayor se responde `413` y el resto nunca se lee.
- **La cookie del dispositivo** `atr_card_dev` pasa en ambos sentidos, y su `Path` se reescribe a `/loyalty-api` para que el navegador la envíe solo a esa ruta. Toda respuesta lleva `Cache-Control: no-store`; `ETag` y `Retry-After` pasan.
- **La API decide si cree la dirección.** `TRUST_PROXY` por sí solo no basta. Para las rutas de lealtad la API confía en `X-Forwarded-For` y `X-Forwarded-Proto` solo cuando `TRUST_PROXY` está activo, `LOYALTY_PROXY_SECRET` tiene 32 caracteres o más y la petición lleva el mismo valor en la cabecera `x-atrium-proxy` (comparado en tiempo constante). El handler añade esa cabecera desde su propia copia del secreto. Si no, la API usa la dirección del socket e ignora `X-Forwarded-Proto` también para la cookie `Secure`: falla cerrado, y la API registra una advertencia al arrancar si `TRUST_PROXY` está activo sin un secreto utilizable.
- **Pendiente conocido.** `apps/api/src/onboarding.ts` todavía confía en `X-Forwarded-For` sin esta compuerta. Es anterior a las rutas de lealtad y queda fuera de ellas.

## Los límites

Los contadores viven en Postgres y un límite responde `429` con `Retry-After`.

| Límite | Valor |
| --- | --- |
| Intentos de registro por dirección IP | 20 por hora |
| Tarjetas por dispositivo y programa | 1 por 24 horas móviles |
| Tarjetas nuevas por programa, quien sea que se registre | 200 por hora |
| Lecturas por token de tarjeta | 120 por minuto |
| Intentos de sellar por usuario del personal | 10 por minuto |
| Intentos de canjear por usuario del personal | 10 por minuto, un cupo aparte del de sellar |
| Opt-in de email por token de tarjeta | 120 por minuto |
| Opt-in de email por dirección IP | 20 por hora |

Dos consecuencias a conocer antes de un lanzamiento: el WiFi compartido de un local comparte las 20 altas por IP por hora, y las 200 tarjetas por programa por hora las puede agotar alguien que abuse del QR del póster. El límite por dispositivo es antiabuso, no de integridad: dos registros en el mismo instante pueden saltárselo.

## Ajustes

| Variable | Efecto |
| --- | --- |
| `LOYALTY_SECRET` | Firma los tokens de registro y hashea la cookie del dispositivo. Al menos 32 caracteres. Sin ella, o con una más corta, las rutas de lealtad no se montan. |
| `TRUST_PROXY` | Poner `1` o `true` cuando la app de la tarjeta (o un proxy que controlas) está delante de la API. Por sí solo no cambia nada en las rutas de lealtad: también necesita `LOYALTY_PROXY_SECRET`. |
| `LOYALTY_PROXY_SECRET` | 32 caracteres o más, el mismo valor para la API y qr-card. La API cree `X-Forwarded-For` en una ruta de lealtad solo con `TRUST_PROXY` y una cabecera `x-atrium-proxy` que coincida. |
| `QR_CARD_PROXY_HOPS` | Lo lee qr-card. Cuántos proxies de confianza hay delante de él en producción. `0` por defecto. |
| `API_URL` | También lo lee qr-card: a dónde reenvía `/loyalty-api`. Por defecto `http://localhost:3001`. |
| `QR_CARD_URL` | Origen público de la app de la tarjeta, usado en la URL de registro imprimible. Por defecto en desarrollo: `http://localhost:3006`. |

## Probarlo en local

`bun run seed:loyalty` (solo desarrollo) da a cada local demo un programa activo e imprime la URL de registro de cada uno. Levanta la base de datos, la API y la app de la tarjeta con la guía de [desarrollo local](./local-development), abre una URL de registro impresa en una ventana del tamaño de un teléfono, entra a Platform como `demo-owner@demo.test` y sella la tarjeta desde **Retention**.

## Lo que todavía no está

- Pases de wallet y avisos de wallet (entrega D).
- Segmentos de guests, automatizaciones, campañas y el ciclo de vida (entrega C). El opt-in de email no está verificado: quien tenga un token de tarjeta puede asociar un email conocido, y un email de confirmación (doble opt-in) llega con la entrega C.
- Un logo en la tarjeta (necesita almacenamiento de archivos), varias tarjetas por local, tiers.
- Un web manifest para la tarjeta: un acceso directo en la pantalla de inicio funciona desde la URL `/c/<token>`, pero no es una app instalable.
- La herramienta de agente `crm.get_loyalty_card` existe pero no está registrada en el servicio de agentes hasta que el agente de CRM tenga su manifiesto.
