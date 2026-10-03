---
sidebar_position: 5
title: "Content"
description: "Registro de elements, pipeline de contenido, calendario de publicaciones y aprobaciones."
---

# Content: *la creatividad es el element*

El contenido es entrega y también es dato: cada post, reel y email es un element cuyas signals se atribuyen a esa pieza específica.

## Responsabilidades

| Área | Qué incluye |
| --- | --- |
| Registro de elements | Una fila por element: tipo, plataforma, título, estado, fecha de publicación y oferta; las signals se unen por `element_id` |
| Pipeline | Ocho estados de Ready to Shoot a Posted, cada uno con responsable; formato, origen (ciclo, extra, solicitud), etiqueta y su tope de tiempo |
| Calendario | Calendario de publicaciones, ready to post, líneas de tiempo de lotes de gráficos y reels, pendientes del día |
| Aprobaciones | La cola de aprobación del client: aprobar, pedir cambios; una pieza aprobada pasa al calendario |
| Biblioteca | Cada pieza en un solo lugar con su métrica |

## Estados

```mermaid
stateDiagram-v2
  [*] --> ready_to_shoot
  ready_to_shoot --> copywriter
  copywriter --> produced
  produced --> editing
  editing --> qc
  qc --> revision: requiere cambios
  revision --> editing
  qc --> ready_to_post
  ready_to_post --> awaiting_client: necesita el OK del client
  awaiting_client --> ready_to_post: aprobada
  awaiting_client --> revision: pidió cambios
  ready_to_post --> posted
  posted --> [*]
```

## Herramientas MCP

| Herramienta | Escribe | Nivel inicial |
| --- | --- | --- |
| `content.list_calendar` | No | 4 |
| `content.draft_item` | Sí (un borrador) | 2 |
| `content.propose_calendar` | Sí (una propuesta) | 2 |
| `content.publish_item` | Sí | 3 |

## Eventos

**Publica:** `content.status.changed`, `content.approved`, `content.published`.
**Consume:** `task.fired`.
