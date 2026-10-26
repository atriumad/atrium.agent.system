---
sidebar_position: 2.7
title: "Despliegue"
description: "Staging y producción: qué hacen los pipelines y cómo crear los proyectos una sola vez."
---

# *Despliegue*

Tres entornos. **Dev** es tu máquina (`docker-compose`). **Staging** se despliega solo en cada merge a `main`. **Producción** se promueve a mano, con la aprobación de un revisor.

| Pieza | Dónde | Por entorno |
| --- | --- | --- |
| Postgres | Supabase | un proyecto para staging y otro para prod |
| `api`, `agents`, `worker` | Railway | un proyecto de Railway cada uno, con tres servicios |
| `platform`, `manager`, `hub`, `qr-card` | Vercel | un proyecto de Vercel por app y por entorno (8 en total) |

## Qué hace el pipeline

`deploy.yml` corre en este orden y se detiene en el primer fallo:

1. **migrate**: `bun run db:migrate` contra la base del entorno, con el rol propietario.
2. **railway**: despliega `agents`, luego `api`, luego `worker`.
3. **vercel**: construye y despliega las cuatro apps web.
4. **smoke**: `GET /health` en la API y un `200` de cada app web.

- `deploy-staging.yml` arranca cuando CI termina bien en `main`.
- `deploy-prod.yml` se lanza a mano con el SHA de un commit que ya está en staging. El Environment `production` de GitHub lo detiene hasta que un revisor apruebe.

Las migraciones corren antes del código nuevo, así que cada una debe funcionar con el código que sigue en marcha (primero agregar, quitar en un release posterior).

## Preparación única

Hazlo una vez por entorno. Necesitas las cuentas de Supabase, Railway y Vercel y permisos de administrador en el repositorio de GitHub.

### 1. Supabase

1. Crea el proyecto `atrium-staging` (y `atrium-prod`). Elige la misma región que Railway.
2. Copia la cadena de conexión **directa** (puerto 5432, no el pooler): es `DATABASE_ADMIN_URL`, del rol propietario.
3. Elige un `ATRIUM_APP_PASSWORD` largo y aleatorio. La primera migración crea el rol `atrium_app` con él.
4. `DATABASE_URL` es el mismo host con el usuario `atrium_app` y esa contraseña. La app nunca se conecta como propietario, así que RLS siempre aplica.

### 2. Railway

1. Crea el proyecto `atrium-staging` con un entorno llamado `staging` (y `atrium-prod`).
2. Agrega tres servicios desde este repo de GitHub: `api`, `agents`, `worker`. Los nombres deben coincidir exactamente.
3. En cada servicio, Settings → Config-as-code → pon la ruta `deploy/railway/<servicio>.json`.
4. Dale a `api` y `agents` un dominio público o privado. `worker` no tiene puerto.
5. Define las variables de la tabla de abajo.
6. Crea un **project token** del entorno (Project Settings → Tokens). Es `RAILWAY_TOKEN`.

### 3. Vercel

1. Crea cuatro proyectos por entorno, por ejemplo `atrium-platform-staging`. En cada uno: Root Directory `apps/<app>`, framework Next.js y "Include files outside the Root Directory" activado.
2. Define las variables de cada proyecto, abajo. `API_URL` se lee cuando la app se construye, así que si la cambias, vuelve a desplegar.
3. Crea un token de acceso (`VERCEL_TOKEN`). Anota el id del equipo (`VERCEL_ORG_ID`) y el id de cada proyecto.

### 4. GitHub

Crea dos Environments, `staging` y `production`. En `production`, agrégate como revisor obligatorio y límitalo a `main`.

En cada Environment:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Secret | `DATABASE_ADMIN_URL` | cadena del propietario |
| Secret | `ATRIUM_APP_PASSWORD` | contraseña del rol de la app |
| Secret | `RAILWAY_TOKEN` | project token de ese entorno |
| Secret | `VERCEL_TOKEN` | token de acceso de Vercel |
| Variable | `VERCEL_ORG_ID` | id del equipo de Vercel |
| Variable | `VERCEL_PROJECT_PLATFORM`, `_MANAGER`, `_HUB`, `_QR_CARD` | los cuatro ids de proyecto |
| Variable | `API_URL`, `PLATFORM_URL`, `MANAGER_URL`, `HUB_URL`, `QR_CARD_URL` | orígenes públicos, sin barra final, para el paso smoke |

Activa también la protección de rama en `main`: revisión obligatoria, CI en verde y sin push directo.

## Variables por servicio

Los nombres salen de `.env.example`. Los valores viven solo en el almacén de secretos de cada plataforma.

| Servicio | Necesita |
| --- | --- |
| `api` | `NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `AGENCY_SLUG`, `PUBLIC_BASE_URL`, `HUB_URL`, `PLATFORM_URL`, `SURVEY_SECRET`, `INGESTION_API_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `LOYALTY_SECRET`, `LOYALTY_PROXY_SECRET`, `QR_CARD_URL`, `TRUST_PROXY`, `SENTRY_DSN` |
| `agents` | `NODE_ENV=production`, `DATABASE_URL`, `AGENTS_SERVICE_TOKEN`, `PUBLIC_BASE_URL`, `SURVEY_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `HOST_LLM_API_KEY`, `HOST_MODEL_DEFAULT`, `HOST_MODEL_SENTIMENT`, `SENTRY_DSN` |
| `worker` | `NODE_ENV=production`, `DATABASE_URL`, `AGENTS_URL`, `AGENTS_SERVICE_TOKEN`, `SENTRY_DSN` |
| `platform`, `manager`, `hub` | `API_URL` (el origen público de la API) |
| `qr-card` | `API_URL`, `LOYALTY_PROXY_SECRET` (el mismo valor que en la API), `QR_CARD_PROXY_HOPS` |

Railway define `PORT` por su cuenta y la API y agents lo leen. No definas `AGENTS_PORT` allí. Usa un valor distinto para cada secreto en staging y prod: nunca reutilices uno.

## Primera ejecución

1. Haz merge a `main`. Mira `Deploy staging`. Un paso `smoke` en rojo nombra la URL que falló.
2. Abre la Platform de staging e inicia sesión.
3. Cuando staging esté bien, lanza **Deploy production** desde la pestaña Actions con el SHA del commit de staging y apruébalo.

## Volver atrás

- **Vercel:** Deployments → despliegue anterior → Promote.
- **Railway:** Deployments del servicio → Redeploy del anterior.
- **Base de datos:** no hay rollback automático. Escribe una migración nueva hacia adelante. Cada archivo corre en una sola transacción, así que una migración fallida no deja nada a medias.
