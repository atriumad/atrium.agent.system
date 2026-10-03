---
id: 0012-own-reservations-by-covers
sidebar_position: 13
title: "0012 · Reservas propias por ritmo de cubiertos"
sidebar_label: "0012 · Reservas propias por ritmo de cubiertos"
description: "Reservas propias por ritmo de cubiertos"
---

# ADR 0012: Reservas propias por ritmo de cubiertos

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Diferida** | 2026-10-01 | Atrium · producto y tecnología |

:::note
Diferida. No es parte del plan actual. Ver [Booker](../modules/booker).
:::

## Contexto

OpenTable, Resy, SevenRooms y Tock no ofrecen API pública de escritura. La mayoría de restaurantes objetivo necesita reservar en línea sin gestionar mesas. El primer lanzamiento puede medir las reservas con clics en reservar y el POS.

## Decisión

Cuando se construya, Booker es un módulo propio que controla cubiertos por intervalo de 15 minutos con duración por tamaño de grupo y capacidad en línea configurable. Mapa de mesas, lista de espera y depósitos quedan para más adelante todavía.

## Consecuencias

- Camino más corto a un primer lanzamiento sin él.
- El mapa de mesas se suma sobre el mismo modelo.
- Los outcomes de reserva vienen de los clics en reservar y del POS hasta entonces.

## Alternativas descartadas

- Integrar plataformas existentes: solo vía programas de partners.
- Mapa de mesas desde el inicio: duplica el alcance.
