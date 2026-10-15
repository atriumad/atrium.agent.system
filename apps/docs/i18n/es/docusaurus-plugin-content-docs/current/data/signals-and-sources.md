---
sidebar_position: 2
title: "Signals y fuentes"
description: "La fila de signal, el enum de signal types, las fuentes y su cadencia, el hub y los elements individuales."
---

# Signals y *fuentes*

Una signal es la cosa individual contada: la impresión, el toque, la orden (lo que las plataformas llaman informalmente una métrica). La granularidad mínima es el día. Las fuentes en tiempo real (hub, encuestas, webhooks) igual caen como sellos diarios; nada aguas abajo necesita más resolución. Las sumas, tendencias, tasas y comparaciones son matemática de rangos sobre filas diarias.

## La fila de signal

| Campo | Tipo | Ejemplo | Notas |
| --- | --- | --- | --- |
| `date` | date | 2026-07-10 | El sello diario. Granularidad mínima; los feeds en tiempo real se acumulan cada noche en la fila del día |
| `location_id` | uuid | — | Toda signal pertenece a un local de un client |
| `source` | enum | `metricool` | `metricool` \| `gbp` \| `landing` \| `site` \| `toast` \| `meta_ads` \| `google_ads` \| `survey` \| `review` \| `manual` \| `agent` |
| `platform` | enum? | `instagram` | `instagram` \| `facebook` \| `tiktok` \| `youtube` \| `google` \| `meta`. Nulo cuando la fuente no se divide por plataforma |
| `element_id` | string? | `reel_0712_pastor` | Presente cuando la signal pertenece a un element individual |
| `signal_type` | enum | `video_view` | snake_case canónico del enum de abajo. Un nombre por evento, nunca sinónimos |
| `value` | number | 4820 | Un conteo o dólares. El formato es solo cosa de la vista |
| `meta` | json? | `{ "utm": "qr-tent", "zone": "bellaire", "button": "order" }` | Etiqueta de fuente, UTM, zona geográfica, botón, campaña, método de cruce (pixel, teléfono, tarjeta) |
| `guest_id` | string? | `g_88412` | Identidad unificada para que un guest cuente una sola vez entre fuentes |

## `signal_type`: el enum completo

Canónico, snake_case, agrupado por etapa del funnel. Los tipos nuevos se agregan aquí antes de publicarse.

| Etapa | Signal types |
| --- | --- |
| **Awareness** | `impression`, `reach_account`, `video_view`, `follower_add`, `discovery_search` |
| **Consideration** | `engagement` (like, comentario, compartido), `save`, `profile_visit`, `session`, `menu_view`, `link_click`, `email_open`, `email_click`, `direct_search` |
| **Buying intent** | `direction`, `call`, `order_click`, `reserve_click`, `rsvp`, `qr_scan` |
| **Outcome** | `order`, `reservation`, `redemption`, `lead`, `loyalty_signup`, `repeat_visit`, `winback_visit`, `revenue` |
| **Salud y operación** | `review`, `review_reply`, `survey_score`, `rating_point`, `rank_point`, `opt_in`, `opt_out`, `spend`, `agent_grade` |

## Fuentes y cadencia

Cada fuente emite métricas generales de la propia fuente; algunas además contienen elements individuales cuyas signals se atribuyen a ese element y suben a los totales de la fuente.

| Fuente | Qué emite | Cadencia | ¿A nivel de element? |
| --- | --- | --- | --- |
| Metricool · redes | El set estándar social de IG, FB, TikTok y YouTube: impresiones, alcance, video views, seguidores, engagements, visitas al perfil, clics en links, más filas por post | cada 6 h | Sí: posts, reels, stories |
| Google Business | Visitas al perfil, búsquedas discovery y directas, GBP actions, indicaciones, llamadas, vistas de fotos, reseñas, posición en Maps | diaria | No: solo general |
| Atrium Landing · hub | Sesiones del hub y cada toque de botón (pedir, reservar, indicaciones, llamar, menú, su sitio), etiquetados con fuente y botón | tiempo real → diaria | Sí: cada botón |
| Su sitio web | Sesiones, vistas del menú, clics en pedir y reservar vía pixel, rastreados junto al hub | tiempo real → diaria | No: solo general |
| Toast POS | Órdenes, revenue, guests, ticket medio, visitas repetidas, miembros de lealtad, redenciones. El sistema de registro de los outcomes | cada 4 h | No: los outcomes se atribuyen hacia atrás |
| Resend · email | Envíos, entregas, rebotes, quejas, altas y bajas, ventana de revenue atribuido (14 d) | 4 h + webhooks | Sí: cada campaña o automatización |
| Meta Ads | Gasto, impresiones y alcance pagos, clics, conversiones (órdenes, reservas, leads, RSVPs), CPM y CPC | diaria | Sí: campaña y ad set |
| Google Ads | Gasto, impresiones de ads de búsqueda y Maps, clics, conversiones, costo por acción | diaria | Sí: campaña |
| Survey Flow | Notas post-orden, altas por QR; alimenta Reputation y la lista de guests | tiempo real → diaria | Sí: cada encuesta |
| Plataformas de reseñas | Reseñas nuevas, puntos de rating, respuestas y demora de respuesta en Google, Yelp y otras | diaria | No: las reseñas son signals |
| Registro manual | Órdenes, leads de catering y RSVPs que el Account Manager carga a mano. Misma tabla, `source = manual`, con sello de hora | registro diario | Opcional |

Dos fuentes aparecen en la Platform pero todavía no en el inventario de fuentes, y se especifican como planificadas: la **encuesta de marca trimestral** (awareness espontáneo por zona) y el **seguimiento de competidores** (share of voice, estimado a partir del alcance y engagement local rastreados). Están en [Decisiones abiertas](../plan/open-decisions).

## El hub

Un link en todas partes: un linktree para el restaurante y la fuente de verdad del lado del sitio. Vive en cada bio, código QR, perfil de GBP y ad. Cada toque de botón registra una signal con la fuente y el botón en `meta`. La sesión es **consideration**; el toque es **buying intent**. Los botones son elements: cada uno tiene sus propios toques, división por fuente y conversión. El sitio propio del restaurante se rastrea a la par con pixel; juntos son la fuente de verdad del lado del sitio.

| Botón | Etapa |
| --- | --- |
| Pedir online, Reservar mesa, Indicaciones, Llamar | Buying intent |
| Menú, Su sitio | Consideration |

## Sets estándar de métricas por plataforma

La misma métrica tiene el mismo nombre en cada plataforma; las redes comparten un set estándar.

| Plataforma | Métricas | Feed | Sync |
| --- | --- | --- | --- |
| Instagram | Followers, Reach, Impressions, Video views, Engagement rate, Saves, Profile visits, Link clicks | Metricool | cada 6 h |
| Facebook | Followers, Reach, Impressions, Engagement rate, Link clicks | Metricool | cada 6 h |
| TikTok | Followers, Reach, Video views, Engagement rate, Shares | Metricool | cada 6 h |
| YouTube | Subscribers, Views, Impressions, Watch time | Metricool | cada 6 h |
| Google Business | Profile visits, Discovery searches, Direct searches, Directions, Calls, Link clicks, Photo views, Maps rank | API de GBP | diaria |
| Atrium Landing | Sessions, Order clicks, Reservation clicks, Directions, Calls, Menu views, Source split (UTM) | first-party | tiempo real |
| Meta / Google Ads | Spend, Impressions, Reach, Clicks, CPM, CPC, CTR, Conversions, ROAS | API de Ads | diaria |
| Plataformas de reseñas | Rating, Review count, New per month, Response rate, 5-star share | GBP + scrape | diaria |

## Elements individuales

Las signals de un element llevan su `element_id`, así que el desempeño se atribuye a esa pieza específica, y las mismas filas suben a las métricas generales de la fuente. El tipo de element determina exactamente qué campos de signal genera, idénticos donde sea que aparezca. Las fuentes también guardan métricas generales que no pertenecen a ningún element (seguidores, visitas al perfil, rating).

| Element | Fuente | Campos |
| --- | --- | --- |
| Reel | Metricool | Views, Reach, Saves, Shares, Comments, Link clicks |
| Feed post | Metricool | Reach, Likes, Saves, Comments |
| Story | Metricool | Views, Taps forward, Replies, Exits |
| Carousel | Metricool | Reach, Saves, Link clicks |
| Email | Resend | Sent, Open rate, Click rate, Revenue (14 d) |
| Meta ad | Meta | Spend, Impressions, Reach, Clicks, CPM, Leads, ROAS |
| Google ad | Google | Spend, Impressions, Clicks, CPC, Conversions |
| Offer | Toast + hub | Redemptions, Estimated sales, Channels live, Status |
| Hub button | Landing | Taps, Source split, Conversion to outcome |

:::tip Lo creativo primero
Atrium es una agencia creativa antes que un dashboard: el contenido es el element. Cada post, reel y email lleva sus propias signals, así que el impacto creativo es atribuible: qué pieza ganó las impresiones, las visitas al perfil, las órdenes. Los rollups por element alimentan las tarjetas de Wins y los top drivers de la Platform, y los agentes califican la calidad del hook y la cohesión del feed dentro del practice score de Acquisition.
:::
