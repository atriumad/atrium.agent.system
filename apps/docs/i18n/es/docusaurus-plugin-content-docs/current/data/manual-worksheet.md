---
sidebar_position: 5
title: "Hoja mensual de signals"
description: "El proceso de carga manual, una hoja por client por mes, que se mapea uno a uno con las columnas de datos."
---

# Hoja mensual de *signals*

Hasta que exista un conector para cada fuente, el Assistant Account Manager llena una hoja por client, una vez al mes. Cada número se toma del panel de insights de la propia plataforma para el último mes calendario completo, se anota y después se calculan las métricas y la matemática de revenue. Los nombres y grupos son los mismos del [modelo de datos](../data): cuando esto pase a digital, las columnas se mapean uno a uno.

**Encabezado:** client, mes, preparado por, fecha de término, ticket medio ($) y la fuente de ese ticket (POS o dueño). Si una plataforma no reporta una signal, se escribe `n/a`; nunca se deja una celda en blanco.

## A · Signals crudas por fuente

Se copia el número exactamente como lo reporta la plataforma. Δ es este mes menos el anterior; se escribe un signo menos cuando cayó.

| Fuente | Signals a recolectar (dónde encontrarlas) |
| --- | --- |
| Instagram | Impressions (Insights → Views), Reach (Accounts reached), Engagements (likes + comentarios + guardados + compartidos), Profile visits (Profile activity), Link clicks (toques al link externo), Followers a fin de mes |
| TikTok | Video views, Reach (Reached audience), Engagements (likes + comentarios + compartidos + guardados), Profile visits (Profile views), Followers a fin de mes |
| Facebook | Reach (Meta Business Suite → Insights), Engagements (reacciones + comentarios + compartidos), Page visits, Followers a fin de mes |
| Google Business Profile | Vistas del perfil desde Search, vistas del perfil desde Maps, Calls, Directions, Website clicks (todo en Performance) |
| Sitio web | Sessions (GA4 o el analytics del site builder), Reservation clicks (Reserve, OpenTable, Resy), Order clicks (Order Online) |
| Email / SMS | Sends, Opens, Link clicks (reporte de campañas del CRM, todos los vuelos), Redemptions (reporte de descuentos del POS o conteo de códigos de oferta) |
| Reseñas | Reseñas nuevas en Google, rating de Google (general), reseñas nuevas en Yelp, reseñas respondidas |
| POS | Órdenes o cubiertos, ventas brutas ($), ticket medio = bruto ÷ órdenes (se lleva al encabezado y a la sección C) |

## B · Métricas calculadas, por etapa del funnel

Las tasas se redondean a un decimal. Alimentan los scores de engine.

| Etapa | Métrica | Fórmula |
| --- | --- | --- |
| Awareness | Total reach | Reach IG + reach TikTok + reach FB |
| Awareness | Total impressions | Impressions IG + video views TikTok |
| Awareness | Local visibility | Vistas de GBP en Search + vistas en Maps |
| Consideration | Engagement rate (%) | (Engagements IG + TikTok + FB) ÷ total reach × 100 |
| Consideration | Total profile visits | Profile visits IG + TikTok + page visits FB |
| Consideration | Follower growth | Suma del Δ de seguidores de IG, TikTok y FB |
| Consideration | Email open rate (%) | Opens ÷ sends × 100 |
| Buying intent | Intent actions | Calls + directions + website clicks de GBP + reservation clicks + order clicks |
| Buying intent | Social → site rate (%) | (Link clicks de IG + link clicks de email) ÷ sessions × 100 |
| Buying intent | Intent rate (%) | Intent actions ÷ local visibility × 100 |
| Reputation | Review velocity | Reseñas nuevas de Google + Yelp en el mes |
| Reputation | Reply rate (%) | Respuestas publicadas ÷ reseñas nuevas × 100 |
| Reputation | Rating Δ | Rating de Google este mes − mes anterior |

## C · Matemática del ticket: cuánto valió el mes

Son **estimaciones de influencia, no atribución**. El supuesto de tasa de visita es que 0.30 de las intent actions se vuelven una visita; se mantiene salvo que el Account Manager fije otro para el client.

| Estimación | Cálculo |
| --- | --- |
| Visitas estimadas desde intent | Intent actions × 0.30 |
| Revenue influenciado, intent | Visitas estimadas × ticket medio |
| Revenue, ofertas de email y SMS | Redemptions × ticket medio |
| Revenue influenciado total | Revenue de intent + revenue de email y SMS |
| vs. retainer | Revenue influenciado total ÷ retainer mensual |

Las notas y alertas para el Account Manager van al final. La hoja la firma el Assistant Account Manager que la completó y el Account Manager que la revisó.
