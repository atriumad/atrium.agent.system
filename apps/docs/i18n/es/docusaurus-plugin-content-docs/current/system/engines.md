---
sidebar_position: 3
title: "Los cinco engines"
description: "Qué responde cada engine, sus servicios, signals, score y agente."
---

# Cinco engines, *una máquina*

Cada engine tiene una pregunta, una etapa del recorrido y un score. Un servicio pertenece a un solo engine: el de cuyo score mueve. Si mueve dos, gana el de la etapa más temprana.

## Discoverability

| | |
| --- | --- |
| **Lema** | Que te encuentren |
| **Pregunta** | ¿Qué tan bien armado estás? ¿La puerta digital responde cada pregunta en menos de 10 segundos? |
| **Etapas** | Stranger → Discovery |
| **Métrica norte** | GBP actions: indicaciones + llamadas + clics al sitio, 30 días |
| **Servicios** | Google Business Profile, Local SEO, Delivery Listings Admin |
| **Se mide con** | GBP actions, discovery searches, direct searches, posición en Maps, listings sincronizados |
| **Rúbrica de práctica** | Completitud del perfil, consistencia NAP, schema presente, salud del link de bio |
| **Agente** | [Concierge](../agents/concierge) |

## Acquisition

| | |
| --- | --- |
| **Lema** | Que te vean |
| **Pregunta** | ¿Cuánto de la ciudad te ve? ¿Entras en la lista mental antes de que llegue el hambre? |
| **Etapas** | Stranger → Discovery |
| **Métrica norte** | Impresiones, 30 días (secundarias: engagements, visitas al perfil, intent actions) |
| **Servicios** | Content Production, Social Media Management, Meta Awareness Ads, Google Awareness Ads, Brand Ambassadors |
| **Se mide con** | Impresiones, alcance, video views, seguidores, engagements, visitas al perfil, sesiones, clics en links, intent actions |
| **Rúbrica de práctica** | Consistencia de publicación, cohesión del feed, calidad del hook, disciplina de geo-tag |
| **Agente** | [Herald](../agents/herald) |

## Reputation

| | |
| --- | --- |
| **Lema** | Que te elijan |
| **Pregunta** | ¿Te eligen cuando comparan? |
| **Etapas** | Consideration → First Visit |
| **Métrica norte** | Rating de Google frente al promedio de 10 millas, con la velocidad de reseñas |
| **Servicios** | Reviews + Rating Improvement (generación de reseñas, respuestas en 24–48 h, recuperación privada) |
| **Se mide con** | Rating, reseñas nuevas, tasa de respuesta, tiempo de respuesta, parte de 5 estrellas, conversión del pedido de reseña, score de encuesta |
| **Rúbrica de práctica** | Velocidad de respuesta, calidad de respuesta, cadencia del pedido de reseña, manejo del sentimiento |
| **Agente** | [Host](../agents/host) |

## Retention

| | |
| --- | --- |
| **Lema** | Que vuelvan |
| **Pregunta** | ¿Vuelven, y con qué frecuencia? |
| **Etapas** | First Visit → Loyal Regular |
| **Métrica norte** | Tasa de guests recurrentes: guests con una visita repetida / guests |
| **Servicios** | CRM + Automations, Email Marketing, Loyalty & Rewards |
| **Se mide con** | Tasa de guests recurrentes, miembros de lealtad, open rate y click rate (más adelante, con marketing y CRM), redenciones, retornos por win-back, revenue de email, bajas |
| **Rúbrica de práctica** | Higiene de la lista, cobertura de automatizaciones, cadencia de ofertas, profundidad de segmentación |
| **Agente** | [Sommelier](../agents/sommelier) |

## Growth

| | |
| --- | --- |
| **Lema** | Revenue rastreado |
| **Pregunta** | ¿Qué producen los ads y las campañas? ¿Cada dólar se rastrea hasta una orden, una reserva o un cubierto? |
| **Etapas** | Consideration → Loyal Regular (el extremo del dinero de cada etapa) |
| **Métrica norte** | ROAS: ventas / gasto, por programa, con costo por acción |
| **Servicios** | Landing Pages, Campaign Content, Meta Performance, Google Performance, Event Marketing, Private Events, Catering Leads, Slow-Day Campaigns, Gift Cards, Grand Opening, Monthly Reports, 90-Day Roadmap |
| **Se mide con** | Gasto, impresiones pagas, clics, órdenes y reservas de ads, órdenes on-premise cruzadas, ventas on-premise (estimadas), ROAS, costo por acción, leads |
| **Rúbrica de práctica** | Salud del pixel, tasa de renovación de creatividades, ritmo del presupuesto, coherencia de la landing |
| **Agente** | [Steward](../agents/steward) |

## El loop

Discoverability hace al restaurante fácil de encontrar, Acquisition construye el estante mental, Reputation convierte la investigación en una primera visita, Retention convierte una primera visita en hábito y Growth apunta la audiencia y la lista a metas de revenue concretas. Los guests fieles devuelven reseñas y referidos a los tres primeros engines. Ningún engine funciona aislado: el tráfico se pierde sin reseñas que lo conviertan y las primeras visitas se pierden sin Retention.

:::note Atribución y reportes no son engines
La atribución (qué trabajo ganó a qué guest) y los reportes (la historia del mes) cruzan los cinco engines. Viven en la capa de [Datos](../data) y en los servicios de Growth, y los entrega [Maître](../agents/maitre).
:::
