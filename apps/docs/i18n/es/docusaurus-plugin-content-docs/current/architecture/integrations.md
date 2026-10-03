---
sidebar_position: 5
title: "Integraciones"
description: "Proveedores, cómo se conecta cada uno, su cadencia y su estado."
---

# *Integraciones*

El sistema existe para leer a estos proveedores. Cada uno se conecta con un workflow de N8N que llama a la API de ingesta (ver [Almacenamiento y pipeline](../data/storage-and-pipeline)), y cada conector tiene un respaldo manual.

## Proveedores

| Proveedor | Trae | Se conecta por | Cadencia | Respaldo |
| --- | --- | --- | --- | --- |
| Toast POS | Órdenes, revenue, guests, ticket medio, visitas repetidas, miembros de lealtad, redenciones. El sistema de registro de los outcomes | Exportación nocturna por SFTP, o la API de partner cuando se apruebe el programa | cada 4 h (API) o nocturna (exportación) | Daily entry e importación CSV |
| Metricool | Métricas de IG, FB, TikTok y YouTube con filas por post | API de Metricool | cada 6 h | Hoja mensual de signals |
| Google Business Profile | Acciones del perfil, búsquedas, reseñas, posición en Maps | API de GBP (acceso básico solicitado en la semana 0) | diaria | Registro manual de llamadas, indicaciones y reseñas |
| Twilio | Envíos, aperturas, clics, entregas, altas y bajas y revenue atribuido de email y SMS | API de Twilio y webhooks | 4 h + webhooks | Reporte de campañas copiado a mano |
| Meta Ads | Gasto, impresiones, alcance, clics, conversiones, CPM, CPC | Marketing API | diaria | Daily entry |
| Google Ads | Gasto, impresiones, clics, conversiones, costo por acción | Google Ads API | diaria | Daily entry |
| Atrium Landing (hub) | Sesiones del hub y cada toque de botón | First-party, directo a la API | tiempo real | — |
| Survey Flow | Notas post-orden, altas por QR | First-party, directo a la API | tiempo real | — |
| Plataformas de reseñas | Reseñas, puntos de rating, respuestas y demora de respuesta | API de GBP, Yelp, scrape donde no hay API | diaria | Registro manual |
| Rank tracker | Posición en Maps de las keywords del client | API del rank tracker | diaria | Carga manual de keyword rank |
| Encuesta de marca (trimestral) | Awareness espontáneo por zona | Panel de encuestas, importado | trimestral | — |

## Reglas

- **Normalizado.** Cada conector escribe filas de `signals_daily` con la misma forma. Agregar una fuente es escribir un workflow, nunca tocar a los agentes.
- **Idempotente.** Una nueva corrida reemplaza el día; nada se cuenta doble.
- **Observable.** Cada conector informa su último sync exitoso; la Platform lo muestra ("synced via N8N: Toast 22 m, Metricool 1 h…") y el Manager marca una fuente como syncing o needs attention.
- **Mínimo privilegio.** Los conectores solo guardan las credenciales de los clients que atienden, en el gestor de secretos de la plataforma.
- **Respaldo.** Cuando un conector falla, el Account Manager carga los números a mano por el daily entry, con `source = manual`.

## Restricciones de terceros

| Proveedor | Restricción | Qué hacer |
| --- | --- | --- |
| Toast | El acceso estándar a la API es solo lectura y no devuelve datos del comensal en pedidos de salón; la ruta completa exige el programa de partners, que toma meses | Empezar con la exportación nocturna; postular al programa de partners en paralelo |
| Plataformas de reservas (OpenTable, Resy, SevenRooms, Tock) | Sin API pública de escritura | Medir con clics en reservar y links UTM |
| SMS | Cada restaurante es una marca 10DLC aparte, con costo y 1–4 semanas de espera | Registrar en el onboarding; el SMS se activa solo con la aprobación |
| Google Business Profile | El acceso a la API requiere una solicitud | Pedir acceso básico en la semana 0 |

## Fuentes consultadas

- [Toast · Standard API access FAQs](https://doc.toasttab.com/doc/devguide/devApiAccessFAQs.html)
- [Toast · Data exports overview](https://support.toasttab.com/en/article/Automated-Nightly-Data-Export-1492723819691)
- [Google Business Profile APIs · Prerequisites](https://developers.google.com/my-business/content/prereqs)
- [A2P 10DLC costos y plazos (Tuco, 2026)](https://tuco.ai/a2p-10dlc)
