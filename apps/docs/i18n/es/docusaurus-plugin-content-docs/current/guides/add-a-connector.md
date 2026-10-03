---
sidebar_position: 6
title: "Agregar un conector"
description: "Traer un proveedor nuevo a signals_daily."
---

# Agregar un *conector*

Un conector lleva los datos de un proveedor a `signals_daily`. Agregar uno nunca toca a los agentes ni a las pantallas.

1. **Escribe la fila de la fuente** en [Signals y fuentes](../data/signals-and-sources): qué emite, su cadencia y si trae elements.
2. **Mapea los campos del proveedor** a filas de signal. Cada campo se vuelve un `signal_type` del enum; si falta uno, agrega primero el tipo al enum y a la documentación.
3. **Construye el workflow de N8N** en `connectors/<proveedor>/`, con las credenciales del proveedor desde el gestor de secretos, y expórtalo al repo.
4. **Llama a la API de ingesta** con el token acotado del conector. El workflow nunca escribe en la base.
5. **Elige la clave natural** (`date`, `location_id`, `source`, `platform`, `element_id`, `signal_type`) para que una nueva corrida reemplace el día.
6. **Graba fixtures** de payloads reales en `connectors/<proveedor>/fixtures/` y escribe la prueba de contrato que los mapea a las filas esperadas.
7. **Registra la frescura:** informa el último sync exitoso para que la Platform y el Manager puedan mostrarlo.
8. **Escribe el respaldo manual:** qué sección del daily entry cubre las mismas signals.
9. **Actualiza las páginas:** [Integraciones](../architecture/integrations) y las filas de métricas que alimenta la fuente nueva.
