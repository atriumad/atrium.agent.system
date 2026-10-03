---
sidebar_position: 5
title: "Decisiones abiertas"
description: "Lo que hay que cerrar, incluidos los puntos donde el material de origen no coincide."
---

# Decisiones *para cerrar en la semana 0*

| # | Pregunta | Recomendación | Estado |
| --- | --- | --- | --- |
| 1 | ¿Cuántas personas construyen? | Un desarrollador con Claude Code: unas 30 semanas. Con dos: unas 20 | Abierta |
| 2 | ¿Qué engines? | Cinco: Discoverability, Acquisition, Reputation, Retention, Growth. El prototipo de la Platform llama "Attention" a Acquisition, titula Reputation como "part of Retention" y lista Reporting como engine; esta documentación lo trata como etiquetas de UI | Decidida, por confirmar |
| 3 | ¿Cómo se mapean los paquetes a los tiers? | Essential, Pillar 2 y Pillar 3 es lo que compra un client; Discover, Retain y Growth son agrupaciones de servicios. Los dos conjuntos no calzan uno a uno (Pillar 2 incluye Reputation, un servicio de Retain) | Abierta |
| 4 | ¿Retention está bloqueado en Pillar 2? | La matriz del Manager lo bloquea; el prototipo de la Platform lo desbloquea. Esta documentación sigue al Manager | Propuesta |
| 5 | Review gating | El flujo de origen envía a Google a los guests contentos. Corregido: todos reciben el link de reseña ([ADR 0018](../adr/0018-no-review-gating)) | Decidida |
| 6 | Nombres de los dos agentes nuevos | Concierge (Discoverability) y Steward (Growth) | Propuesta |
| 7 | ¿De dónde sale el benchmark de 10 millas? | La cartera sola es muy chica para un promedio de radio. Hace falta una fuente de datos, un método y un tamaño mínimo de muestra | Abierta |
| 8 | ¿Quién corre la encuesta de marca trimestral y cómo? | Hace falta un proveedor de panel, un costo y un método por zona | Abierta |
| 9 | ¿Cómo se estima el share of voice? | Con alcance y engagement locales rastreados; hace falta una lista de competidores por client y un método | Abierta |
| 10 | ¿Qué vista de atribución se publica? | Una de tres opciones de tabla (matriz de calor, barras segmentadas, rankings), tras revisarlas con clients | Abierta |
| 11 | Ruta de Toast | Exportación nocturna primero; el programa de partners en paralelo | Propuesta |
| 12 | ¿Dónde corren la API, el worker, los agentes y N8N? | Railway; Fly.io como alternativa | Propuesta |
| 13 | Distribución de Mobile | Expo, TestFlight y pruebas internas de Play primero | Propuesta |
| 14 | Umbrales de color del Growth Score | 80 y 60 por engine, escalados a 240 y 180 | Propuesta |
| 15 | Tokens de marca | El sistema de marca (deep teal, mint, cloud, amber, un wordmark en minúsculas) y el tema de producto usado aquí (ink, lime, cream) hay que reconciliarlos en `packages/ui` | Abierta |
| 16 | Motor de reservas propio | Diferido ([ADR 0012](../adr/0012-own-reservations-by-covers)) | Propuesta |
| 17 | ¿Qué restaurantes son el piloto? | 2 clients con Toast y un perfil de Google activo, elegidos en F1 | Abierta |
| 18 | Los prototipos | Los prototipos HTML de `guides-rules` son referencias de diseño, no código para portar | Propuesta |

## Trámites que empiezan en la semana 0

- [ ] Solicitud de acceso básico a la API de Google Business Profile
- [ ] Cuenta de Twilio y el registro de marca 10DLC de cada client piloto
- [ ] Exportación de Toast habilitada para los clients piloto y la postulación al programa de partners
- [ ] Acceso a la API de Metricool; acceso a las APIs de Meta y Google Ads y developer tokens
- [ ] Dominio de envío de email con SPF, DKIM y DMARC
- [ ] Cuentas de Vercel, Railway, Supabase y N8N para tres entornos
- [ ] Cuentas de Apple Developer y Google Play para la beta de Mobile
