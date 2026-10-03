---
sidebar_position: 7
title: "Seguridad y aislamiento"
description: "Auth, roles, acceso por paquete, aislamiento entre clients, secretos y datos personales."
---

# Seguridad y *aislamiento*

## Identidad y roles

Better Auth con organizaciones. Cada client es una organización; Atrium es la organización de agencia.

| Rol | Alcance |
| --- | --- |
| `agency_admin` | Toda la cartera y la configuración |
| `account_manager` | Sus clients asignados; dispara tareas, aprueba y opera |
| `agency_staff` | Tareas de sus clients asignados; un **team role** dice qué hace |
| `client_owner` | Su client y todas sus locations; aprueba contenido |
| `client_staff` | Locations asignadas; solo lectura en la mayoría de las secciones |
| `agent` | Identidad técnica de un subagente; solo vía gateway MCP |

Las siete funciones del Manager (Account Manager, Assistant Account Manager, Creative Director, Assistant Creative Director, Developer, Graphic Designer, Video Editor) son **team roles** guardados en la membresía. Deciden qué tareas ve y posee una persona; los roles de permiso de arriba deciden qué puede hacer.

## Acceso por paquete

Lo que un client puede ver es la intersección de su rol y su paquete. El acceso se calcula una vez en Core y lo leen todas las superficies y el gateway MCP; ver [Paquetes y acceso](../product/packages-and-access).

## Aislamiento entre clients

1. **Repositorios con client obligatorio.** Ninguna consulta compila sin `clientId`.
2. **RLS en Postgres** como segunda defensa, por si una consulta se escapa. El client se fija por transacción (`SET LOCAL`) en la API, el worker y el gateway de agentes.
3. **Pruebas de aislamiento** en CI: un client nunca ve filas de otro, por repositorio ni por RLS. Incluye `signals_daily`, `metrics_daily` y `scores_weekly`.
4. **Los benchmarks son agregados.** El benchmark de 10 millas se guarda sin identificadores de client y con un tamaño de muestra; un client nunca puede leer el valor de otro.

## Conectores y secretos

- Las credenciales de los proveedores viven en el gestor de secretos de la plataforma, por client, nunca en el repositorio ni en un export de N8N.
- N8N llega a la base solo a través de la API de ingesta, con un token acotado por conector.
- Un conector puede leer y escribir solo los datos de los clients para los que está configurado.

## Superficies públicas

- Links de encuesta y de hub con **tokens firmados** de un solo propósito y vencimiento.
- **Rate limiting** y protección contra bots en el hub y en las encuestas por QR.
- Ningún dato personal en URLs ni en eventos.

## Datos personales

- Consentimientos por canal y propósito, con fecha y origen. Los orígenes del opt-in (POS, portal WiFi, QR, checkout) se registran por contacto.
- Borrado de un guest a pedido, propagado como `guest.erased`; el registro de auditoría guarda solo entradas enmascaradas.
- Los textos de reseñas y encuestas que se envían a un modelo de lenguaje se limitan a los campos que la tarea necesita; los nombres y contactos de los guests no.
