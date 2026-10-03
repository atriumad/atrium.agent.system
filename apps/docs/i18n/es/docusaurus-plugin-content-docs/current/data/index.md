---
sidebar_position: 1
title: "Modelo de datos"
description: "Signal → metric → score: cómo se produce cada número en Atrium."
---

# Arquitectura de datos: *signal → metric → score*

Todo lo que muestra la plataforma es matemática sobre una sola cosa atómica: una **signal con sello diario**. Las signals vienen de fuentes, y de elementos individuales dentro de ellas. Las métricas se construyen a partir de signals, agrupadas por engine y etiquetadas por etapa del funnel. Cada engine mezcla medido y práctica en un score, y los cinco scores forman el Growth Score.

## El stack: cinco capas

Cada capa se construye solo con la de abajo.

| # | Capa | Pregunta | Qué es |
| --- | --- | --- | --- |
| 1 | **Fuentes y elements** | ¿Dónde se origina? | Plataformas y feeds: redes, GBP, el hub, POS, email y SMS, ads. Algunas traen elements individuales (un reel, un email, un ad, una oferta) a los que se atribuyen las signals |
| 2 | **Signals** | ¿Cuál es el evento individual, con sello diario? | El átomo: cada impresión, toque, orden, reseña y nota cae como una fila en `signals_daily` |
| 3 | **Metrics** | Signals, calculadas sobre un período | Una métrica son signals agregadas sobre un rango de fechas (sum, avg, rate, latest), mostradas como total, tendencia, proporción o comparación. "Impresiones en 30 días" es una métrica; la impresión es la signal |
| 4 | **Scores de engine** | Cuantitativo y cualitativo | Cinco engines, cada uno 0–100: 60% medido contra el benchmark y 40% práctica calificada por agentes |
| 5 | **Growth Score** | Un solo número | Los cinco scores de engine mezclados, 0–300, comparados con la misma mezcla del radio de 10 millas |

## Lo que nos dan las capas

| Operación | Da |
| --- | --- |
| `sum` | Totales sobre cualquier rango |
| `trend` | Serie diaria, sparklines y momentum |
| `rate` | a ÷ b: engagement rate, ROAS, conversión |
| `latest` | Valores puntuales: seguidores, rating, posición |
| `compare` | Contra el período anterior y contra el radio de 10 millas |
| `score` | Normalizar a 0–100 por engine |

7D, 30D, 90D y los rangos personalizados son la misma operación: filtrar `signals_daily` por fecha y luego agregar. No hay rangos pre-calculados en ninguna parte. Cada signal lleva su location, así que las cuentas con varios locales filtran primero y agregan después.

## En esta sección

- [Signals y fuentes](./signals-and-sources): la fila de signal, el enum, las fuentes, el hub, los elements.
- [Métricas y scoring](./metrics-and-scoring): etapas del funnel, vocabulario, el inventario de métricas por engine, scores, benchmarks, calificación de práctica.
- [Almacenamiento y pipeline](./storage-and-pipeline): las seis tablas, conectores, identity stitching, métodos de atribución.
- [Hoja mensual de signals](./manual-worksheet): el proceso manual que se mapea uno a uno con las columnas.
