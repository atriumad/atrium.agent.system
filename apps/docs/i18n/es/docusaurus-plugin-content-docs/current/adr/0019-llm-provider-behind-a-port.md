---
id: 0019-llm-provider-behind-a-port
sidebar_position: 20
title: "0019 · El modelo de lenguaje vive detrás de un puerto"
sidebar_label: "0019 · El modelo de lenguaje vive detrás de un puerto"
description: "El modelo de lenguaje vive detrás de un puerto"
---

# ADR 0019: El modelo de lenguaje vive detrás de un puerto

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-13 | Atrium · producto y tecnología |

## Contexto

Sentiment lee lo que los guests escriben en una encuesta. Eso requiere un modelo de lenguaje, y el proveedor va a cambiar: empezamos con un modelo gratuito para construir, y pasamos a uno pago antes de tener clientes reales. Las palabras de los guests son datos de terceros.

## Decisión

El caso de uso depende de un puerto `ResponseReader`. El adaptador vive en `apps/agents` y llama a OpenRouter a través del Vercel AI SDK, con el esquema de la lectura como esquema Zod. El proveedor es un id de modelo en `HOST_MODEL_SENTIMENT` (o `HOST_MODEL_DEFAULT`). El modelo usado se guarda con cada lectura (`read_model`). Al modelo solo llegan la calificación, las dos opciones elegidas y el comentario: nunca un id, nombre o contacto del guest. El modelo solo puede subir una severidad, nunca bajarla ni cerrar un caso.

Las respuestas de clientes reales van solo a un modelo pago, o a un modelo cuya política de datos se haya revisado y quede registrada aquí. El servicio de agentes rechaza un modelo `:free` salvo que `NODE_ENV` sea `development` o `test`, o que `HOST_ALLOW_FREE=true`; un `NODE_ENV` sin definir cuenta como producción.

## Consecuencias

- Cambiar de proveedor cambia un texto, no el módulo.
- Un modelo gratuito que limita el uso o falla deja respuestas sin leer; Recovery sigue funcionando con la calificación.
- Una llamada de lectura mantiene una transacción de base de datos como máximo 15 segundos.
- Los agentes corren en su propio servicio, al que llama el worker ([0020](./0020-agents-in-their-own-service)); los eventos y los reintentos siguen en pg-boss ([0006](./0006-events-with-pg-boss)). Las variables de este ADR ahora son `HOST_LLM_API_KEY`, `HOST_MODEL_*` y `HOST_ALLOW_FREE`.
- Antes de habilitar un modelo para clientes reales, correr una vez los casos dorados y hostiles contra ese modelo (`bun apps/agents/scripts/eval-sentiment.ts` con `HOST_LLM_API_KEY` y `HOST_MODEL_SENTIMENT` definidos) y registrar en este ADR el modelo y su política de datos. La llamada real al SDK todavía no se ejercitó contra un proveedor real.

## Alternativas descartadas

- Llamar al proveedor desde dentro de Recovery: haría que los casos dependan de un servicio externo.
- Vercel Functions o Queues para los agentes: reemplazarían la cola transaccional del ADR 0006.
- Listas de palabras clave por cliente (la forma anterior): frágiles y mantenidas a mano.

## Modelo en uso
