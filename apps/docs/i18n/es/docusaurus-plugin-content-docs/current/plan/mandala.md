---
sidebar_position: 4
title: "Mandala 9×9"
description: "Una meta, ocho pilares, 64 tareas."
---

# Una meta, ocho pilares, *64 tareas*

El centro es la meta: **el sistema completo, en vivo para toda la cartera el 30 de abril de 2027**. Cada pilar se abre en ocho tareas con su fase. El tablero interactivo con progreso compartido vive en el Build Plan; esta página es la referencia.

| Pilar | Nombre | Tareas |
| --- | --- | --- |
| A | [Cimientos y calidad](#pilar-a) | 8 |
| B | [Core de negocio](#pilar-b) | 8 |
| C | [Columna de datos](#pilar-c) | 8 |
| D | [Conectores](#pilar-d) | 8 |
| E | [Platform](#pilar-e) | 8 |
| F | [Agency OS](#pilar-f) | 8 |
| G | [Agentes y MCP](#pilar-g) | 8 |
| H | [Piloto, Mobile y lanzamiento](#pilar-h) | 8 |

## Pilar A · Cimientos y calidad {#pilar-a}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| A1 | Repo nuevo con Bun y Turborepo | <span className="pill pill--f0">F0</span> | Workspaces de Bun con apps, modules y packages; scripts comunes de build, test y lint. |
| A2 | Convenciones y ADRs | <span className="pill pill--f0">F0</span> | TS strict, Biome, nombres, estructura de módulo y las primeras decisiones escritas. |
| A3 | Límites con dependency-cruiser | <span className="pill pill--f0">F0</span> | El build falla si un módulo importa a otro o si domain toca la base de datos. |
| A4 | CI/CD con previews | <span className="pill pill--f0">F0</span> | GitHub Actions: tipos, lint, pruebas y migraciones en cada PR; preview por rama. |
| A5 | Entornos dev, staging y prod | <span className="pill pill--f0">F0</span> | Base, API, worker, N8N y frontends separados por entorno, con secretos gestionados. |
| A6 | Esqueleto de API con Hono en Bun | <span className="pill pill--f0">F0</span> | Rutas por módulo, validación con Zod, OpenAPI generado y cliente tipado. |
| A7 | @atrium/ui con tokens de marca | <span className="pill pill--f0">F0</span> | Primitivos de Base UI con estilos de marca en Tailwind v4, modo oscuro y los primitivos de gráficos. |
| A8 | Monitoreo, logs y harness de pruebas | <span className="pill pill--f0">F0</span> | Sentry, logs estructurados con el client en cada línea, y la base de pruebas de contrato, aislamiento y casos dorados. |

## Pilar B · Core de negocio {#pilar-b}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| B1 | Auth con organizaciones | <span className="pill pill--f0">F0</span> | Better Auth: login, organizaciones, invitaciones y sesiones. |
| B2 | Clients, locations y roles | <span className="pill pill--f0">F0</span> | Agencia admin, Account Manager, staff de agencia con team roles, dueño y staff del restaurante. |
| B3 | Aislamiento entre clients | <span className="pill pill--f0">F0</span> | Repositorios que exigen el client, más RLS como segunda defensa, con pruebas en cada tabla. |
| B4 | Identidad única de guest | <span className="pill pill--f0">F0</span> | Un guest por client con email y teléfono normalizados y los identificadores que usa el stitching. |
| B5 | Registro de consentimientos | <span className="pill pill--f0">F0</span> | Consentimiento por canal y propósito, con fecha, origen del opt-in y baja. |
| B6 | Cola de eventos con pg-boss | <span className="pill pill--f0">F0</span> | Encolar en la misma transacción; worker con reintentos y trabajos programados. |
| B7 | @atrium/contracts con Zod | <span className="pill pill--f0">F0</span> | Esquemas versionados de eventos, filas de signal y requests públicos. |
| B8 | Paquetes y feature flags | <span className="pill pill--f0">F0</span> | La matriz de acceso publicada como flags por módulo y local; una sola respuesta para todas las superficies. |

## Pilar C · Columna de datos {#pilar-c}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| C1 | Esquema de signals y particiones | <span className="pill pill--f0">F0</span> | Las seis tablas, particiones mensuales para `signals_daily`, pruebas de aislamiento. |
| C2 | API de ingesta | <span className="pill pill--f0">F0</span> | Validada, idempotente sobre la clave natural, tokens acotados por conector, rechaza signal types desconocidos. |
| C3 | Registro de métricas y rollups | <span className="pill pill--f1">F1</span> | El inventario como datos; `metrics_daily` reconstruida de forma idempotente desde las signals. |
| C4 | @atrium/scoring | <span className="pill pill--f1">F1</span> | Normalización contra el benchmark, la mezcla 60/40 y el Growth Score, como funciones puras con casos dorados. |
| C5 | Benchmarks | <span className="pill pill--f1">F1</span> | `benchmarks_monthly` con tamaño de muestra; solo agregados; nulable por métrica. |
| C6 | Agent grades | <span className="pill pill--f1">F1</span> | `agent_grades` con evidencia y la corrección del Account Manager. |
| C7 | Daily entry manual y hoja mensual | <span className="pill pill--f1">F1</span> | Secciones de carga por paquete, con sello de hora, que escriben signals con `source = manual`; la hoja mensual como importación. |
| C8 | Frescura y alertas | <span className="pill pill--f1">F1</span> | Último sync exitoso por fuente, alertas de datos viejos, conteo de filas rechazadas. |

## Pilar D · Conectores {#pilar-d}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| D1 | Entorno de N8N | <span className="pill pill--f1">F1</span> | N8N alojado por entorno; workflows exportados al repo; secretos en el gestor. |
| D2 | Toast | <span className="pill pill--f1">F1</span> | Exportación nocturna primero; órdenes, revenue, guests, ticket medio, visitas repetidas, lealtad. |
| D3 | Metricool | <span className="pill pill--f1">F1</span> | Métricas de IG, FB, TikTok y YouTube con filas por post cada 6 horas. |
| D4 | Google Business Profile | <span className="pill pill--f1">F1</span> | Acciones del perfil, búsquedas, reseñas y ranking local, diaria. |
| D5 | Meta Ads | <span className="pill pill--f1">F1</span> | Gasto, impresiones, alcance, clics y conversiones por campaña y ad set. |
| D6 | Google Ads | <span className="pill pill--f1">F1</span> | Gasto, impresiones, clics y conversiones por campaña. |
| D7 | Twilio | <span className="pill pill--f4">F4</span> | Envíos de email y SMS, aperturas, clics, entregas, bajas y webhooks. |
| D8 | Rank tracker y encuesta de marca | <span className="pill pill--f2">F2</span> | Posición en Maps de las keywords del client; la encuesta de marca trimestral importada por zona. |

## Pilar E · Platform {#pilar-e}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| E1 | Shell de la Platform | <span className="pill pill--f2">F2</span> | Navegación, selector de local, rango de fechas, interruptor del radio, exportación, línea de frescura y estados bloqueados. |
| E2 | Dashboard | <span className="pill pill--f2">F2</span> | Growth Score, scores de engine, mapa de brand awareness, momentum, logros y el guest journey. |
| E3 | Discoverability y el hub | <span className="pill pill--f2">F2</span> | Setup readiness, listings, GBP actions; el hub y sus botones como signals. |
| E4 | Attention | <span className="pill pill--f2">F2</span> | Attention score, cómo te encontró la gente, contenido que te hizo ver, channel a etapa a outcome. |
| E5 | Reputation y el flujo de encuestas | <span className="pill pill--f2">F2</span> | Rating, velocidad, el feed de reseñas, la encuesta por QR y link, el botón de reseña para todos. |
| E6 | Attribution | <span className="pill pill--f4">F4</span> | Stitching, métodos, channel mix y costo por acción; estimaciones etiquetadas. |
| E7 | Retention y Growth | <span className="pill pill--f4">F4</span> | Guestbook, segmentos, automatizaciones, cohortes; programas, ofertas y ritmo del presupuesto. |
| E8 | Benchmarks, Reporting y Settings | <span className="pill pill--f6">F6</span> | Las barras del radio, el report builder con la narrativa, el archivo, fuentes y equipo. |

## Pilar F · Agency OS {#pilar-f}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| F1 | Shell del Manager y vistas por rol | <span className="pill pill--f3">F3</span> | Navegación, "view as" un rol, búsqueda, nuevo contenido. |
| F2 | Cartera y workspace por client | <span className="pill pill--f3">F3</span> | Salud, roster, needs attention, launching this week; un client con ciclo, contenido y fuentes. |
| F3 | Client COG | <span className="pill pill--f3">F3</span> | Equipo, alcance por grupo, calendario del ciclo, topes, guardrails, reglas semanales, tech stack, fechas, bitácora de cambios. |
| F4 | Base de tareas y disparo del ciclo | <span className="pill pill--f3">F3</span> | El Account Manager dispara el ciclo desde el COG; vistas por persona, proyecto y etapa. |
| F5 | Módulo content y tablero | <span className="pill pill--f3">F3</span> | Ocho estados, responsables, formatos, etiquetas con topes, tickets y comentarios. |
| F6 | Studio | <span className="pill pill--f3">F3</span> | Calendario de publicaciones, ready to post, líneas de tiempo de lotes, pendientes del día y email. |
| F7 | Aprobaciones entre superficies | <span className="pill pill--f3">F3</span> | Una sola cola leída por el Manager, la Platform y, más adelante, Mobile. |
| F8 | Daily entry, estado de datos y capacidad | <span className="pill pill--f3">F3</span> | La UI del registro manual, la matriz de integraciones por client y la vista de capacidad del equipo. |

## Pilar G · Agentes y MCP {#pilar-g}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| G1 | Manifiesto de agente versionado | <span className="pill pill--f0">F0</span> | Herramientas, niveles, límites, reglas "nunca" y escalamiento de cada subagente, en el repo. |
| G2 | Motor de políticas | <span className="pill pill--f0">F0</span> | Decide en cada llamada: ejecuta, pide aprobación o rechaza. |
| G3 | Gateway MCP con identidad por agente | <span className="pill pill--f0">F0</span> | Cada subagente se identifica y solo ve las herramientas de su manifiesto y de su paquete. |
| G4 | Registro de auditoría | <span className="pill pill--f0">F0</span> | Cada llamada con entrada y salida enmascaradas, decisión, aprobador y costo. |
| G5 | Harness de evals | <span className="pill pill--f5">F5</span> | Casos dorados, límites, reglas `never`, inyección de prompts y casos de datos faltantes, corridos en CI. |
| G6 | Scorekeeper y practice grades | <span className="pill pill--f5">F5</span> | Grades semanales de los subagentes observadores; scores de engine y el Growth Score. |
| G7 | Echo, Ask y Sentiment | <span className="pill pill--f5">F5</span> | Borradores de respuesta con aprobación, pedidos de reseña a todos, temas. |
| G8 | Narrator y Strategist | <span className="pill pill--f5">F5</span> | La narrativa mensual para que la edite el strategist; el MAP y el roadmap de 90 días. |

## Pilar H · Piloto, Mobile y lanzamiento {#pilar-h}

| # | Tarea | Fase | Detalle |
| --- | --- | --- | --- |
| H1 | Elegir 1–2 clients piloto | <span className="pill pill--f1">F1</span> | Restaurantes con Toast y un perfil de Google activo. |
| H2 | Incorporar y conectar fuentes | <span className="pill pill--f2">F2</span> | COG escrito, tech stack conectado o marcado pendiente, registro 10DLC iniciado. |
| H3 | App Mobile | <span className="pill pill--f6">F6</span> | App de Expo sobre la misma API: las cinco pestañas, aprobaciones, solicitudes y opt-in de push. |
| H4 | Despliegue del hub y los QR | <span className="pill pill--f2">F2</span> | Links del hub en GBP e Instagram; QR de encuesta en mesas y recibos. |
| H5 | Capacitar al equipo | <span className="pill pill--f3">F3</span> | Sesiones cortas para cada rol sobre el Manager y para el dueño sobre la Platform. |
| H6 | Dos semanas de piloto | <span className="pill pill--f3">F3</span> | Uso real con seguimiento diario en la Platform y el Manager. |
| H7 | Revisión de métricas y calibración | <span className="pill pill--f6">F6</span> | Pesos y objetivos calibrados con los primeros 5 clients; tamaños de muestra de benchmarks revisados. |
| H8 | Lanzamiento y migración de la cartera | <span className="pill pill--f6">F6</span> | Cada client incorporado, cada fuente conectada o pendiente, el reporting anterior retirado. |
