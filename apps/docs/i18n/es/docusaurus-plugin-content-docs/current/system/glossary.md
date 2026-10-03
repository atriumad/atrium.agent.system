---
sidebar_position: 2
title: "Glosario"
description: "Nombres canónicos para código, ventas y reportes."
---

# Glosario *canónico*

Un solo nombre por concepto. En inglés para código y ventas; los equivalentes en español son de uso interno. Los nombres retirados no se usan más.

## Negocio

| Término | Clave en código | Qué es | Reemplaza a |
| --- | --- | --- | --- |
| Growth System | `growth_system` | El sistema completo: 5 engines, un score | Restaurant Marketing System |
| Engine | `engine` | Unidad que responde una pregunta sobre el restaurante. Hay exactamente 5 | Pillar (como nombre de un engine) |
| Discoverability | `discoverability` | Engine 01. Que te encuentren: ¿qué tan bien armado estás? | — |
| Acquisition | `acquisition` | Engine 02. Que te vean: ¿cuánto de la ciudad te ve? | Attention, Penetration |
| Reputation | `reputation` | Engine 03. Que te elijan: ¿te eligen? | Trust |
| Retention | `retention` | Engine 04. Que vuelvan: ¿vuelven? | Retain (como engine) |
| Growth | `growth` | Engine 05. Revenue rastreado: ¿qué producen los ads y las campañas? | Growth Intelligence (capa) |
| Tier | `tier` | Agrupación de servicios por intención comercial: Discover, Retain, Growth. No es un engine | — |
| Package | `package` | Lo que compra un client y lo que la plataforma desbloquea: Essential, Pillar 2, Pillar 3 | Plan |
| Service | `service` | Unidad vendible y entregable. Pertenece a un solo engine | — |
| Moment | `moment` | Uno de los 10 momentos de descubrimiento | Trigger |
| Archetype | `archetype` | Uno de los 5 tipos de recorrido del cliente | Persona |
| Stage | `journey_stage` | Stranger, Discovery, Consideration, First Visit, Loyal Regular | — |
| Funnel stage | `funnel_stage` | awareness, consideration, buying_intent, outcome o none. Cómo se clasifica una métrica | — |
| Client | `client` | El negocio que contrata a Atrium (el restaurante) | Organization, brand |
| Location | `location` | Local físico de un client | Restaurant GUID |
| Guest | `guest` | El comensal del restaurante | Customer, crm_customer |

## Datos

| Término | Clave en código | Qué es | Reemplaza a |
| --- | --- | --- | --- |
| Signal | `signal` | Una cosa contada en un día: una impresión, un toque, una orden. El átomo | Metric (cuando lo dice una plataforma) |
| Element | `element` | Una pieza individual con sus propias signals: un reel, un email, un ad, una oferta, un botón del hub | Asset |
| Metric | `metric` | Signals calculadas sobre un período (sum, avg, rate, latest) | KPI |
| Benchmark | `benchmark` | Promedio mensual de los restaurantes en un radio de 10 millas, por métrica | Promedio de competidores |
| Measured score | `measured` | Mitad de un score de engine: métricas contra el benchmark | Cuantitativo |
| Practice grade | `practice` | La otra mitad: criterios que ninguna API reporta, calificados de 0 a 4 por agentes | Cualitativo |
| Engine score | `engine_score` | 0–100 por engine: 60% measured + 40% practice | Grade, score |
| Growth Score | `growth_score` | 0–300: los cinco scores de engine con el mismo peso | Health score |

## Producto y operación

| Término | Clave en código | Qué es | Reemplaza a |
| --- | --- | --- | --- |
| Platform | `platform` | El dashboard web del client (Growth OS) | Dashboard v4 |
| Manager | `manager` | La app web de la agencia (Agency OS) | Admin |
| Mobile | `mobile` | La app del dueño | — |
| Hub | `hub` | La landing del restaurante: un link en todas partes, más la fuente de verdad first-party | Linktree |
| COG | `cog` | Client Operational Guidelines: la promesa, expresada en unidades medibles | Scope doc |
| Cycle | `cycle` | El ritmo mensual de entrega anclado a la fecha de facturación | Sprint |
| Account Manager (AM) | `account_manager` | Dueño de la relación con el client, dispara las tareas y aprueba | — |

## Agentes y código

| Término | Clave en código | Qué es | Reemplaza a |
| --- | --- | --- | --- |
| Agent | `agent` | Agente principal de un engine (Concierge, Herald, Host, Sommelier, Steward) o el orquestador (Maître) | — |
| Subagent | `subagent` | Especialista dentro de un agente, con su propio manifiesto | Bot |
| Module | `module` | Unidad de código con su esquema, API, eventos y herramientas MCP | Service (técnico) |

:::tip Convención
"Client" es siempre el restaurante y "guest" siempre el comensal. Nunca al revés, nunca "customer". "Host" es el agente; la persona que sienta a los guests es "personal del restaurante".
:::
