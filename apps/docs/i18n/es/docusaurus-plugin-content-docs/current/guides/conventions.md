---
sidebar_position: 3
title: "Convenciones"
description: "Código, nombres, commits y pull requests."
---

# Convenciones

## Código

- TypeScript estricto. Sin `any` salvo en adaptadores de terceros, con comentario.
- Biome para lint y formato; no se discute el formato en revisiones.
- Validación en los bordes con Zod: requests, eventos, filas de signal, herramientas MCP y respuestas de terceros.
- Errores de dominio como tipos explícitos, no excepciones genéricas.
- Fechas en UTC en la base; el día de la signal es el día local del location; se muestran en la zona horaria del location.
- Dinero en centavos enteros (`totalCents`). Las unidades de las métricas vienen del registro, nunca de la pantalla.
- Una estimación es un campo (`method = estimate`), no una nota al pie.

## Nombres

| Elemento | Convención | Ejemplo |
| --- | --- | --- |
| Términos de negocio | Los del [glosario](../system/glossary) | `client`, `guest`, `location` |
| Paquetes | `@atrium/<nombre>` | `@atrium/contracts` |
| Esquemas de base | nombre del módulo | `signals`, `reputation` |
| Eventos | `entidad.hecho_en_pasado` | `review.received` |
| Signal types | `snake_case`, del enum | `reserve_click` |
| Ids de métricas | `snake_case`, estables | `impressions_total` |
| Etiquetas de métricas | Title Case, del vocabulario | Engagement rate |
| Herramientas MCP | `modulo.verbo_objeto` | `reputation.open_case` |
| Subagentes | `agente.subagente` | `host.recovery` |
| Casos de uso | verbo + objeto | `openRecoveryCase` |

## Commits y pull requests

- Commits con Conventional Commits: `feat(signals): reconstruir métricas de forma idempotente`.
- Un pull request por cambio lógico, con descripción de qué y por qué.
- Si el cambio toca una decisión de arquitectura, enlaza o crea su ADR.
- Si cambia un contrato de evento, un signal type, una métrica o una herramienta MCP, actualiza su página en esta documentación, en los dos idiomas.
