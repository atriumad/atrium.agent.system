---
id: 0018-no-review-gating
sidebar_position: 19
title: "0018 · El pedido de reseña nunca se filtra por calificación"
sidebar_label: "0018 · El pedido de reseña nunca se filtra por calificación"
description: "El pedido de reseña nunca se filtra por calificación"
---

# ADR 0018: El pedido de reseña nunca se filtra por calificación

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

El flujo de origen enviaba a Google a los guests con buena experiencia y a un canal privado de recuperación a los descontentos. La política de Google prohíbe pedir reseñas solo a los guests satisfechos, y puede eliminar reseñas o penalizar el perfil.

## Decisión

Se pide reseña a todos. La encuesta muestra el botón de reseña de Google a cada guest sin importar su calificación, y ofrece además un canal privado, nunca en lugar de la reseña. El link de reseña lo agrega el sistema en la plantilla; ninguna herramienta permite que dependa de la respuesta. La lealtad y las ofertas nunca se condicionan a una reseña.

## Consecuencias

- Cumplimiento de la política de Google.
- El rating refleja a todos los guests, que es también lo que mide el benchmark.
- El canal privado igual detecta los problemas a tiempo, porque se muestra a todos.

## Alternativas descartadas

- Enrutar por sentimiento: más simple de explicar, y prohibido.
- Pedir solo tras una buena nota de encuesta: la misma práctica con otro nombre.
