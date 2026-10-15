---
id: 0020-agents-in-their-own-service
sidebar_position: 21
title: "0020 · Los agentes viven en su propio servicio"
sidebar_label: "0020 · Los agentes viven en su propio servicio"
description: "Los agentes viven en su propio servicio"
---

# ADR 0020: Los agentes viven en su propio servicio

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-15 | Atrium · producto y tecnología |

## Contexto

Los subagentes del Host corrían dentro del worker, conectados a los eventos por el módulo. Eso dejaba a los agentes sin un lugar propio: la clave del modelo, el gateway y el código de los agentes estaban en el worker, y cada agente nuevo se habría conectado igual. El Host necesita su propia clave de modelo, y sus subagentes tienen que poder ser llamados por el worker, la API y más adelante otros módulos.

## Decisión

`apps/agents` es un servicio. Tiene el gateway, el runtime del modelo y un registro de tareas, y es el único proceso con la clave del Host (`HOST_LLM_API_KEY`). Los llamantes usan un cliente tipado de `packages/contracts` sobre HTTP (`POST /v1/tasks/:name`, token en el encabezado). El llamante manda ids y una razón; el servicio lee los datos y aplica los efectos a través del gateway, así que el motor de políticas, los límites, el kill switch y la auditoría cubren toda la tarea.

El modelo hace tareas tipadas: devuelve un objeto que cumple un esquema y el código decide qué hacer con él. Nunca elige herramientas. El modelo se elige por subagente (`HOST_MODEL_<SUBAGENTE>`, con `HOST_MODEL_DEFAULT` de respaldo), detrás del puerto del [0019](./0019-llm-provider-behind-a-port).

Los manifiestos y las herramientas se quedan en los módulos. El worker conserva los consumidores de eventos y el cron, y cada uno solo pide una tarea.

## Consecuencias

- Un proceso más que operar, con acceso a la base acotado por el gateway, el motor de políticas y RLS.
- Un rechazo de política vuelve como valor y no se reintenta. Una falla del proveedor o de la red hace fallar la llamada, y pg-boss la reintenta.
- Un agente nuevo agrega tareas al registro y una entrada al contrato; el servidor no cambia.
- La llamada al modelo sigue corriendo dentro de la transacción de la herramienta, como máximo 15 segundos y sin bloquear filas, como aceptó el 0019. Una herramienta de lectura y otra de aplicación pueden separarla más adelante.
- Las variables `OPENROUTER_API_KEY`, `SENTIMENT_MODEL` y `SENTIMENT_ALLOW_FREE` se reemplazan por `HOST_LLM_API_KEY`, `HOST_MODEL_*` y `HOST_ALLOW_FREE`.

## Alternativas descartadas

- Dejar los agentes en el worker: sin lugar para la clave y cada agente conectado a mano.
- Una cola entre el worker y los agentes: no sirve para un pedido desde una pantalla que necesita la respuesta ya.
- Un bucle de herramientas para cada subagente: más difícil de probar y de acotar; se puede agregar a un subagente que lo necesite.
