---
id: 0011-better-auth
sidebar_position: 12
title: "0011 · Better Auth con organizaciones"
sidebar_label: "0011 · Better Auth con organizaciones"
description: "Better Auth con organizaciones"
---

# ADR 0011: Better Auth con organizaciones

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Propuesta** | 2026-10-01 | Atrium · producto y tecnología |

## Contexto

Se necesitan usuarios, organizaciones (agencia y clients), roles, team roles e invitaciones, con los datos en nuestra base.

## Decisión

Better Auth con su plugin de organizaciones, sobre el mismo Postgres.

## Consecuencias

- Sin costo por usuario.
- Mantenimiento propio de la configuración de auth.

## Alternativas descartadas

- Clerk: costo por usuario.
- Supabase Auth: organizaciones a mano.
