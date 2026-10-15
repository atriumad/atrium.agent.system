---
sidebar_position: 10
title: "Mantener esta documentación"
description: "Dónde vive esta documentación y cómo se actualiza."
---

# Mantener esta *documentación*

Esta documentación es un sitio Docusaurus que vive en `apps/docs` del monorepo.

## Idiomas

El inglés es el idioma por defecto y vive en `docs/`. La traducción al español vive en `i18n/es/docusaurus-plugin-content-docs/current/` con los mismos nombres de archivo. Cuando cambia una página, se actualizan las dos.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `docs/system` | Modelo de negocio: engines, recorrido, servicios y paquetes, métricas y Growth Score, riesgos |
| `docs/agents` | Agentes, subagentes, autonomía, interacción, escenarios, reglas |
| `docs/data` | Signals, fuentes, métricas y scoring, almacenamiento y pipeline, la hoja manual |
| `docs/product` | Platform, Manager, Mobile, paquetes y acceso |
| `docs/architecture` | Principios, stack, repositorio, eventos, integraciones, agentes y MCP, seguridad |
| `docs/modules` | Especificación de cada módulo |
| `docs/plan` | Fases, puertas, pruebas, mandala y decisiones abiertas |
| `docs/adr` | Registro de decisiones |
| `docs/guides` | Cómo trabajar en el repositorio |

## Reglas

- **El código y la documentación cambian en el mismo pull request.** Si cambia un evento, un signal type, una métrica, una herramienta MCP o un manifiesto, cambia su página.
- **El glosario manda.** Un término nuevo se agrega al [glosario](../system/glossary) antes de usarse.
- **Diagramas en Mermaid** dentro del Markdown, para que se versionen con el texto.
- **Enlaces internos relativos.** El build falla si un enlace se rompe.

## Comandos

```bash
bun install
bun run docs:dev     # desde la raíz del repositorio: http://localhost:3000 con recarga (un idioma a la vez)
bun run docs:build   # genera el sitio estático en apps/docs/build para los dos idiomas y valida enlaces
bun run --filter @atrium/docs serve   # sirve el build localmente, con el selector de idioma
```
