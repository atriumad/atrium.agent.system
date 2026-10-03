---
id: 0015-scoring-model
sidebar_position: 16
title: "0015 · Scores de engine: 60% medido, 40% práctica"
sidebar_label: "0015 · Scores de engine: 60% medido, 40% práctica"
description: "Scores de engine: 60% medido, 40% práctica"
---

# ADR 0015: Scores de engine: 60% medido, 40% práctica

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Un solo número debe ser justo con un restaurante de cualquier tamaño y honesto sobre lo que ninguna API puede reportar. El volumen bruto favorece a los locales grandes; un score solo medido ignora la calidad de la práctica.

## Decisión

Cada engine puntúa de 0 a 100: 60% medido, cada métrica normalizada contra el benchmark del radio de 10 millas como `min(tú ÷ bench, 2) ÷ 2 × 100`, más 40% práctica, criterios calificados de 0 a 4 por agentes con una rúbrica fija y renovados cada semana. El Growth Score son los cinco scores de engine con el mismo peso, 0–300, mostrado junto a la misma mezcla del radio. Los pesos son editables por engine y se calibran con los primeros 5 clients.

## Consecuencias

- Los scores comparan a un restaurante con su propio barrio, no con un promedio nacional.
- Los criterios de práctica hacen que el score refleje el trabajo además del resultado.
- Los agentes tienen un trabajo preciso: calificar una rúbrica con evidencia.
- Necesita una fuente de benchmark y un tamaño mínimo de muestra ([decisión abierta](../plan/open-decisions)).

## Alternativas descartadas

- Solo medido: ciego a la calidad de ejecución.
- Objetivos absolutos: injusto entre tamaños de local.
- Un compuesto 0–100: pierde la vista por engine que usan el equipo y el client.
