---
sidebar_position: 3
title: "Manager"
description: "La app web de la agencia: cartera, workspaces por client, proyectos de entrega, tareas, pipeline de contenido, COG, aprobaciones y estado de datos."
---

# Manager: el *Agency OS*

El Manager es donde Atrium corre su entrega. La misma vista puede verse **como** cualquier rol, con las tareas de ese rol.

## Secciones

| Sección | Qué contiene |
| --- | --- |
| **Portfolio** | Salud de la cartera (Growth Score promedio, activos, en riesgo), el roster de clients, "needs your attention" y "launching this week" |
| **Client workspace** | Un client: score y paquete, lo que hacemos este ciclo, contenido en movimiento, MRR y renovación, fuentes de datos, acceso por paquete y un salto a su Platform |
| **Projects** | Un ciclo por client más campañas a medida: assets terminados, avance de reels y gráficos, etapa del ciclo, al ritmo o atrasado |
| **Tasks** | La base de tareas: naturaleza de la etapa, tipo de tarea, estado, responsable, horas estándar y reales, estado de vencimiento |
| **Content** | El tablero de contenido a lo largo del pipeline, un ticket por pieza con comentarios |
| **Studio** | El calendario de publicaciones, ready to post, líneas de tiempo de lotes de gráficos y reels, pendientes del día, email |
| **Approvals** | Todo lo que espera el OK del client, con cuánto lleva esperando |
| **Client COG** | Las Client Operational Guidelines |
| **Packages** | La matriz de acceso: quién ve qué |
| **Data** | Estado de las integraciones por client y fuente |
| **Daily entry** | El registro manual de lo que se entregó, con sello de hora |
| **Team** | Personas, clients, MRR administrado, tareas abiertas, capacidad |

## Roles

| Rol | Código | Es dueño de |
| --- | --- | --- |
| Account Manager | `am` | La relación con el client; dispara las tareas desde el COG; aprobaciones; reporte de KPIs; llamada estratégica con el client; configuración de ads; ritmo semanal; reporte mensual |
| Assistant Account Manager | `aam` | Armado y revisión del calendario; distribución y publicación; distribución de stories; engagement y reseñas; GBP y comunidad |
| Creative Director | `cd` | El doc de estrategia interno (MAP); preproducción; sesión de contenido; planificación de postproducción; QC en Milanote; dirección de la sesión |
| Assistant Creative Director | `acd` | QC del contenido producido |
| Developer | `dev` | CRM y email; QC de automatizaciones; reputación, SEO y discoverability; pixel y tracking; landing pages |
| Graphic Designer | `gd` | Gráficos y carruseles |
| Video Editor | `ve` | Edición de reels |

Solo el Account Manager dispara tareas. Todos los demás ven las tareas que se les asignan y pueden agregar contenido.

## Salud del client

Cada client está **on track**, **needs attention** o **at risk**, según el Growth Score y su delta, la tendencia de reseñas, las aprobaciones esperando más de 6 días y las brechas de onboarding (por ejemplo, GBP o Toast aún sin conectar).

## El ciclo de entrega

Un ciclo mensual anclado a la fecha de facturación, en tres etapas: **Strategy → Production → Distribution**. Reporting, CRM, ads y SEO, y management corren en paralelo como sus propias naturalezas de etapa.

| Paso | Tarea | Ventana | Responsables |
| --- | --- | --- | --- |
| 0 | Revisión del COG y todas las tareas disparadas | Día 0 | AM |
| 1 | Reporte de KPIs y rollover | Día 0–1 | AM, DEV |
| 2 | Llamada estratégica con el client | Día 1–2 | AM, CD |
| 3 | Doc de estrategia interno (MAP) | Día 2–3 | CD |
| 4 | Preproducción y briefs en Milanote | Día 3–6 | CD |
| 5 | Sesión de contenido (mar, mié o jue) | Día 7 | CD, AM |
| 6 | Planificación de postproducción y QC en Milanote | Día 8–9 | AM, CD |
| 7 | Armado y cierre del calendario | Día 10–12 | AAM, AM |
| 8 | Edición y diseño: todos los assets entregados | Día 9–14 | CD |
| 9 | Configuración y lanzamiento de ads | Día 10–12 | AM |
| 10 | CRM y email | Día 10–14 | AM, DEV |
| 11 | Empieza la distribución | Día 13–21 | AAM |
| 12 | Engagement, reseñas, GBP y stories | Día 13–27 | AAM |
| · | Chequeo de ritmo semanal | Cada viernes | AM |
| · | Reporte mensual y llamada estratégica | Día 1 del ciclo siguiente | AM, CD |

## Pipeline de contenido

El contenido es entrega: reels, estáticos y emails fluyen por ocho estados y cada estado tiene un responsable.

| # | Estado | Responsable |
| --- | --- | --- |
| 1 | Ready to Shoot | Creative Director |
| 2 | Copywriter | Copy · AAM |
| 3 | Produced | Equipo de contenido |
| 4 | Editing | Video Editor o Designer |
| 5 | QC | Assistant Creative Director |
| 6 | Revision | Creative Director o AM |
| 7 | Ready to Post | Assistant Account Manager |
| 8 | Posted o Scheduled | En vivo |

Una pieza lleva un formato (reel, gráfico, carrusel, email, YouTube), un origen (ciclo, extra o solicitud), una etiqueta que fija su tope de tiempo, una fecha de publicación, un checklist interno y un hilo de comentarios.

### Topes por etiqueta

Límites duros del tiempo de producción por etiqueta. Si se pasa del tope: se escala al Creative Director antes de empezar.

| Etiqueta | Tope |
| --- | --- |
| LER, reel de bajo esfuerzo | 50 min |
| MER, reel de esfuerzo medio | 1 h 40 |
| HER, reel de alto esfuerzo | 2 h 30 |
| HEH, hero de alto esfuerzo (YouTube) | 3 h 20 |
| LEG, gráfico de bajo esfuerzo | 30 min |
| MEG, gráfico de esfuerzo medio | 50 min |
| HEG, gráfico de alto esfuerzo | 1 h 20 |

## Tareas

Una tarea tiene una naturaleza de etapa (Strategy y preproducción, Production y post, Distribution, Reporting, CRM · automatizaciones · ads · SEO, Management), un tipo de tarea, un estado (To Do, In Progress, Ready to Revise, Done), una o más personas responsables, horas estándar y reales (la barra muestra la eficiencia de tiempo) y un estado de vencimiento (vencida, por vencer, en tiempo). Vistas: My tasks, By project, By stage, All.

## Client COG

Las Client Operational Guidelines convierten la promesa en unidades medibles. Cada unidad del alcance se vuelve una métrica en el tablero del client y se mide contra este plan; el calendario del ciclo dispara las tareas.

| Parte | Contenido |
| --- | --- |
| **Equipo de la cuenta** | Quién está asignado al client en cada rol, con la opción de cambiar a una persona |
| **Alcance y entregables** | Contenido core (reels, gráficos, sets de stories, días de sesión), contenido de growth (reels narrativos, POV de chef y fundador, colaboraciones con embajadores), social y reputación (community management, respuestas a reseñas, actualizaciones de GBP), email (campañas, automatizaciones), ads (Meta always-on, Google Search, campañas de performance) |
| **Calendario del ciclo** | Los pasos de arriba, con los responsables de cada client |
| **Volumen de trabajo** | Horas estándar por rol, desde las tareas disparadas, más los topes por etiqueta |
| **Guardrails permanentes** | Aprobación obligatoria antes de cualquier lanzamiento de paid, afirmación de precio o menú, o mención de un competidor; nunca publicar nombres de competidores salvo aprobación ni afirmaciones de salud sin verificar; tono y voz; protocolo de reseñas negativas (avisar al AM, aprobación escrita, responder en 24–48 h); cambios de calendario solo tras una conversación de trade-off |
| **Rutina semanal permanente** | Post semanal "What's New" de GBP alineado a la oferta vigente; monitoreo de reseñas dos veces por semana; community management sin nada sin responder más de 24 h; ad always-on de Meta confirmado activo; stories publicadas a diario; cada tarea con responsable y fecha |
| **Estado del tech stack** | Toast POS, Metricool, Resend, Google Business Profile, Meta Business Manager, Meta Pixel, GA4, N8N, SemRush: conectado o pendiente |
| **Fechas clave** | Eventos y visitas de embajadores; ritmo semanal; el reporte mensual |
| **Bitácora de cambios** | "Si no está aquí, no es oficial": cada cambio de alcance, con quién y por qué |

Los guardrails permanentes y las reglas semanales son la versión humana de las [reglas comunes](../agents/common-rules): los agentes las hacen cumplir en código.

## Daily entry

Un registro manual, una sección por cada módulo que desbloquea el paquete del client, en el que cada tipo de entregable trae sus propios campos de métricas. Cada línea lleva sello de hora y se agrega al registro diario maestro: es el feed crudo que leen los cálculos mientras no exista un conector. Escribe en `signals_daily` con `source = manual`.

| Sección | Mínimo de paquete | Tipos y campos |
| --- | --- | --- |
| Contenido y social | Básico | Reel (views, reach, saves, shares, comments), feed post, story, carousel |
| Ads · Meta y Google | Completo | Campaña de Meta (spend, impressions, reach, clicks, leads), Google Search, boosted post |
| Local y SEO · GBP | Básico | GBP post, GBP photos, keyword rank |
| Reputación y reseñas | Completo | Review requests, reviews received, review responses |
| Email · Resend | Completo | Campaña de email (sent, revenue; opens y clicks más adelante, con marketing y CRM) |
| Leads y campañas | Básico | Catering lead, reservation, event RSVP |

## Estado de datos

Una matriz de clients contra fuentes (Toast, Meta, Metricool, Resend, GBP, Survey): **connected**, **syncing**, **needs attention** o **not connected**. Es el checklist de onboarding y el primer lugar donde mirar cuando un número se queda viejo.
