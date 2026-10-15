---
id: 0008-own-data
sidebar_position: 9
title: "0008 · Datos propios antes que integraciones"
sidebar_label: "0008 · Datos propios antes que integraciones"
description: "Datos propios antes que integraciones"
---

# ADR 0008: Datos propios antes que integraciones

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Reemplazada por 0013 y 0014** | 2026-10-01 | Atrium · producto y tecnología |

:::note
Reemplazada. El material de origen muestra que el sistema existe para leer Toast, Metricool, Resend, Google y las plataformas de ads. El modelo ahora es una cadena de signals con conectores ([0013](./0013-signals-data-model), [0014](./0014-n8n-connectors-with-ingestion-api)), con respaldo manual y la exportación nocturna de Toast como primera ruta, lo que conserva la parte de esta decisión que importaba: ningún número depende de la aprobación de un solo proveedor.
:::

## Contexto

El acceso estándar a la API de Toast es solo lectura y no entrega datos del comensal en pedidos de salón; el programa de partners toma meses. Las plataformas de reservas no tienen API pública de escritura.

## Decisión

El sistema generaba sus propios datos primero (reservas, encuestas, QR, walk-ins, clics) y dejaba las integraciones de POS para después.

## Consecuencias

- Sin dependencia de aprobaciones de terceros para lanzar.
- Las métricas de revenue dependían de que el client importara ventas.

## Alternativas descartadas

- Toast partner desde el inicio: meses de espera antes de entregar valor.
