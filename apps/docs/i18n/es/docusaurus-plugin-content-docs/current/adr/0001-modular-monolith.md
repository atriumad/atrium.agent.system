---
id: 0001-modular-monolith
sidebar_position: 2
title: "0001 · Monolito modular con límites verificados"
sidebar_label: "0001 · Monolito modular con límites verificados"
description: "Monolito modular con límites verificados"
---

# ADR 0001: Monolito modular con límites verificados

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Atrium construye una plataforma con cinco engines, tres superficies y muchos agentes, con un equipo pequeño. Cada módulo debe poder evolucionar sin romper a los demás, y algunos podrían necesitar escalar por separado en el futuro.

## Decisión

Un solo sistema desplegable dividido en módulos (`modules/*`) con su propio esquema de base de datos, API, eventos y herramientas MCP. Los módulos solo se comunican por eventos y por las APIs públicas de Core y `signals`. dependency-cruiser en CI rompe el build si un módulo importa a otro.

## Consecuencias

- Un despliegue, una base, una forma de observar: operación simple para un equipo pequeño.
- Cada módulo se puede extraer a un servicio sin reescribir su lógica.
- Requiere disciplina en los contratos de eventos; la cubre CI.

## Alternativas descartadas

- Microservicios: demasiada operación (redes, despliegues, observabilidad distribuida) para el tamaño del equipo.
- Monolito sin límites: rápido al inicio, acopla los agentes y hace caro cada cambio.
