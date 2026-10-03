---
sidebar_position: 4
title: "Crear un módulo"
description: "Pasos para agregar un módulo con su forma estándar."
---

# Crear un *módulo*

1. **Escribe primero la página del módulo** en `docs/modules/` con: qué hace, entradas, entidades, estados, herramientas MCP y eventos.
2. **Crea la carpeta** con la [forma estándar](../architecture/repository): `domain/`, `application/`, `infra/`, `http/`, `jobs/`, `mcp/`, `agents/`, `migrations/`, `tests/`.
3. **Define el esquema** de Postgres con el nombre del módulo y su primera migración. Toda tabla lleva `client_id`.
4. **Escribe el dominio** con pruebas antes que la infraestructura.
5. **Expón los casos de uso** por `http/` y `mcp/`; nunca lógica en esas capas.
6. **Declara los eventos** que publica en `@atrium/contracts` con versión y ejemplos.
7. **Registra el feature flag** del módulo en Core y ubícalo en la [matriz de acceso](../product/packages-and-access).
8. **Agrega las reglas de dependencias**: el módulo no puede importar otros módulos.
9. **Registra sus métricas** en el registro de métricas, si produce alguna ([Agregar una métrica](./add-a-metric)).
10. **Monta las rutas** en `apps/api` y los consumidores en `apps/worker`.
11. **Cumple la [definición de hecho](./definition-of-done)** antes de abrir el pull request final.
