---
id: 0005-postgres-and-drizzle
sidebar_position: 6
title: "0005 · PostgreSQL con Drizzle y un esquema por módulo"
sidebar_label: "0005 · PostgreSQL con Drizzle y un esquema por módulo"
description: "PostgreSQL con Drizzle y un esquema por módulo"
---

# ADR 0005: PostgreSQL con Drizzle y un esquema por módulo

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Todos los módulos necesitan aislamiento por client y migraciones independientes; las tablas de signals crecen a diario y se leen sobre rangos de fechas arbitrarios.

## Decisión

PostgreSQL gestionado en Supabase. Un esquema por módulo. Drizzle ORM con migraciones SQL versionadas dentro de cada módulo. `signals_daily` particionada por mes. Repositorios que exigen `clientId` y RLS como segunda defensa.

## Consecuencias

- Transacciones para eventos y aprobaciones.
- Tipos generados desde el esquema.
- La matemática de rangos sobre filas diarias sigue siendo una consulta indexada simple.
- Supabase se usa como Postgres gestionado; la auth no depende de él.

## Alternativas descartadas

- Prisma: más pesado y con menos control del SQL.
- Neon: válido; se eligió Supabase por familiaridad del equipo.
- Un data warehouse analítico aparte: no hace falta a este volumen; se revisa si los rollups superan su presupuesto.
