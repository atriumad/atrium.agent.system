---
sidebar_position: 1
title: "Módulos"
description: "Los módulos del sistema y su estado."
---

# Módulos del *sistema*

Cada módulo sigue la [forma estándar](../architecture/repository): dominio puro, casos de uso, infraestructura, rutas, consumidores de eventos y herramientas MCP.

| Módulo | Engine y agentes | Qué hace | Fase | Estado |
| --- | --- | --- | --- | --- |
| [Core](./core) | — | Auth, clients, locations, roles, paquetes, guests, consentimientos, cola de eventos, aprobaciones, auditoría | F0 | Por construir |
| [Signals](./signals) | Maître | La API de ingesta, signals, métricas, benchmarks, grades y scores | F0–F1 | Por construir |
| [Discoverability](./discoverability) | Concierge | Setup readiness, sincronización de listings, el hub y la salud del sitio | F2 | Por construir |
| [Content](./content) | Herald | Registro de elements, pipeline de contenido, calendario y aprobaciones | F3 | Por construir |
| [Ops](./ops) | — | Tareas, el COG, ciclos y daily entry | F3 | Por construir |
| [Reputation](./reputation) | Host | Reseñas, respuestas, el flujo de encuestas, casos de recuperación | F2–F4 | Por construir |
| [CRM](./crm) | Sommelier | Guestbook, segmentos, automatizaciones, campañas, lealtad | F4 | Por construir |
| [Growth](./growth) | Steward | Programas, ofertas, campañas, atribución | F4 | Por construir |
| [Reports](./reports) | Maître | Report builder, narrativa, archivo | F6 | Por construir |
| [Booker](./booker) | Host | Reservas propias por ritmo de cubiertos | Diferido | Diferido |
