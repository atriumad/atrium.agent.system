---
id: 0004-base-ui-and-tailwind
sidebar_position: 5
title: "0004 · Base UI para primitivos y Tailwind para estilos"
sidebar_label: "0004 · Base UI para primitivos y Tailwind para estilos"
description: "Base UI para primitivos y Tailwind para estilos"
---

# ADR 0004: Base UI para primitivos y Tailwind para estilos

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

El tema de producto de Atrium (cream, ink, lime, amber; Inter Tight e Instrument Serif) está definido en tokens. Se necesitan componentes accesibles con control total del estilo, y los gráficos deben seguir la marca.

## Decisión

`@atrium/ui` construye los primitivos sobre Base UI (sin estilos, estable desde v1) y aplica la marca con Tailwind v4 a partir de `theme.css`. Las apps importan componentes de `@atrium/ui`; no reestilizan primitivos.

## Consecuencias

- Accesibilidad y comportamiento resueltos por Base UI; el aspecto es 100% de la marca.
- Una sola capa de primitivos para Platform, Manager y Hub.
- El hub y la encuesta toman colores y logo de cada restaurante sobre los mismos componentes.

## Alternativas descartadas

- Radix directo: menos control sobre la capa de primitivos.
- Librerías con estilos (MUI, Chakra): pelear contra estilos ajenos.
