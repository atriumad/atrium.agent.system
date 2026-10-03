---
sidebar_position: 7
title: "Agregar una métrica"
description: "Poner un número nuevo en una pantalla de la forma correcta."
---

# Agregar una *métrica*

Todo número que muestre una pantalla debe resolver a una fila del [inventario de métricas](../data/metrics-and-scoring). Nada se calcula en un componente.

1. **Revisa el vocabulario.** Si la métrica ya existe con otro nombre, usa el canónico. Nunca publiques un sinónimo.
2. **Define la fila:** `id`, `label` canónica, `unit`, `formula` sobre signal types, `funnel_stage`, `engine`, `cadence` y si existe por element.
3. **Agrega los signal types** que necesita al enum, si hace falta, antes de publicarlos.
4. **Decide el benchmark.** Si hay un benchmark de 10 millas, di de dónde sale; si no, la métrica se muestra sin la marca ámbar y queda fuera de la mitad medida del score.
5. **Decide su papel en el score.** A la mitad medida de qué engine se une y con qué peso; o es solo de visualización.
6. **Agrega el caso dorado** de la fórmula en `@atrium/scoring` o en las pruebas de métricas, con números reales.
7. **Etiqueta las estimaciones.** Si alguna parte es una estimación, guarda su método.
8. **Actualiza la documentación** en los dos idiomas, y la hoja mensual si el número se puede recolectar a mano.
