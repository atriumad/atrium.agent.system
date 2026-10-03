---
id: 0007-api-with-hono
sidebar_position: 8
title: "0007 · API con Hono y OpenAPI generado"
sidebar_label: "0007 · API con Hono y OpenAPI generado"
description: "API con Hono y OpenAPI generado"
---

# ADR 0007: API con Hono y OpenAPI generado

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Varias apps, los conectores y los agentes consumen las mismas operaciones. Se necesita un contrato explícito y tipos compartidos.

## Decisión

`apps/api` monta las rutas de cada módulo, y la API de ingesta, con Hono y zod-openapi sobre Bun. El OpenAPI se genera desde el código y produce un cliente tipado para las apps web y móvil.

## Consecuencias

- Contrato único y verificable en CI.
- El backend no queda atado a Next.js.

## Alternativas descartadas

- Rutas API o server actions de Next.js: mezclan interfaz y backend.
- tRPC: acopla el cliente a TypeScript y no produce un contrato público para los conectores.
