---
id: 0002-bun-and-turborepo
sidebar_position: 3
title: "0002 · Bun con workspaces y Turborepo"
sidebar_label: "0002 · Bun con workspaces y Turborepo"
description: "Bun con workspaces y Turborepo"
---

# ADR 0002: Bun con workspaces y Turborepo

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

El repositorio contiene varias apps y módulos en TypeScript. Se busca instalar, ejecutar y probar rápido, con pocas herramientas.

## Decisión

Bun como gestor de paquetes (workspaces), runtime de API, worker y agentes, y runner de pruebas unitarias. Turborepo orquesta tareas y cachea builds.

## Consecuencias

- Un solo binario para instalar, ejecutar y probar.
- Hono, Drizzle y pg-boss tienen soporte para Bun.
- Algunas librerías pueden asumir Node: se verifica cada dependencia nueva en CI.

## Alternativas descartadas

- pnpm + Node: más piezas para el mismo resultado.
- npm workspaces: más lento y sin las ventajas del runtime.
