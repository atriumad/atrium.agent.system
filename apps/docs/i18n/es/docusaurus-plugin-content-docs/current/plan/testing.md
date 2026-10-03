---
sidebar_position: 3
title: "Estrategia de pruebas"
description: "Qué prueba cada nivel y cuándo pasa."
---

# Estrategia de *pruebas*

Las pruebas corren en CI en cada pull request; las de carga y el piloto corren antes de cada puerta.

| Nivel | Herramienta | Qué prueba | Criterio para pasar |
| --- | --- | --- | --- |
| Arquitectura | dependency-cruiser | Ningún módulo importa a otro; `domain/` sin IO | 0 violaciones |
| Unitarias | bun test | Scoring, normalización, fórmulas, estados, reglas, casos de uso | Cobertura ≥ 90% en `@atrium/scoring` y en las fórmulas de métricas |
| Contrato | bun test + Zod + OpenAPI | Eventos, endpoints y filas de signal cumplen su esquema | Todo con ejemplo válido e inválido |
| Conectores | Fixtures grabados por proveedor | Cada conector mapea el payload del proveedor a filas de signal | Los fixtures reproducen las filas esperadas; un payload que cambia rompe el build |
| Calidad de datos | bun test + Postgres en Docker | La ingesta es idempotente; los rollups se reproducen; sin conteos negativos ni duplicados | 0 discrepancias entre una nueva corrida y la primera |
| Scoring | Casos dorados | Entradas conocidas dan scores de engine y Growth Score conocidos | Los scores coinciden exactamente con la tabla dorada |
| Aislamiento | bun test + Postgres en Docker | Un client nunca ve datos de otro, incluidas signals, scores y benchmarks | 0 filas visibles entre clients |
| Integración | bun test + Postgres en Docker | API, cola y worker contra base real | Cada endpoint con caso feliz y de error |
| Agentes | Evals por subagente | Casos dorados, límites, reglas `never`, inyección de prompts | 100% de reglas `never` respetadas |
| Extremo a extremo | Playwright (móvil y escritorio) | Filtros del dashboard, secciones bloqueadas, encuesta por QR y link, aprobación, avance de contenido, disparo del COG | Flujos críticos en verde en staging |
| Mobile | Maestro en un device farm | Inicio de sesión, pestañas, aprobar, opt-in de push | Flujos críticos en verde en iOS y Android |
| Rendimiento | k6 | Lecturas del dashboard sobre 90 días; throughput de ingesta; reconstrucción de rollups | Dashboard p95 < 2 s; un mes de signals de 10 locales reconstruido en < 60 s |
| Accesibilidad | axe + revisión manual | Platform, Manager, encuesta y hub con teclado y lector de pantalla | 0 errores críticos |
| Mensajes | React Email preview | Plantillas en Gmail, Outlook y Apple Mail; links de baja | Todos los links funcionan y vencen a tiempo |
| Aceptación | Piloto | Uso real durante 2 semanas | Sin incidentes graves; el equipo corre un ciclo sin ayuda externa |
