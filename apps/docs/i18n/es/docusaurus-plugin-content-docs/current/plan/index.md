---
sidebar_position: 1
title: "Fases y calendario"
description: "Siete fases desde los cimientos hasta el sistema completo, con un desarrollador."
---

# Cimientos en cuatro semanas, *datos en ocho*, un dashboard para el cliente antes de Navidad

Calendario con un desarrollador trabajando con Claude Code, empezando el lunes 5 de octubre de 2026. El plan está ordenado por lo que todo lo demás necesita: primero los datos, porque cada pantalla, cada score y cada agente los lee; después el dashboard del cliente, luego las herramientas de la agencia y por último las capas que necesitan a ambos. Con dos desarrolladores, las fases F2 y F3, y las fases F5 y F6, corren en paralelo y el total baja a unas 20 semanas.

```mermaid
gantt
  title Plan de construcción · 2026–2027
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  section Cimientos
  F0 · repo, auth, Core, cola, MCP, esquema de signals :f0, 2026-10-05, 2026-10-31
  G0 · cimientos listos                                :milestone, g0, 2026-10-30, 0d
  section Datos
  F1 · signals, scoring, conectores, carga manual      :f1, 2026-11-02, 2026-11-28
  G1 · datos fluyendo                                  :milestone, g1, 2026-11-27, 0d
  section Platform V1
  F2 · dashboard, discoverability, attention, reputation :f2, 2026-11-30, 2026-12-24
  G2 · dashboard del cliente en vivo                   :milestone, g2, 2026-12-23, 0d
  section Agency OS
  F3 · Manager, ops, pipeline de contenido, aprobaciones :f3, 2027-01-04, 2027-01-30
  G3 · la agencia corre sobre el sistema               :milestone, g3, 2027-01-29, 0d
  section Platform V2
  F4 · attribution, retention, growth                  :f4, 2027-02-01, 2027-03-06
  G4 · dashboard del cliente completo                  :milestone, g4, 2027-03-05, 0d
  section Agentes
  F5 · evals, scorekeeper, echo, ask, narrator         :f5, 2027-03-08, 2027-03-27
  G5 · primeros agentes en producción                  :milestone, g5, 2027-03-26, 0d
  section Completo
  F6 · benchmarks, reports, mobile, lanzamiento        :f6, 2027-03-29, 2027-05-01
  G6 · sistema completo                                :milestone, g6, 2027-04-30, 0d
  section Externo
  Acceso a la API de GBP (no bloquea)                  :done, ext, 2026-10-05, 2026-11-14
```

| Fase | Fechas | Qué se entrega |
| --- | --- | --- |
| **F0 · Cimientos** | 5–30 oct | Repo con Bun, CI/CD, entornos, auth con organizaciones y team roles, Core (guests, consentimientos, paquetes, cola de eventos, aprobaciones, auditoría), gateway MCP y motor de políticas, UI base, el esquema de signals y la API de ingesta |
| **F1 · Columna de datos** | 2–27 nov | Registro de métricas, rollups, paquete de scoring, benchmarks, agent grades, carga manual diaria, N8N con Toast, Metricool, Google Business Profile, Meta Ads y Google Ads |
| **F2 · Platform V1** | 30 nov–23 dic | El shell de la Platform, Dashboard, Discoverability, Attention y Reputation, el hub, el flujo de encuestas y el feed de reseñas; 2 clients en piloto con datos reales |
| **F3 · Agency OS** | 4–29 ene | El Manager: cartera, workspace por client, COG, tareas disparadas desde él, pipeline de contenido, estudio, aprobaciones, daily entry y estado de datos; la sección Management de la Platform |
| **F4 · Platform V2** | 1 feb–5 mar | Attribution con identity stitching, Retention por email con Resend, programas y ofertas de Growth, acceso por paquete aplicado |
| **F5 · Agentes** | 8–26 mar | Harness de evals, calificación de práctica, Scorekeeper, Echo, Ask, Sentiment, Narrator y Strategist en producción |
| **F6 · Completo** | 29 mar–30 abr | Benchmarks, Reporting y Settings, el report builder, la app del dueño en Mobile, calibración de pesos, migración de la cartera |

Los cimientos llevan cuatro semanas porque incluyen el gateway MCP, el motor de políticas y el esquema de signals. La semana de fiestas (28 de diciembre al 1 de enero) no está programada. Las fechas son estimaciones para un desarrollador y se validan en la semana 0; ver [Decisiones abiertas](./open-decisions). Ver [Puertas](./gates) para los criterios de salida de cada fase.

:::caution Semanas con riesgo
F2 termina el 23 de diciembre y F1 contiene Thanksgiving; el plan no tiene colchón. Si los clients piloto no están elegidos y sus fuentes conectadas al final de F1, G2 se mueve.
:::
