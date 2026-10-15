---
id: 0014-n8n-connectors-with-ingestion-api
sidebar_position: 15
title: "0014 · Conectores N8N que llaman a una API de ingesta"
sidebar_label: "0014 · Conectores N8N que llaman a una API de ingesta"
description: "Conectores N8N que llaman a una API de ingesta"
---

# ADR 0014: Conectores N8N que llaman a una API de ingesta

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Cada proveedor (Toast, Metricool, Resend, Google, Meta) tiene su propia API, cadencia y rarezas, y cambian. Los prototipos asumen N8N alimentando Supabase. Escribir cada conector como código de aplicación es lento; dejar que los workflows escriban en la base se salta la validación y el aislamiento por tenant.

## Decisión

Los conectores son workflows de N8N, exportados a `connectors/` en el repo. Nunca escriben en la base: llaman a una API de ingesta validada e idempotente en `apps/api` con un token acotado por conector. Las fuentes first-party (hub, flujo de encuestas) llaman a la misma API. Un daily entry manual también la usa, con `source = manual`.

## Consecuencias

- Rápidos de construir y de cambiar por proveedor, con una traza visual de cada corrida.
- La validación, la deduplicación y el aislamiento viven en un solo lugar y se prueban.
- Cada fuente, incluida la manual, toma el mismo camino.
- N8N es un proceso más que correr y proteger.

## Alternativas descartadas

- Conectores propios en el worker: más control, más lentos de construir.
- N8N escribiendo directo en Supabase: se salta la validación y el RLS.
- Un servicio de automatización alojado: costo por corrida y sin control de credenciales.
