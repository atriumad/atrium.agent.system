---
sidebar_position: 2
title: "Desarrollo local"
description: "Levantar el repositorio en tu máquina."
---

# Desarrollo *local*

## Requisitos

- Bun (versión fijada en `package.json` → `packageManager`)
- Docker, para Postgres y N8N locales
- Un `.env.local` en la raíz del repositorio, copiado de `.env.example`. El ejemplo lista solo nombres; pide los valores de desarrollo

## Primer arranque

```bash
bun install
cp .env.example .env.local          # completa los valores de desarrollo
docker compose up -d postgres n8n   # Postgres y N8N locales
bun --env-file=.env.local scripts/migrate.ts            # igual que: bun run db:migrate
bun --env-file=.env.local apps/worker/scripts/seed.ts   # igual que: bun run seed
```

El seed crea una agencia (`demo-atrium`), un client con un lugar (Casa Olivo Bellaire), un guest con consentimiento, un token de conector y dos usuarios demo. Se puede correr dos veces sin problema. Imprime los ids y el token que necesita el recorrido de abajo.

| Usuario | Contraseña | Rol | Entra por |
| --- | --- | --- | --- |
| `demo-am@demo.test` | `demo-password-1` | Account manager | Manager, `localhost:3002` |
| `demo-owner@demo.test` | `demo-password-1` | Dueño del client | Platform, `localhost:3003` |

## Levantar las apps

Todavía no hay un solo comando `dev`. Levanta cada app en su propia terminal, con las variables de `.env.local` cargadas y `AGENCY_SLUG=demo-atrium` (la agencia del seed):

```bash
export AGENCY_SLUG=demo-atrium
bun --env-file=.env.local run --filter @atrium/api dev        # :3001
bun --env-file=.env.local run --filter @atrium/agents dev     # :3005
bun --env-file=.env.local run --filter @atrium/worker dev
bun --env-file=.env.local run --filter @atrium/manager dev    # :3002
bun --env-file=.env.local run --filter @atrium/platform dev   # :3003
bun --env-file=.env.local run --filter @atrium/hub dev        # :3004
```

Compruébalas: `curl localhost:3001/api/auth/ok` responde `200` y las tres pantallas responden en sus puertos. El worker registra `worker.started` con sus consumidores y tareas. El worker necesita `AGENTS_URL` y `AGENTS_SERVICE_TOKEN`; levanta primero el servicio de agentes. Si `HOST_LLM_API_KEY` y un modelo para Sentiment (`HOST_MODEL_SENTIMENT` o `HOST_MODEL_DEFAULT`) están vacíos, Sentiment responde `rejected`; los casos se abren igual por la calificación.

## Recorrer el flujo principal

Es el flujo que describe [Usar el sistema hoy](../product/using-the-system). El seed imprime los ids y el token del conector.

```bash
# 1. Una orden identificada, como la enviaría Toast (a la API, puerto 3001)
curl -s http://localhost:3001/v1/signals \
  -H "authorization: Bearer $CONNECTOR_TOKEN" -H 'content-type: application/json' \
  -d '{"rows":[{"date":"2026-10-15","locationId":"<location>","source":"toast","signalType":"order","value":1,"guestId":"<guest>"}]}'

# 2. En menos de un minuto Ask envía la solicitud. Lee el enlace de la bandeja de salida
docker compose exec postgres psql -U atrium atrium -c \
  "select body from core.notifications where kind = 'reputation.review_request' order by created_at desc limit 1"

# 3. Abre el enlace /s/svy_… en el Hub (:3004) y responde con 1 a 3 estrellas.
#    Recovery abre un caso y avisa al dueño y al account manager
docker compose exec postgres psql -U atrium atrium -c \
  "select severity, status, due_at from reputation.recovery_cases order by opened_at desc limit 1"
```

Después entra al Manager como `demo-am@demo.test`, abre **Reputation → Cases**, elige el caso y usa **Mark contacted** y **Resolve**.

## Comandos frecuentes

| Comando | Qué hace |
| --- | --- |
| `bun run test` | Pruebas de apps, módulos y config, y las del paquete de UI |
| `bun run lint` | Biome: lint y formato (`lint:fix` aplica las correcciones) |
| `bun run check:deps` | dependency-cruiser: fronteras entre módulos |
| `bun run typecheck` | TypeScript sobre todo el repositorio |
| `bun run ci` | Lint, fronteras, tipos y pruebas, en ese orden |
| `bun run db:migrate` | Aplica las migraciones de todos los módulos |
| `bun run seed` | Datos demo, descritos arriba |
| `bun run docs:dev` | Solo esta documentación, en `localhost:3000` |
| `bun run docs:build` | Construye el sitio en los dos idiomas y valida enlaces |
