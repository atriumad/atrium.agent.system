---
id: 0016-three-surfaces-and-package-access
sidebar_position: 17
title: "0016 · Tres superficies y acceso por paquete"
sidebar_label: "0016 · Tres superficies y acceso por paquete"
description: "Tres superficies y acceso por paquete"
---

# ADR 0016: Tres superficies y acceso por paquete

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Los dueños, el equipo de la agencia y el dueño en movimiento necesitan vistas distintas de los mismos datos. Lo que ve un client depende del paquete que compró.

## Decisión

Tres superficies sobre una API y un modelo de datos: la Platform (Next.js, el client), el Manager (Next.js, la agencia) y Mobile (Expo, el dueño). El acceso se calcula una vez en Core desde el paquete y el rol y lo leen todas las superficies y el gateway MCP. Las secciones bloqueadas siguen visibles con un teaser y siguen ingiriendo datos.

## Consecuencias

- Cada superficie es simple para su audiencia.
- Una sola respuesta de acceso: un módulo bloqueado tampoco tiene herramientas para agentes.
- Desbloquear es instantáneo porque los datos ya están ahí.
- Tres apps que mantener; se mitiga con tipos, cliente de API y `@atrium/ui` compartidos.

## Alternativas descartadas

- Una sola app con roles: las experiencias de agencia y de client tiran en direcciones distintas.
- Una PWA en vez de nativa: push y presencia en tiendas más débiles para los dueños.
- Apps nativas: dos bases de código más para un equipo pequeño.
