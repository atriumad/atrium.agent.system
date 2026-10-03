---
sidebar_position: 2
title: "Desarrollo local"
description: "Levantar el repositorio en tu máquina."
---

# Desarrollo *local*

:::note Repositorio por crear
Estos pasos describen el repositorio objetivo de la fase F0. Se actualizan cuando el esqueleto exista.
:::

## Requisitos

- Bun (versión fijada en `package.json` → `packageManager`)
- Docker, para Postgres local, N8N y pruebas de integración
- Acceso a los secretos de desarrollo

## Primer arranque

```bash
bun install
cp .env.example .env.local     # completar secretos de desarrollo
docker compose up -d postgres n8n   # Postgres y N8N locales
bun run db:migrate              # migraciones de todos los módulos
bun run db:seed                 # client, location y 90 días de signals de ejemplo (Casa Olivo)
bun run dev                     # api, worker, platform, manager, hub, mobile y docs
```

El seed genera signals diarias realistas para cada fuente, así que cada pantalla tiene datos sin un solo conector.

## Comandos frecuentes

| Comando | Qué hace |
| --- | --- |
| `bun run dev` | Levanta todas las apps con recarga |
| `bun run test` | Pruebas unitarias, de contrato, de calidad de datos y de integración |
| `bun run test:e2e` | Playwright contra el entorno local |
| `bun run lint` | Biome: lint y formato |
| `bun run check:deps` | dependency-cruiser: límites entre módulos |
| `bun run db:generate` | Genera una migración desde el esquema de Drizzle |
| `bun run rollup` | Reconstruye `metrics_daily` y `scores_weekly` para un client y un rango |
| `bun run connectors:replay <provider>` | Reproduce los fixtures grabados de un conector por la API de ingesta |
| `bun run evals` | Evals de todos los subagentes |
| `bun run --filter @atrium/docs dev` | Solo esta documentación |
