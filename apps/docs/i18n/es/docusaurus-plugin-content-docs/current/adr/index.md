---
sidebar_position: 1
title: "Decisiones (ADR)"
description: "Registro de decisiones de arquitectura."
---

# Registro de *decisiones*

Cada decisión técnica importante queda escrita en un ADR corto: contexto, decisión, consecuencias y alternativas. Un ADR aceptado no se edita; si la decisión cambia, se escribe uno nuevo que lo reemplaza.

| ADR | Decisión | Estado |
| --- | --- | --- |
| [0001](./0001-modular-monolith) | Monolito modular con límites verificados | Aceptada |
| [0002](./0002-bun-and-turborepo) | Bun con workspaces y Turborepo | Aceptada |
| [0003](./0003-nextjs-16) | Next.js 16 para las superficies web | Aceptada |
| [0004](./0004-base-ui-and-tailwind) | Base UI para primitivos y Tailwind para estilos | Aceptada |
| [0005](./0005-postgres-and-drizzle) | PostgreSQL con Drizzle y un esquema por módulo | Aceptada |
| [0006](./0006-events-with-pg-boss) | Eventos y trabajos transaccionales con pg-boss | Aceptada |
| [0007](./0007-api-with-hono) | API con Hono y OpenAPI generado | Aceptada |
| [0008](./0008-own-data) | Datos propios antes que integraciones | Reemplazada por 0013 y 0014 |
| [0009](./0009-agents-mcp-and-policies) | Agentes con herramientas MCP y motor de políticas | Aceptada |
| [0010](./0010-email-only-notifications) | Notificaciones solo por email en el MVP | Reemplazada por 0017 |
| [0011](./0011-better-auth) | Better Auth con organizaciones | Propuesta |
| [0012](./0012-own-reservations-by-covers) | Reservas propias por ritmo de cubiertos | Diferida |
| [0013](./0013-signals-data-model) | Signals, métricas y scores en seis tablas | Aceptada |
| [0014](./0014-n8n-connectors-with-ingestion-api) | Conectores N8N que llaman a una API de ingesta | Aceptada |
| [0015](./0015-scoring-model) | Scores de engine: 60% medido, 40% práctica | Aceptada |
| [0016](./0016-three-surfaces-and-package-access) | Tres superficies y acceso por paquete | Aceptada |
| [0017](./0017-twilio-email-and-sms) | Twilio para email y SMS | Aceptada |
| [0018](./0018-no-review-gating) | El pedido de reseña nunca se filtra por calificación | Aceptada |

Para escribir uno nuevo, ver [Cómo escribir un ADR](../guides/write-an-adr).
