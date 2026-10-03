---
sidebar_position: 2
title: "Stack"
description: "Cada tecnología elegida, por qué y qué se descartó."
---

# Stack *tecnológico*

Cada elección tiene su ADR con el contexto completo.

| Capa | Elección | Por qué | Descartado | ADR |
| --- | --- | --- | --- | --- |
| Lenguaje | TypeScript estricto | Tipos de punta a punta, del esquema a la pantalla | — | — |
| Repositorio y runtime | Bun (workspaces) + Turborepo | Un binario para instalar, ejecutar y probar; Turborepo orquesta y cachea | pnpm + Node | [0002](../adr/0002-bun-and-turborepo) |
| Arquitectura | Monolito modular | Un despliegue, módulos aislados y separables | Microservicios | [0001](../adr/0001-modular-monolith) |
| Límites | dependency-cruiser en CI | El build falla si un módulo importa a otro | Revisión manual | [0001](../adr/0001-modular-monolith) |
| Base de datos | PostgreSQL gestionado (Supabase) | Transacciones, esquema por módulo, RLS como segunda defensa, particiones mensuales para signals | Neon | [0005](../adr/0005-postgres-and-drizzle) |
| Modelo de datos | Signals, metrics y scores en seis tablas | Un átomo, grano diario; cada pantalla lee rollups construidos | Tablas por fuente | [0013](../adr/0013-signals-data-model) |
| Scoring | 60% medido + 40% práctica, benchmark de 10 millas | Cuantitativo y cualitativo en un solo número | Solo medido | [0015](../adr/0015-scoring-model) |
| Acceso a datos | Drizzle ORM + migraciones SQL | Tipos del esquema, SQL legible, driver para Bun SQL | Prisma | [0005](../adr/0005-postgres-and-drizzle) |
| Conectores | Workflows de N8N + una API de ingesta | Rápidos de construir y cambiar por proveedor; la validación y el aislamiento quedan en código | Escrituras directas a la base, conectores propios por proveedor | [0014](../adr/0014-n8n-connectors-with-ingestion-api) |
| API | Hono + zod-openapi sobre Bun | Nativo en Bun, OpenAPI generado, cliente tipado | Rutas API de Next.js | [0007](../adr/0007-api-with-hono) |
| Eventos y trabajos | pg-boss + worker | Encolar en la misma transacción; reintentos y programación sin otro proveedor | QStash, Inngest | [0006](../adr/0006-events-with-pg-boss) |
| Superficies web | Next.js 16 para Platform, Manager y Hub | Versión actual con soporte; Next.js 15 sale de soporte de seguridad el 21 oct 2026 | Next.js 15, SPA pura | [0003](../adr/0003-nextjs-16) |
| Mobile | Expo (React Native) | Un solo equipo, tipos y cliente de API compartidos, distribución por tiendas | Apps nativas, una PWA | [0016](../adr/0016-three-surfaces-and-package-access) |
| UI | Base UI + Tailwind v4 + tokens de marca | Primitivos sin estilos, estables desde v1; la marca se aplica con Tailwind | Radix directo | [0004](../adr/0004-base-ui-and-tailwind) |
| Gráficos y mapas | Gráficos SVG a medida, MapLibre con tiles de CARTO | Gráficos fieles a la marca; el mapa de awareness necesita zonas, no un GIS completo | Suites de gráficos | — |
| Datos en pantalla | TanStack Query | Caché y estados de carga consistentes | fetch suelto | — |
| Auth | Better Auth con organizaciones | Usuarios, organizaciones, roles e invitaciones en nuestra base | Clerk, Supabase Auth | [0011](../adr/0011-better-auth) |
| Mensajería | Twilio para email y SMS, React Email para plantillas | Un solo proveedor para cada envío, con webhooks para aperturas, clics y bajas | Resend, una plataforma de campañas | [0017](../adr/0017-twilio-email-and-sms) |
| POS | Toast (exportación nocturna o API) | El sistema de registro de los outcomes de los restaurantes objetivo | Plataformas unificadas de POS | [0013](../adr/0013-signals-data-model) |
| Datos sociales | Metricool | Un feed para IG, FB, TikTok y YouTube, con filas por post | APIs por red | [0014](../adr/0014-n8n-connectors-with-ingestion-api) |
| Agentes | MCP (SDK TypeScript) + motor de políticas + Claude | Herramientas como única puerta, reglas en código | Acceso directo a API o base | [0009](../adr/0009-agents-mcp-and-policies) |
| Hosting | Vercel (web) + Railway (API, worker, agentes, N8N) | El worker y N8N necesitan procesos siempre encendidos | Todo serverless | — |
| Observabilidad | Sentry + logs estructurados (pino) | Errores, trabajos fallidos, frescura de conectores y tiempos con el client en cada log | — | — |
| Calidad | Biome, bun test, Playwright, k6, axe, evals | Pruebas contra Postgres real; evals por agente | ESLint + Prettier | — |
