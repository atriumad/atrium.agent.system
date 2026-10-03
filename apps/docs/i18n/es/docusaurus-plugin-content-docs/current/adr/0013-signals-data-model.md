---
id: 0013-signals-data-model
sidebar_position: 14
title: "0013 · Signals, métricas y scores en seis tablas"
sidebar_label: "0013 · Signals, métricas y scores en seis tablas"
description: "Signals, métricas y scores en seis tablas"
---

# ADR 0013: Signals, métricas y scores en seis tablas

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Cada pantalla, cada score y cada agente necesita los mismos números. Las plataformas nombran y cuentan lo mismo de forma distinta, y un dashboard armado por fuente se contradiría a sí mismo. Los prototipos ya derivan todo de una sola fila atómica.

## Decisión

Un átomo: una signal con sello diario en `signals_daily`, opcionalmente atribuida a un element y a un guest unificado. Las métricas se construyen desde signals (sum, avg, rate, latest) en `metrics_daily`; los scores de engine y el Growth Score se construyen desde métricas y agent grades. Seis tablas: `signals_daily`, `metrics_daily`, `elements`, `benchmarks_monthly`, `agent_grades`, `scores_weekly`. Un enum canónico de `signal_type` y un nombre por métrica. Cada métrica lleva unidad, fórmula, etapa del funnel y engine.

## Consecuencias

- Una fuente nueva es un conector, no un esquema nuevo; los agentes y las pantallas no cambian.
- Cualquier rango (7, 30, 90 días, personalizado) es la misma consulta; no hay rangos pre-calculados.
- Los rollups se reconstruyen de forma idempotente, así que corregir una fórmula repara la historia.
- El grano diario es la resolución más fina; nada aguas abajo necesita más.

## Alternativas descartadas

- Una tabla por fuente: cada pantalla las une y los vocabularios se desvían.
- Dashboards pre-agregados: rápidos, pero un cambio de fórmula no se puede reproducir.
- Guardar cada impresión a nivel de evento: volumen sin uso.
