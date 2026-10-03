---
sidebar_position: 11
title: "Reglas comunes"
description: "Lo que ningún agente hace, en ningún nivel de autonomía."
---

# Lo que *ningún agente* hace

Seis reglas que valen para los 30 agentes y subagentes, sin excepción. Cada una tiene un chequeo en código, no solo una línea en el prompt.

| Regla | Cómo se hace cumplir |
| --- | --- |
| **Pide reseña a todos.** Nunca filtra según la experiencia | El link de reseña lo agrega el sistema en la plantilla; ninguna herramienta permite condicionarlo. Ver [ADR 0018](../adr/0018-no-review-gating) |
| **Sin consentimiento, no hay mensaje** | La herramienta de notificación consulta el registro de consentimientos y rechaza el envío |
| **Cada dólar dice de dónde vino** | El modelo de atribución exige un método; la correlación temporal no se suma; las estimaciones se etiquetan |
| **La voz pública y el dinero del client pasan por una persona** | Las herramientas que publican o gastan empiezan en nivel 3. Las respuestas a reseñas negativas y los lanzamientos de paid se quedan en nivel 3 de forma permanente |
| **Si falta un dato, lo dice** | Las herramientas devuelven "sin datos" explícito; los evals penalizan inventar números |
| **Todo queda en el registro** | El gateway MCP audita cada llamada antes y después de ejecutarla |
