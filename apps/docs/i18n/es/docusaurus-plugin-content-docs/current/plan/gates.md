---
sidebar_position: 2
title: "Puertas de fase"
description: "Criterios para pasar de una fase a la siguiente."
---

# Nada pasa de fase *sin cumplir su puerta*

## G0 · 30 oct · Cimientos listos

- [ ] Repo con Bun y Turborepo, CI/CD y 3 entornos (dev, staging, prod)
- [ ] Login con organizaciones, roles y team roles
- [ ] Aislamiento entre clients probado (repositorio y RLS), incluidas las tablas de signals
- [ ] La cola entrega eventos con reintentos e idempotencia
- [ ] Gateway MCP con políticas y auditoría, probado con una herramienta de ejemplo
- [ ] La API de ingesta acepta, valida y deduplica una fila de signal
- [ ] `@atrium/ui` con primitivos base y tokens de marca

## G1 · 27 nov · Datos fluyendo

- [ ] Toast, Metricool, Google Business Profile, Meta Ads y Google Ads caen en `signals_daily` para 2 clients
- [ ] Cada métrica del inventario resuelve a una fórmula, una unidad, una etapa y un engine
- [ ] Los rollups se reconstruyen de forma idempotente y reproducen los mismos números
- [ ] Los scores de engine y el Growth Score se calculan para 2 clients, con benchmarks que llevan tamaño de muestra
- [ ] La carga manual diaria cubre cada fuente, así que ningún número depende de un conector
- [ ] La frescura por fuente es visible, con una alerta cuando un conector se queda viejo

## G2 · 23 dic · Dashboard del cliente en vivo

- [ ] Dashboard, Discoverability, Attention y Reputation muestran datos reales para 2 clients
- [ ] El flujo de encuestas muestra el botón de reseña de Google a todos, sin importar la calificación
- [ ] El hub está en vivo y los toques de sus botones aparecen como signals
- [ ] Las secciones bloqueadas se muestran con su teaser
- [ ] E2E, accesibilidad y rendimiento en verde

## G3 · 29 ene · La agencia corre sobre el sistema

- [ ] El Manager muestra la cartera, los workspaces por client y la salud de cada client
- [ ] Un COG dispara las tareas del ciclo; tareas, tablero de contenido y estudio los puede usar cada rol
- [ ] El contenido avanza por los ocho estados, y una aprobación en la Platform llega al calendario
- [ ] El equipo corre un ciclo completo para los clients piloto sobre el sistema
- [ ] El daily entry escribe `signals_daily` con `source = manual`

## G4 · 5 mar · Dashboard del cliente completo

- [ ] Attribution con identity stitching: un escaneo de QR y la orden a la que llevó cuentan como un solo guest
- [ ] Cada dólar atribuido muestra su método; las estimaciones se etiquetan
- [ ] Email por Twilio con las bajas reflejadas en el registro de consentimientos; SMS habilitado para un client solo tras aprobarse su registro
- [ ] Programas de Growth, ofertas y ritmo del presupuesto
- [ ] Acceso por paquete aplicado en cada superficie y por el gateway MCP

## G5 · 26 mar · Primeros agentes en producción

- [ ] El harness de evals corre en CI y el 100% de las reglas `never` se cumple
- [ ] Scorekeeper y las practice grades producen los scores semanales
- [ ] Echo redacta respuestas que una persona aprueba; Ask envía pedidos de reseña a todos
- [ ] Narrator redacta la narrativa mensual; el strategist la edita
- [ ] El interruptor y los niveles de autonomía funcionan desde el Manager

## G6 · 30 abr · Sistema completo

- [ ] Benchmarks, Reporting, report builder y Settings en vivo
- [ ] La app Mobile está en los canales beta de las tiendas y lee los mismos datos
- [ ] Pesos calibrados con los primeros 5 clients
- [ ] Toda la cartera está incorporada, con cada fuente conectada o marcada como pendiente
