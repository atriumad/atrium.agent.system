---
id: 0006-events-with-pg-boss
sidebar_position: 7
title: "0006 · Eventos y trabajos transaccionales con pg-boss"
sidebar_label: "0006 · Eventos y trabajos transaccionales con pg-boss"
description: "Eventos y trabajos transaccionales con pg-boss"
---

# ADR 0006: Eventos y trabajos transaccionales con pg-boss

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Los módulos se comunican por eventos. Un evento no puede perderse si el cambio ocurrió, ni existir si el cambio falló. Los rollups, el scoring, la generación de reportes y los envíos son trabajos programados.

## Decisión

pg-boss como cola en el mismo Postgres. Los eventos se encolan dentro de la transacción del cambio. Un worker (`apps/worker`) entrega con reintentos exponenciales y corre los trabajos programados; los consumidores son idempotentes.

## Consecuencias

- Garantía transaccional sin patrón outbox aparte.
- Sin proveedor adicional.
- El worker necesita un proceso siempre encendido (Railway).

## Alternativas descartadas

- QStash o Inngest: otro proveedor y sin transacción compartida.
- Redis/BullMQ: otra base que operar.
