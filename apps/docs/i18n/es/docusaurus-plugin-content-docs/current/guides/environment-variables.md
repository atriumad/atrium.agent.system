---
sidebar_position: 2.5
title: "Variables de entorno"
description: "Cada variable que lee el repositorio, qué hace, su valor por defecto y quién la necesita."
---

# Variables de *entorno*

Los nombres viven en `.env.example`, en la raíz del repositorio; los valores reales viven en `.env.local` (nunca se sube al repositorio) y en el almacén de secretos de cada entorno. Esta página dice qué hace cada variable. Los valores por defecto son los del código.

Cómo leer las tablas: **Obligatoria** indica cuándo el proceso se niega a arrancar sin la variable. Si hay un valor por defecto, puedes dejarla vacía en desarrollo.

:::note
Fuera de development y test, un `NODE_ENV` sin definir cuenta como producción. El transporte de email y la verificación del webhook fallan cerrados a propósito.
:::

## Núcleo

| Variable | Qué es | Por defecto | Quién la lee |
| --- | --- | --- | --- |
| `NODE_ENV` | `development`, `test` o `production`. Fuera de development y test, la API y el servicio de agentes exigen las variables de email, webhook y URL pública, y se rechazan los modelos `:free`. | ninguno (cuenta como producción) | API, agentes, transporte de email |
| `DATABASE_URL` | Conexión a Postgres con el rol `atrium_app`, sujeto a RLS. Todo lo que corre en ejecución la usa. | ninguno | API, worker, `modules/core`, seed |
| `DATABASE_ADMIN_URL` | Conexión a Postgres con el rol dueño, que se salta RLS. Solo para migraciones y el seed. Nunca se la des a un servicio en ejecución. | ninguno (el seed usa un rol local `atrium`) | `scripts/migrate.ts`, seed |
| `ATRIUM_APP_PASSWORD` | Contraseña que la migración asigna al rol `atrium_app`. | `atrium_app` | `scripts/migrate.ts` |
| `BETTER_AUTH_SECRET` | Secreto que firma las sesiones. Largo y aleatorio. Sin él, la API sigue recibiendo tráfico de conectores, pero el inicio de sesión y las rutas de casos no funcionan. | ninguno | API |
| `BETTER_AUTH_URL` | URL pública base de la API para los callbacks de autenticación y las cookies. | `http://localhost:3001` | API |
| `AGENCY_SLUG` | Slug de la agencia que sirven la API y el worker. El seed crea `demo-atrium`. | `atrium` | API, worker |
| `TRUSTED_ORIGINS` | Orígenes que pueden llamar a la API con credenciales, separados por coma. | `http://localhost:3002,http://localhost:3003` | API |
| `PORT` | Puerto en el que escucha la API. No aparece en `.env.example`. | `3001` | API |

## Pantallas y enlaces

El Hub es donde los huéspedes abren los enlaces de encuesta y los códigos QR. Estas variables le dicen a cada proceso dónde están los demás.

| Variable | Qué es | Por defecto | Quién la lee |
| --- | --- | --- | --- |
| `API_URL` | Hacia dónde Manager, Platform y Hub redirigen `/api` y sus rutas públicas. También es donde debe apuntar el webhook de Resend (`<API_URL>/webhooks/resend`). | `http://localhost:3001` | Manager, Platform, Hub, seed |
| `HUB_URL` | URL del Hub, usada para construir los enlaces de encuesta y QR. | `http://localhost:3004` | API |
| `PLATFORM_URL` | URL de Platform, usada en los enlaces a la pantalla del dueño. | `http://localhost:3003` | API |
| `PUBLIC_BASE_URL` | URL pública base para los enlaces dentro de los emails. **Obligatoria** para el servicio de agentes fuera de development y test. | `http://localhost:3001` | agentes, seed |
| `ADMIN_BASE_URL` | URL base opcional para enlaces dirigidos al account manager. No está en `.env.example`. | sin definir | agentes |
| `SURVEY_SECRET` | Secreto HMAC que firma los tokens de QR y de baja (`un1.<clientId>.<guestId>.<firma>`). La API y el servicio de agentes deben compartir el mismo valor. Si cambia, todos los enlaces ya enviados dejan de funcionar. | `BETTER_AUTH_SECRET` | API, agentes |

## Email (Resend)

| Variable | Qué es | Por defecto | Quién la lee |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | API key de Resend. | ninguno | API, agentes |
| `EMAIL_FROM` | Dirección remitente de todos los emails. | ninguno | API, agentes |
| `RESEND_WEBHOOK_SECRET` | El secreto `whsec_...` con el que Resend firma sus webhooks. **Obligatoria** para la API fuera de development y test, porque sin ella no se distingue un evento falso de uno real. En local sirve cualquier valor `whsec_`. | ninguno | API |

`RESEND_API_KEY` y `EMAIL_FROM` van juntas: definir solo una es un error. Con las dos vacías y `NODE_ENV` en `development` o `test`, el correo se registra en el outbox y no se envía. Con las dos vacías en cualquier otro caso, el proceso no arranca.

## Agentes

Los agentes de Host corren en su propio servicio ([ADR 0020](../adr/0020-agents-in-their-own-service)) y el worker lo llama. El modelo corre detrás de un puerto ([ADR 0019](../adr/0019-llm-provider-behind-a-port)).

| Variable | Qué es | Por defecto | Quién la lee |
| --- | --- | --- | --- |
| `AGENTS_PORT` | Puerto del servicio de agentes. | `3005` | agentes |
| `AGENTS_URL` | Dónde encuentra el worker al servicio de agentes. **Obligatoria** para el worker. | ninguno | worker |
| `AGENTS_SERVICE_TOKEN` | Token compartido entre el worker y el servicio de agentes. Cualquier cadena aleatoria de 32 caracteres o más; una más corta hace que el servicio de agentes se niegue a arrancar. **Obligatoria** para ambos. | ninguno | worker, agentes |
| `HOST_LLM_API_KEY` | Key del modelo de Host, compartida por sus subagentes. Vacía significa sin modelo: Sentiment responde "rejected" y Recovery sigue funcionando con la calificación. | ninguno | agentes |
| `HOST_MODEL_DEFAULT` | Modelo que usan todos los subagentes de Host salvo que tengan el suyo. | ninguno | agentes |
| `HOST_MODEL_SENTIMENT` | Modelo para `host.sentiment`. Si falta, usa `HOST_MODEL_DEFAULT`. | ninguno | agentes |
| `HOST_ALLOW_FREE` | Con `true` permite un id de modelo que termina en `:free` fuera de development y test. Solo para datos de prueba. | sin definir | agentes |

## Conectores y proveedores

| Variable | Qué es | Estado |
| --- | --- | --- |
| `N8N_ENCRYPTION_KEY` | Clave con la que N8N cifra las credenciales que guarda. `docker-compose.yml` usa `dev-only-change-me` por defecto, así que define una real en cualquier lugar que no sea tu máquina. | en uso |
| `INGESTION_API_TOKEN` | Reservada para la ingesta de conectores. El token de ingesta que funciona hoy lo emite el módulo de signals (empieza con `atg_`); el seed imprime uno. | el código no la lee |
| `TOAST_EXPORT_BUCKET` | Bucket de los exports de Toast. | el código no la lee |
| `METRICOOL_API_TOKEN` | Token de la API de Metricool. | el código no la lee |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Developer token de Google Ads. | el código no la lee |
| `META_ADS_APP_ID`, `META_ADS_APP_SECRET` | Credenciales de la app de Meta Ads. | el código no la lee |

Las variables de proveedores son marcadores para conectores que aún no están construidos. Un conector envía datos con su token acotado a través de la API de ingesta, como describe [Agregar un conector](./add-a-connector).

## Observabilidad

| Variable | Qué es | Estado |
| --- | --- | --- |
| `SENTRY_DSN` | DSN de Sentry para reportar errores. | el código no la lee |

## Secretos

Nunca deben subirse al repositorio ni escribirse en logs: `BETTER_AUTH_SECRET`, `SURVEY_SECRET`, `DATABASE_ADMIN_URL`, `AGENTS_SERVICE_TOKEN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `HOST_LLM_API_KEY`, `N8N_ENCRYPTION_KEY` y todos los tokens de proveedores. `.env.example` solo contiene nombres.

## Mantener esta página al día

Cuando un proceso empiece a leer una variable nueva, agrégala a `.env.example` y a esta página en el mismo pull request, en los dos idiomas. Cuando una variable marcada "el código no la lee" empiece a leerse, cambia su estado y completa su fila.
