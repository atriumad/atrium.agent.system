---
id: 0009-agents-mcp-and-policies
sidebar_position: 10
title: "0009 · Agentes con herramientas MCP y motor de políticas"
sidebar_label: "0009 · Agentes con herramientas MCP y motor de políticas"
description: "Agentes con herramientas MCP y motor de políticas"
---

# ADR 0009: Agentes con herramientas MCP y motor de políticas

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Los agentes deben operar el sistema de forma autónoma siguiendo reglas de las que no pueden salirse. Las instrucciones en un prompt no son verificables.

## Decisión

Cada módulo expone sus casos de uso como herramientas MCP. Cada subagente tiene un manifiesto versionado (herramientas, niveles, límites, reglas `never`). Un gateway MCP identifica al subagente y un motor de políticas decide en cada llamada: ejecutar, pedir aprobación o rechazar. Todo queda auditado.

## Consecuencias

- Las reglas viven en código y se prueban.
- Un agente no puede hacer nada que una persona con ese rol no pueda.
- Costo: construir gateway, motor y auditoría en F0.

## Alternativas descartadas

- Dar acceso a la API o a la base: sin límites verificables.
- Solo instrucciones en el prompt: no se pueden garantizar.
