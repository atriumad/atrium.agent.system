---
sidebar_position: 3
title: "Métricas y scoring"
description: "Etapas del funnel, vocabulario, el inventario de métricas por engine, scores de engine, benchmarks y calificación de práctica."
---

# Métricas y *scoring*

Una signal es el evento individual contado; una métrica son signals calculadas sobre un período (sum, avg, rate o latest) y puede mostrarse como total, tendencia, proporción o comparación contra un benchmark. "Impresiones" la signal se vuelve "Impresiones · 30 días" la métrica. El inventario de abajo es la lista de construcción: todo número que muestre una pantalla debe resolver a una de estas filas.

## Etapas del funnel

Cada métrica corresponde a exactamente una etapa del funnel, guardada como `funnel_stage`: `awareness`, `consideration`, `buying_intent`, `outcome` o `none`. Los datos se estructuran primero por etapa y después por plataforma. Los outcomes (órdenes, reservas, leads) son su propio grupo aguas abajo del buying intent; `none` es para números de salud que viven fuera del funnel (rating, gasto, posición).

| Etapa | Pregunta | Métrica principal | También |
| --- | --- | --- | --- |
| **Awareness** | ¿La ciudad te vio? | Impressions | Reach, Video views, Followers, Discovery searches |
| **Consideration** | ¿Se acercaron a mirar? | Engagements | Engagement rate, Profile visits, Sessions, Link clicks, Saves, Menu views |
| **Buying intent** | ¿Están listos para actuar? | Intent actions (suma) | Directions, Calls, Order clicks, Reserve clicks, RSVPs, QR scans. Se convierte en outcomes: órdenes, reservas, leads, RSVPs, redenciones |

## Un solo nombre por métrica

Etiqueta canónica a la izquierda; los sinónimos no se publican nunca.

| Se usa | No |
| --- | --- |
| Impressions | views servidas |
| Reach | cuentas o personas alcanzadas |
| Video views | views de stories o reels |
| Engagements | interacciones |
| Engagement rate | ER, tasa de interacción |
| Profile visits | vistas de perfil |
| Sessions | sesiones del sitio, visitas |
| Link clicks | clics al sitio, toques en la bio |
| GBP actions | acciones de Google |
| Directions | solicitudes de indicaciones, toques de indicaciones |
| Calls | llamadas telefónicas, toques de llamada |
| Orders | órdenes (est.) |

## La fila de métrica

| Campo | Tipo | Ejemplo | Notas |
| --- | --- | --- | --- |
| `id` | string | `impressions_total` | snake_case, estable, único |
| `label` | string | Impressions | Nombre canónico del vocabulario, en Title Case |
| `unit` | enum | `count` | `count` \| `%` \| `$` \| `rating` \| `rank` \| `ratio` \| `hours` |
| `formula` | string | `sum(impression)` | `sum` \| `avg` \| `rate(a÷b)` \| `latest`, sobre filas de signal en el rango |
| `funnel_stage` | enum | `awareness` | `awareness` \| `consideration` \| `buying_intent` \| `outcome` \| `none` |
| `engine` | enum | `acquisition` | En cuál de los 5 suma |
| `cadence` | enum | `daily` | Cada cuánto se refresca el rollup: `realtime` \| `hourly` \| `daily` \| `monthly` |
| `benchmark` | number? | 152000 | Promedio del radio de 10 millas, mensual, nulable |
| `prior` | number? | 312000 | Ventana anterior de la misma duración, para los deltas |
| `element_scope` | bool | true | Si la métrica también existe por element (views de un reel) o solo en general (seguidores) |

## Inventario de métricas por engine

### Discoverability

| Métrica | Unidad | Etapa | Fórmula | Alimentada por |
| --- | --- | --- | --- | --- |
| Discovery searches | count | awareness | `sum(discovery_search)` | GBP |
| Direct searches | count | consideration | `sum(direct_search)` | GBP |
| Profile visits · GBP | count | consideration | `sum(profile_visit, source=gbp)` | GBP |
| GBP actions | count | consideration | `sum(direction + call + link_click, source=gbp)` | GBP |
| Directions | count | buying intent | `sum(direction)` | GBP + hub |
| Calls | count | buying intent | `sum(call)` | GBP + hub |
| Maps rank | rank | none | `latest(rank_point)` | Rank tracker |
| Listings synced | count | none | `count(listings, status=synced)` | Auditoría de listings |

### Acquisition

| Métrica | Unidad | Etapa | Fórmula | Alimentada por |
| --- | --- | --- | --- | --- |
| Impressions | count | awareness | `sum(impression)` | Metricool + ads |
| Reach | count | awareness | `sum(reach_account)` | Metricool |
| Video views | count | awareness | `sum(video_view)` | Metricool |
| Followers | count | awareness | `latest(follower_add, cumulative)` | Metricool |
| Engagements | count | consideration | `sum(engagement + save)` | Metricool |
| Engagement rate | % | consideration | `engagements ÷ reach` | Construida |
| Profile visits | count | consideration | `sum(profile_visit)` | Metricool |
| Sessions | count | consideration | `sum(session, source=landing\|site)` | Hub + pixel |
| Link clicks | count | consideration | `sum(link_click)` | Metricool + hub |
| Intent actions | count | buying intent | `sum(direction + call + order_click + reserve_click)` | Hub + GBP |
| Content published | count | none | `count(elements, type=social, published in range)` | Registro de elements |
| Top-content views | count | awareness | `sum(video_view + impression, top elements)` | Rollup de elements |

### Reputation

| Métrica | Unidad | Etapa | Fórmula | Alimentada por |
| --- | --- | --- | --- | --- |
| Google rating | rating | none | `latest(rating_point)` | GBP |
| New reviews | count | none | `sum(review)` | GBP + plataformas |
| Response rate | % | none | `review_reply ÷ review` | GBP |
| Reply time | hours | none | `avg(reply_delay)` | GBP |
| 5-star share | % | none | `reseñas 5★ ÷ reseñas` | GBP + plataformas |
| Review-request conversion | % | none | `review ÷ request sent` | Survey Flow |
| Survey score | rating | none | `avg(survey_score)` | Survey Flow |

### Retention

| Métrica | Unidad | Etapa | Fórmula | Alimentada por |
| --- | --- | --- | --- | --- |
| Repeat guest rate | % | outcome | `guests con repeat_visit ÷ guests` | Toast |
| Loyalty members | count | none | `latest(loyalty_signup, cumulative)` | Toast |
| Open rate | % | consideration | `email_open ÷ sent` | Aún sin medir; más adelante, con marketing y CRM |
| Click rate | % | consideration | `email_click ÷ sent` | Aún sin medir; más adelante, con marketing y CRM |
| Redemptions | count | outcome | `sum(redemption)` | Toast + Resend |
| Win-back returns | count | outcome | `sum(winback_visit)` | Cruce con Toast |
| Email revenue | $ | outcome | `sum(revenue, window 14d)` | Cruce con Toast |
| Opt-outs | count | none | `sum(opt_out)` | Resend |

### Growth

| Métrica | Unidad | Etapa | Fórmula | Alimentada por |
| --- | --- | --- | --- | --- |
| Spend | $ | none | `sum(spend)` | APIs de Ads |
| Paid impressions | count | awareness | `sum(impression, source=ads)` | APIs de Ads |
| Clicks | count | consideration | `sum(link_click, source=ads)` | APIs de Ads |
| Orders from ads | count | outcome | `sum(order, attributed)` | Pixel + Toast |
| Reservations from ads | count | outcome | `sum(reservation, attributed)` | Pixel |
| Matched on-premise orders | count | outcome | cruce de pixel, lealtad o tarjeta contra el POS | Estimación · construida |
| On-premise sales (est.) | $ | outcome | `órdenes cruzadas × ticket medio` | Estimación · construida |
| ROAS · per bucket | ratio | none | `ventas ÷ gasto` | Construida |
| Cost per action | $ | none | `gasto ÷ outcomes` | Construida |
| Leads | count | outcome | `sum(lead)` | Formularios de Meta |

## Scores de engine

`score = 0.6 × measured + 0.4 × practice`. **Measured** (cuantitativo): cada métrica del engine normalizada contra el benchmark de 10 millas, `min(tú ÷ bench, 2) ÷ 2 × 100`, promediada sobre las métricas del engine. **Practice** (cualitativo): criterios que ninguna API reporta, calificados de 0 a 4 por agentes de Atrium con una rúbrica fija, renovados cada semana y normalizados a 0–100. Los pesos son editables por engine.

| Engine | Lo medido, en titulares | Rúbrica de práctica |
| --- | --- | --- |
| Discoverability | GBP actions, discovery searches, posición en Maps. Preparación del setup en GBP, listings, SEO, perfiles, links y pixels: la plomería que te hace encontrable antes de gastar un dólar en alcance | Completitud del perfil, consistencia NAP, schema presente, salud del link de bio |
| Acquisition | Impressions, engagement rate, profile visits, intent actions. Awareness → consideration → buying intent | Consistencia de publicación, cohesión del feed, calidad del hook, disciplina de geo-tag |
| Reputation | Rating, velocidad, response rate, 5-star share, scores de encuesta | Velocidad de respuesta, calidad de respuesta, cadencia del pedido de reseña, manejo del sentimiento |
| Retention | Open rate, redención, repeat rate, win-back, atados al origen del opt-in | Higiene de la lista, cobertura de automatizaciones, cadencia de ofertas, profundidad de segmentación |
| Growth | Spend, ROAS por bucket, cost per action. Tres buckets always-on (on-premise estimado, órdenes online, reservas) más campañas a medida | Salud del pixel, tasa de renovación de creatividades, ritmo del presupuesto, coherencia de la landing |

El compuesto, el **Growth Score**, son los cinco scores de engine con el mismo peso (60 puntos cada uno), 0–300, comparados con la misma mezcla del radio de 10 millas.

## Benchmarks y comparaciones

Cada número se juzga de tres maneras.

| Comparación | Qué es | Se guarda como |
| --- | --- | --- |
| **vs período anterior** | Ventana de la misma duración inmediatamente antes del rango elegido. Alimenta cada delta y los sparklines de momentum | `prior`, por rango, propio |
| **vs radio de 10 millas** | Benchmark mensual por métrica, agregado de los restaurantes a 10 millas. Alimenta las marcas ámbar, los chips de oportunidad y la mitad medida de cada score | `benchmark`, mensual |
| **matemática de rangos** | 7D, 30D, 90D y personalizado son la misma operación: filtrar `signals_daily` por fecha y luego agregar | sum o avg sobre sellos diarios |
| **por local** | Cada signal lleva el local; las cuentas multi-local filtran primero y agregan después | `location_id` en cada fila |

## Quién califica la práctica

Cada criterio de práctica lo califica un agente en una escala de 0 a 4 y se escribe cada semana en `agent_grades`, con `source` igual al id del agente: el mismo contrato que cualquier otra signal. Ver [Agentes](../agents).

| Engine | Agente | Califica |
| --- | --- | --- |
| Discoverability | Concierge | Radar: escaneo nocturno de GBP y listings, avisa de desvíos de NAP, links rotos, horarios incorrectos; completitud del perfil. Schema: schema del sitio, links al menú y pixels tras cada deploy |
| Acquisition | Herald | Pulse: cadencia de publicación contra el plan, cohesión del feed (pasada de visión sobre la grilla), análisis de hooks (retención de los primeros 3 segundos) |
| Reputation | Host | Echo: velocidad y calidad de respuesta. Sentiment: agrupa temas de reseñas y encuestas. Ask: momento del pedido de reseña |
| Retention | Sommelier | Memory: higiene de la lista y profundidad de segmentación. Flows: cobertura de automatizaciones y calidad de la hora de envío |
| Growth | Steward | Pacer: ritmo del presupuesto. Refresher: fatiga y renovación de creatividades. Ledger: cobertura de atribución |
