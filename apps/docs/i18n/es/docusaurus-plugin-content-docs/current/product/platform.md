---
sidebar_position: 2
title: "Platform"
description: "El dashboard web del client: secciones, qué muestra cada una y la fase de construcción de cada una."
---

# Platform: el *Growth OS* del client

La Platform es donde el restaurante ve su crecimiento: el mapa, el score y lo que lo mueve. Tiene un selector de local, un rango de fechas (7, 30, 90 días o personalizado), un interruptor para comparar con el radio de 10 millas, exportación y una línea "synced via N8N" que muestra la frescura de cada fuente.

## Secciones y fases

| Sección | Engine | Qué responde | Fase |
| --- | --- | --- | --- |
| Dashboard | Los cinco | Tu crecimiento de un vistazo: el mapa, el score y lo que lo mueve | V1 |
| Discoverability | Discoverability | Armado para ser encontrado: GBP, local SEO, búsqueda y tu sitio | V1 |
| Attention | Acquisition | Contenido que vale la pena mirar, producido y entregado a tiempo | V1 |
| Reputation | Reputation | Más reseñas, mejor rating | V1 |
| Attribution | Transversal | De dónde vino cada guest y cada acción | V2 |
| Retention | Retention | Cada conversación respondida, cada guest recuperado | V2 |
| Growth | Growth | Ads pagos, planificados, producidos y administrados en vivo | V2 |
| Management | — | Tareas y mensajes con tu equipo de Atrium: aprobaciones, calendario, biblioteca | V2 |
| Benchmarks | — | Cada estadística de competidores contra la que te comparamos | V3 |
| Reporting | Los cinco | Los logros y los datos de cada engine, en una sola historia | Siempre activo |
| Settings | — | Organización, fuentes, equipo | Siempre activo |

La navegación los agrupa como Dashboard · Engines (Discoverability, Attention, Retention, Reputation, Growth, Reporting) · Insights y equipo (Benchmarks, Management) · Cuenta (Settings). Las etiquetas "Attention" y "Reputation" son los nombres en la Platform de los engines Acquisition y Reputation.

El Overview del dueño responde "¿cómo va mi negocio y qué me necesita?" con el rating, las respuestas, los clics del enlace de reseña y los casos abiertos, cada uno con su cambio; cada definición está en [Leer el Overview](../guides/reading-the-overview). Las páginas Feedback y Responses son tablas con una banda de resumen arriba; ver [Tablas y páginas de sección](../guides/tables-and-section-pages).

## Qué contiene cada sección

### Dashboard

- **Growth Score:** 0–300 con el delta del rango elegido y el promedio de 10 millas al lado; debajo, los cinco scores de engine, cada uno con una marca ámbar del promedio del radio.
- **Mapa de brand awareness:** awareness espontáneo por zona del barrio según la encuesta de marca trimestral, con el promedio del radio. Las zonas son High desde 40%, Growing de 15–39% y Target bajo 15%.
- **Momentum del Growth Score:** 12 semanas. **Share of voice** contra los principales competidores del radio, estimado con alcance y engagement locales rastreados.
- **Wins:** los momentos que vale la pena celebrar, detectados solos por un agente (el mejor post del mes, una story que trajo indicaciones, un email que sigue abriéndose).
- **Guest journey:** attention → consideration → buying intent con la conversión contra el radio y un desglose por fuente.
- **Biggest lever right now** y **what we're working on.**

### Discoverability

- **Ecosistema:** todo conectado a un hub (GBP, listings, sitio, pixel, hub).
- **Setup readiness:** 0–100 contra el radio. Cada ítem vale puntos según los servicios que corren; suman el score.
- **Listings:** estado de sincronización por directorio (Google Business Profile, Apple Maps, Yelp, Facebook, TripAdvisor, Bing Places) y **GBP actions** (visitas al perfil, indicaciones, llamadas, clics en links).

### Attention (Acquisition)

- **Attention score** con los puntos de ventaja sobre el radio; **cómo te encontró la gente** por etapa; de dónde viene la atención, por canal.
- **Contenido que te hizo ver:** los mejores posts del período.
- **Channel → etapa → outcome:** cada acción rastreada hasta el canal que la ganó.
- **Tres etapas:** awareness (impresiones, división por plataforma, mejor contenido), consideration (engagement, fuentes del sitio) y buying intent (dónde aterriza).
- **Impressions share** contra competidores cercanos y la biblioteca de **signal sources:** lo que está activo y lo planificado.

### Reputation

- **Reputation score,** rating de Google con el promedio del radio y la tendencia de estrellas, **review velocity**, distribución de ratings, dónde caen las reseñas.
- **Feed de reseñas** con estado de respuesta; **comentarios y engagement** respondidos; **sistema de encuestas:** QR en tent cards y recibos, con el canal privado ofrecido junto al botón de reseña de Google para todos.
- **Reputación entre plataformas** y los **temas** de los que habla la gente.

### Retention

- **De dónde vienen:** orígenes del opt-in (portal WiFi, encuesta por QR, checkouts de pedidos y reservas online), cada uno convertido en una audiencia de retención.
- **Quiénes son:** el guestbook del CRM de Toast, con segmentos y ciclo de vida (nuevo → regular → VIP, win-backs).
- **Lo que hacemos:** campañas y automatizaciones always-on con resultados, **cohort retention** por mes desde la primera visita y **channel performance.**

### Attribution

- **El recorrido que ganamos:** stranger → regular, contado en cada paso, con el delta contra el período anterior.
- **Source → journey → outcome:** cada guest rastreado hasta el trabajo que lo ganó, agrupado en Organic, Paid y Owned. Las tres opciones de tabla para channel → etapa → outcome están en [Almacenamiento y pipeline](../data/storage-and-pipeline#vistas-de-atribución).
- **Top customer drivers** y **channel mix.** **Return on the work** es secundario: revenue verificado y ROAS combinado. **Cost per acquired action** contra el radio.

### Growth

- **Always-on:** los tres buckets donde cae cada dólar de ads permanentes (on-premise, estimado; órdenes online; reservas), cada uno con meta, resultado, ritmo del presupuesto y una llamada a la acción.
- **Campañas a medida:** eventos, catering y acciones únicas, cada una con su meta y presupuesto, mismo rastreo.
- **Ofertas:** lo que el restaurante nos da para trabajar; cada redención rastreada. **Línea de tiempo de esfuerzo** de lo que se hizo y **paid media** por plataforma.

### Management

- **Cola de aprobaciones:** un clic manda una pieza aprobada directo al calendario.
- **Calendario de publicaciones** y **biblioteca de contenido** con cada pieza en un solo lugar, más tareas y mensajes con el equipo de Atrium.

### Benchmarks (V3)

Tú contra el radio de 10 millas en barras, las moat metrics, rankings por categoría y proyecciones. Ejemplos de enfoque: el restaurante promedio de Houston paga $52 por un lead de catering; tú estás en $19.

### Reporting

El **report builder** (mensual), la **narrativa con IA** (generada con los datos del mes y editada por el strategist antes de enviarse) y el **archivo**.

### Settings

Organización, **fuentes de datos** (N8N → Supabase, con el estado de cada una) y el **equipo** con el acceso de cada miembro.

## Las estimaciones se etiquetan

Las ventas on-premise son una estimación: órdenes cruzadas × el ticket medio, con el tamaño del ticket fijado en settings. Las órdenes online y las reservas usan cuentas reales. Una etiqueta dice cuál es cuál.
