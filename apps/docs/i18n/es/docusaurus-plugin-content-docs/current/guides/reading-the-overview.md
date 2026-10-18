---
sidebar_position: 3.6
title: "Leer el Overview"
description: "Qué responde cada página Overview, cómo se define cada cifra y qué todavía no está."
---

# Leer el *Overview*

La Platform y el Manager abren cada una en un Overview. Comparten las mismas piezas (una cifra con su cambio y su tendencia, un gráfico de tendencia, barras ordenadas, una cola) y leen los mismos datos: respuestas, casos, review requests, aprobaciones y lugares. Nada está precalculado; cada cifra se lee de la base de datos al cargar la página.

| App | Quién | La pregunta que responde |
| --- | --- | --- |
| Platform | El dueño de un cliente | ¿Cómo va mi negocio y qué me necesita? |
| Manager | Un account manager o el staff de la agencia | ¿Qué hay en mi cartera que necesita a una persona ahora? |

Los datos vienen de `GET /api/insights/owner` y `GET /api/insights/agency`. La primera pide una sesión de cliente; la segunda, una sesión de agencia (un rol de agencia o un account manager asignado). Cualquier otra persona recibe un 403. La seguridad por filas decide qué lugares y clientes ve cada persona, así que solo recibe sus propios números.

## Rango y lugar

Las dos páginas tienen un rango (`7D`, `30D`, `90D`) y un selector: **Place** en la Platform, **Client** en el Manager. Por defecto es `30D` y todos los lugares o todos los clientes.

Las dos elecciones viven en la dirección (`?range=30d&place=<id>` en la Platform, `?range=30d&client=<id>` en el Manager). Un enlace se puede compartir y el botón de atrás funciona. Un lugar o cliente fuera del alcance de la persona no encuentra nada.

Cada cifra se compara con la ventana inmediatamente anterior, de la misma duración: 30D se compara con los 30 días previos.

Los días son los días calendario locales de cada lugar, según `core.locations.time_zone`. Una ventana son los últimos N días locales de ese lugar, hasta hoy. Cuando la página suma varios lugares, suma por fecha local, así que un punto del gráfico es una fecha de calendario, no un instante. "Updated" al pie de la página muestra la hora en la zona horaria del navegador de quien mira.

## La regla de muestra pequeña

Una cifra con pocas respuestas no dice nada, así que no se disfraza de tendencia. La regla vive en una sola función y la usan todas las fichas y tablas.

- Con menos de **10 respuestas** en la ventana, una ficha muestra "Too few answers (n)" en lugar de un cambio o una tendencia, y una celda de tabla muestra un guion. El gráfico de rating de la Platform queda vacío.
- Un **cambio** necesita además 10 respuestas en la ventana anterior. Sin ellas el cambio es un guion, aunque la ventana actual alcance.
- En las tasas, el conteo que debe llegar a 10 es el denominador: las respuestas para la tasa de clics del enlace de reseña, las solicitudes enviadas para la tasa de respuesta, los casos abiertos para el tiempo a contacto.

## Definiciones

**Average rating (rating promedio).** La media de las estrellas de las respuestas creadas en la ventana.

**Portfolio rating (rating de la cartera).** La media sobre todas las respuestas de todos los clientes, así que está ponderada por respuestas. No es la media de las medias de los clientes: un cliente con 200 respuestas pesa más que uno con 12.

**Cambio.** Esta ventana menos la anterior. Se escribe en tres unidades, y la flecha va acompañada de una palabra ("up", "down", "no change") para que nunca dependa solo del color:

- **Puntos de rating**, para un rating (`0.2 pts` es un quinto de estrella).
- **Puntos porcentuales**, para una tasa (la tasa de respuesta pasando de 40% a 50% es `10 pts`).
- **Porcentaje**, para un conteo (las respuestas de esta ventana contra la anterior).

Si subir es bueno depende de la cifra. Más casos vencidos es malo, así que cuando sube se muestra en clay.

**Responses (respuestas).** El número de respuestas creadas en la ventana. Su cambio es en porcentaje.

**Answer rate (tasa de respuesta).** De las review requests enviadas en la ventana (estado `sent`), la parte cuya invitación usó una respuesta. Las programadas y las omitidas no cuentan. En la Platform aparece como nota bajo Responses ("N% of M requests answered"); en el Manager es una ficha.

**Tasa de clics del enlace de reseña.** Las respuestas con un clic registrado en el enlace de reseña, divididas entre **todas** las respuestas de la ventana. No se divide entre los invitados contentos: el Hub ofrece el enlace de reseña a cada persona que responde, sea cual sea su rating, así que la base honesta es cada respuesta. La ficha de la Platform muestra el conteo de clics, con la tasa como nota.

**Tiempo a contacto.** Para los casos abiertos en la ventana, el tiempo entre la apertura y el primer contacto. La ficha muestra la **mediana** de los casos ya contactados, la meta (24 horas) y la **parte dentro de la meta**. Un caso cuenta como dentro de la meta si se contactó antes de su hora límite. Un caso aún sin contactar cuenta como fuera de la meta solo cuando pasó su hora límite; antes no se juzga. El cambio es en horas ("faster" o "slower").

**Vencido y por vencer (Overdue y Due).** Un caso está *vencido* cuando está abierto y su hora límite ya pasó. Está *por vencer* cuando está abierto y vence en las próximas 24 horas. Un caso ya contactado o resuelto no es ninguno. La ficha "Overdue cases" del Manager muestra la cuenta de ahora y, como nota, cuántos estaban vencidos una ventana atrás. No hay historial de estados, así que ese número anterior se reconstruye con las marcas de tiempo y es una estimación.

**Waiting on you (esperando por ti).** (Platform) Los casos abiertos del cliente y cuántos pasaron la meta de 24 horas.

**What guests mention (lo que mencionan los invitados).** (Platform) Cada respuesta lleva un sentimiento y una lista de temas. El sentimiento de un tema es el sentimiento de las respuestas que lo mencionan: "Wait time: 72% negative" significa que 72% de las respuestas que mencionan el tiempo de espera se leyeron como negativas. Una respuesta que menciona dos temas cuenta una vez en cada uno. El grupo neutral reúne todo lo que no es positivo ni negativo, `mixed` incluido. El bloque muestra los cinco temas más mencionados.

**What Host did (lo que hizo Host).** (Platform) Tres conteos de la ventana: solicitudes enviadas, casos abiertos (todo caso lo abre el sistema) y respuestas leídas, es decir, respuestas marcadas como leídas.

## El Overview de la Platform

De arriba abajo:

1. **Cuatro fichas.** Average rating, Responses, Review link clicks y Waiting on you. Waiting on you es el bloque lima.
2. **Rating over time** y **What guests mention**, lado a lado.
3. **Your places** y **What Host did**.

**Your places** lista cada lugar con su rating y cambio, respuestas y casos abiertos (con cuántos están vencidos). Va ordenada por lo que pide atención: primero los lugares con más casos vencidos, luego el rating más bajo, luego el nombre. Un lugar con menos de 10 respuestas muestra un guion en el rating.

## El Overview del Manager

De arriba abajo:

1. **Needs a person now**, la cola.
2. **Cuatro fichas.** Median time to contact, Overdue cases, Portfolio rating y Request → answer rate.
3. **Your clients**, una fila por cliente.

**La cola** tiene cuatro tipos de elemento:

| Tipo | Qué es | Abre |
| --- | --- | --- |
| Case | Un caso abierto, vencido o por vencer en 24 horas | `/reputation/cases` |
| Approval | Una solicitud esperando el OK de la agencia | `/approvals/places` |
| Account | Una solicitud para unirse, aún sin revisar | `/approvals/accounts` |
| Place to activate | Un lugar esperando aprobación | `/approvals/places` |

Muestra como máximo **8 filas**: primero los casos (vencidos antes que por vencer, luego por hora límite), después aprobaciones, cuentas y lugares. Cuando hay más, un pie enlaza cada lista ("N more cases", "N more accounts", "N more places"), porque no existe una página única de cola. Las solicitudes de cuenta aún no pertenecen a ningún cliente, así que aparecen solo cuando no hay un cliente elegido, y solo para los roles que pueden gestionar lugares. Un account manager asignado no ve las solicitudes de cuenta. Cuando no hay nada que mostrar, el bloque dice "Nothing needs a person right now".

**Your clients** muestra, por cliente: rating, una línea de tendencia, cambio, respuestas, tasa de respuesta, casos vencidos y un estado. El estado es uno de:

- `Needs a person`: el cliente tiene al menos un caso vencido.
- `Setting up`: algún lugar del cliente sigue pendiente.
- `Healthy`: ninguno de los dos.

Los clientes van ordenados por más casos vencidos, luego por nombre. Un cliente con menos de 10 respuestas muestra un guion en el rating y "Too few answers" en lugar de la tendencia.

## A dónde lleva cada bloque

Cada ficha y bloque abre la página que lo explica, con el rango y el lugar o cliente en la dirección.

| Bloque | Abre |
| --- | --- |
| Platform: Average rating, Responses, Review link clicks | `/reputation/responses?range=…&place=…` |
| Platform: Waiting on you | `/reputation/cases`, o `/reputation/cases?status=overdue` cuando hay algo vencido |
| Platform: un tema | Responses con `&topic=<topic>` |
| Platform: un lugar | Responses de ese lugar |
| Manager: Median time to contact | `/reputation/cases` |
| Manager: Overdue cases | `/reputation/cases?status=overdue` |
| Manager: Portfolio rating, Request → answer rate | `/reputation/responses?range=…&client=…` |
| Manager: una fila de la cola | El caso, aprobación, cuenta o lugar del que trata |

Las páginas Cases y Responses respetan solo los filtros que tienen hoy e ignoran el resto. El enlace igual llega a la página correcta.

## Cuando la página no puede mostrar un número

- **No reading yet.** El bloque "What guests mention" dice "No reading yet for these answers" cuando ninguna respuesta de la ventana tiene sentimiento o temas. La lectura de Sentiment viene del servicio de agentes, así que falta cuando ese servicio está apagado o aún no leyó las respuestas. El resto de la página no depende de ella. Cuando se leyeron respuestas pero ninguna mencionó un tema, el bloque dice "No topics came up in this period".
- **No data yet.** Una ficha sin respuestas en la ventana lo dice y muestra un guion.
- **Could not load.** Si la solicitud falla, la página muestra "Could not load the overview" y un botón Retry.

## Historial de demo

La base de datos demo tiene un puñado de respuestas, muy poco para ver un gráfico. `bun run seed:history` agrega encima 90 días de historial creíble: tres clientes demo más, cuatro lugares en cuatro zonas horarias, respuestas, review requests y casos, con una subida lenta, una caída en un lugar, un tema mayormente negativo, un cliente con menos de 10 respuestas y un caso vencido.

- Es determinista: los mismos datos cada vez.
- Es idempotente: un cliente que ya tiene respuestas se omite, así que una segunda ejecución no agrega nada.
- Es solo para desarrollo. No toca al cliente demo existente ni el `seed` por defecto. Corre antes `bun run db:migrate` (y normalmente `bun run seed`).
- Al final imprime los logins demo. El acceso es el que imprime el seed, con los emails demo que lista.

## Lo que todavía no está

- Métricas de signals (impresiones, llamadas, pedidos), puntajes de engine, el Growth Score y el benchmark contra el radio de 10 millas. Ninguna fuente las alimenta en estas páginas todavía.
- Rangos de fechas personalizados. Solo 7, 30 y 90 días.
- Exportación, reportes programados y vistas guardadas.
- Un feed de eventos de lo que hizo Host. Hoy son tres conteos.
- Actualización en vivo. La página carga una vez; recarga para refrescar.
