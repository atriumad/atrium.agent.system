---
sidebar_position: 9
title: "Definición de hecho"
description: "Cuándo un trabajo está terminado."
---

# Definición de *hecho*

Un trabajo está hecho cuando cumple todo lo que aplica:

- [ ] CI en verde: tipos, Biome, dependency-cruiser y pruebas
- [ ] Pruebas nuevas para la lógica nueva; `domain/` cubierto
- [ ] Migraciones probadas desde cero y sobre datos existentes
- [ ] Toda tabla nueva con `client_id` y prueba de aislamiento
- [ ] Contratos de eventos, signals y herramientas MCP con ejemplos válidos e inválidos
- [ ] Una métrica nueva tiene su fila en el registro, su caso dorado y su etiqueta
- [ ] Un conector nuevo tiene fixtures, frescura y respaldo manual
- [ ] Evals en verde si cambia un subagente
- [ ] Accesible con teclado y lector de pantalla si toca interfaz
- [ ] Logs con `clientId` y módulo; errores visibles en Sentry
- [ ] Documentación actualizada en los dos idiomas: página del módulo, eventos, herramientas, métricas o ADR
- [ ] Revisado por otra persona y probado en staging
