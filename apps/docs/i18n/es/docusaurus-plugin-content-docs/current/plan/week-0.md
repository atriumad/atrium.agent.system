---
sidebar_position: 1.5
title: "Checklist de la semana 0"
description: "Todo lo que hay que iniciar, pedir o decidir antes y durante la primera semana de F0."
---

# Semana 0: *poner en marcha los relojes que no son tuyos*

La fase F0 empieza el lunes 5 de octubre de 2026. La semana 0 es lo que tiene que estar en movimiento antes de ese día, porque varios ítems dependen de terceros y tardan semanas. Nada de esto es código. Marca los ítems aquí a medida que se cierren; las fechas de [Fases y calendario](./) se validan contra esta lista.

:::caution El orden importa
Haz primero la sección 1. Esas solicitudes esperan a otra persona, así que cada día que quedan sin enviar mueve un gate.
:::

## 1. Solicitudes con espera externa

Envíalas todas antes de tocar el repositorio. Las esperas son estimaciones; confírmalas con cada proveedor.

| Listo | Solicitud | Se necesita para | Bloquea | Notas |
| --- | --- | --- | --- | --- |
| [ ] | Google Business Profile API: solicitud de acceso básico | G1 | Reseñas, insights del perfil | El plan supone unas seis semanas y **no bloquea** el calendario; la entrada manual lo cubre |
| [ ] | Cuenta de Twilio, y el registro de marca 10DLC de cada client piloto | G4 | Solo SMS | El email funciona sin esto. Los registros bloquean el SMS, no la construcción |
| [ ] | Export nocturno de Toast habilitado para los clients piloto | G1 | Datos de resultado (órdenes, ingresos) | Requiere el consentimiento del client y un admin de Toast de su lado |
| [ ] | Solicitud al partner program de Toast | Después de G1 | API en lugar del export | Corre en paralelo; el export es la primera ruta |
| [ ] | Acceso a la API de Metricool | G1 | Datos sociales | Confirma que el plan incluya acceso a la API |
| [ ] | Acceso a la API de Meta Ads y app review | G1 | Social pago | La espera del app review es incierta; empieza ya |
| [ ] | Developer token de Google Ads | G1 | Búsqueda paga | El acceso básico requiere una cuenta manager aprobada |
| [ ] | Cuentas de Apple Developer Program y Google Play Console | F6 | Beta móvil | La inscripción como organización requiere un número D-U-N-S; empieza temprano si la agencia no tiene uno |

## 2. Decisiones para cerrar esta semana

Solo las decisiones que bloquean F0 o F1. El resto de las [Decisiones abiertas](./open-decisions) puede esperar a su fase.

| # | Decisión | Por qué bloquea | Recomendación |
| --- | --- | --- | --- |
| 1 | Cuántas personas construyen | Todo el calendario depende de esto (unas 30 semanas con una, 20 con dos) | Un desarrollador con Claude Code, como supone el plan |
| 12 | Dónde corren la API, el worker, los agentes y N8N | Define los entornos, los destinos de deploy del CI y los secretos | Railway, con Fly.io como alternativa |
| 15 | Brand tokens: sistema de marca frente al tema del producto | `@atrium/ui` es un ítem de G0 y necesita un solo conjunto de tokens | Reconciliar en `packages/ui` antes de la semana 3 de F0 |
| 17 | Cuáles son los dos restaurantes piloto | Sus fuentes deben estar conectadas al final de F1 o G2 se mueve | Elegirlos ya: Toast, perfil de Google activo, un dueño que responda |
| 11 | Ruta de Toast | Define el primer conector | Export nocturno primero, partner program en paralelo |
| 18 | Estado de los prototipos HTML en `guides-rules` | Evita portar código de prototipo por accidente | Solo referencias de diseño |

## 3. Cuentas y entornos

Tres entornos desde el primer día: **dev**, **staging**, **prod**. Crea cada cuenta una vez y los tres proyectos dentro de ella.

| Listo | Servicio | Se usa para | Dev | Staging | Prod |
| --- | --- | --- | --- | --- | --- |
| [ ] | Organización y repositorio de GitHub | Código, CI, ADRs | un repo | | |
| [ ] | Vercel | Platform, Manager, Hub | [ ] | [ ] | [ ] |
| [ ] | Railway | API, worker, agentes, N8N | [ ] | [ ] | [ ] |
| [ ] | Supabase | Postgres, un proyecto por entorno | [ ] | [ ] | [ ] |
| [ ] | N8N | Conectores | local (Docker) | [ ] | [ ] |
| [ ] | Sentry | Errores y jobs fallidos | [ ] | [ ] | [ ] |
| [ ] | API key de Anthropic | Agentes (desde F5; evals antes) | [ ] | [ ] | [ ] |
| [ ] | Dominio de envío de email | Registros SPF, DKIM y DMARC | | [ ] | [ ] |

:::note
Mantén los secretos fuera del repositorio desde el primer commit. Un almacén de secretos por entorno, y un `.env.example` commiteado que liste los nombres sin valores.
:::

## 4. Arranque del repositorio

Estos cierran el primer ítem de G0 (repo, CI/CD, 3 entornos). Son los primeros días de F0, listados aquí para que el lunes empiece sin decisiones pendientes.

- [ ] Crear el repositorio `atrium` con la estructura de [Repositorio y módulos](../architecture/repository)
- [ ] Workspaces de Bun y Turborepo, versión de Bun fijada en `packageManager` ([ADR 0002](../adr/0002-bun-and-turborepo))
- [ ] `packages/config`: `tsconfig` estricto, Biome, ajustes compartidos
- [ ] Reglas de dependency-cruiser que rompen el build cuando un módulo importa a otro ([ADR 0001](../adr/0001-modular-monolith))
- [ ] `docker-compose.yml` con Postgres y N8N para desarrollo local
- [ ] `.env.example` con el nombre de cada variable, agrupadas por servicio
- [ ] CI en cada pull request: install, lint, type-check, `check:deps`, tests contra Postgres real
- [ ] Protección de la rama `main`: revisión obligatoria, CI en verde, sin pushes directos
- [ ] Pipelines de deploy: Vercel para las apps web, Railway para API y worker, por entorno
- [ ] Copiar `docs/adr/` al repositorio
- [ ] Mover esta documentación a `apps/docs`, o mantenerla como repositorio propio (decidir y registrarlo)
- [ ] Actualizar [Desarrollo local](../guides/local-development) cuando el esqueleto corra

## 5. Listo para empezar F0

La semana 0 se cierra cuando:

- [ ] Cada solicitud de la sección 1 fue enviada, con la fecha escrita al lado
- [ ] Las decisiones 1, 11, 12, 15, 17 y 18 tienen responsable y respuesta
- [ ] Las cuentas de la sección 3 existen y quien construye tiene acceso a todas
- [ ] El repositorio arranca desde un clone vacío con `bun install` y el CI está en verde en el primer pull request
- [ ] Los clients piloto saben que la construcción empieza y quién es su contacto
