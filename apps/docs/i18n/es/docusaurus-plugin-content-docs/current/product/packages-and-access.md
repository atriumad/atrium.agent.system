---
sidebar_position: 5
title: "Paquetes y acceso"
description: "Qué desbloquea cada paquete y cómo se comportan las secciones bloqueadas."
---

# Paquetes y *acceso*

Tu paquete controla qué secciones están activas. Las páginas bloqueadas siguen visibles para que un client vea qué desbloquea el siguiente paquete, y los datos ya están fluyendo: una sección se enciende en el momento en que se desbloquea, sin configuración y sin espera.

## Los tres paquetes

| Paquete | Precio | Qué es |
| --- | --- | --- |
| **Essential** | $1,800 / mes | Social orgánico, estudio de contenido y analytics. Discoverability básico. La rampa de entrada |
| **Pillar 2** | $4,200 / mes | Agrega Discoverability completo, Reputation y Attribution verificada. El núcleo |
| **Pillar 3** | $6,800 / mes | Todo: CRM de Retention, lealtad, motores de SMS y email, atribución completa |

## Matriz de acceso

Por módulo: **Completo**, **Básico** o **Bloqueado**. Todos reciben Content, Analytics y Discoverability orgánico en Básico.

| Módulo | Essential | Pillar 2 | Pillar 3 |
| --- | --- | --- | --- |
| Content | Completo | Completo | Completo |
| Analytics | Completo | Completo | Completo |
| Discoverability | Básico | Completo | Completo |
| Reputation | Bloqueado | Completo | Completo |
| Retention | Bloqueado | Bloqueado | Completo |
| Attribution | Bloqueado | Básico | Completo |

## Qué muestra una sección bloqueada

| Sección | Se desbloquea con | El teaser lista |
| --- | --- | --- |
| Retention | Pillar 3 | Guestbook y segmentos, campañas de email, campañas de SMS, lealtad y automatizaciones |
| Attribution | Pillar 2 | Aware → trusted → visited → ordered, acciones rastreadas, de dónde vienen los guests, channel mix |
| Growth | Pillar 2 | Paneles de campaña, cola de lanzamientos, línea de tiempo de esfuerzo, paid media |
| Management | Pillar 2 | Cola de aprobaciones, calendario de publicaciones, biblioteca de contenido |
| Benchmarks | Pillar 3 | Barras tú vs 10 millas, moat metrics, rankings por categoría, proyecciones |

Cada teaser lleva una llamada a la acción: "Ask your strategist."

## Cómo se hace cumplir el acceso

- El acceso se calcula una vez, desde el paquete del client y los feature flags de Core, y lo leen la Platform, la app Mobile, el Manager y el gateway MCP. Un módulo bloqueado tampoco tiene herramientas para los agentes.
- Una sección bloqueada sigue ingiriendo datos, así que desbloquear es instantáneo.
- El Manager muestra la misma matriz por client ("Manage access") y el daily entry solo ofrece las secciones que el paquete desbloquea.

:::caution Por reconciliar
El prototipo de la Platform bloquea por sección (Pillar 2 desbloquea Retention y Growth; solo Benchmarks está bloqueado), mientras que la matriz del Manager de arriba bloquea Retention en Pillar 2. Esta página sigue la matriz del Manager. Ver [Decisiones abiertas](../plan/open-decisions).
:::
