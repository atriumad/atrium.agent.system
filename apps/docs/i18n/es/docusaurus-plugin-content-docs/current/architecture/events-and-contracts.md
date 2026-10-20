---
sidebar_position: 4
title: "Eventos y contratos"
description: "Cómo se comunican los módulos y el catálogo de eventos."
---

# Eventos y *contratos*

Los módulos solo se comunican por eventos. Un evento es un hecho pasado, inmutable y versionado.

## Reglas del bus

1. **Transaccional.** El evento se encola en pg-boss dentro de la misma transacción que el cambio de estado: si la reseña se guarda, el evento existe; si la transacción falla, no existe.
2. **Reintentos.** El worker entrega con reintentos exponenciales; tras 5 fallos el trabajo queda marcado para revisión y alerta en Sentry.
3. **Idempotencia.** Cada consumidor guarda los `id` procesados: recibir un evento dos veces no produce dos efectos.
4. **Sin datos personales.** Los eventos llevan ids, nunca email ni teléfono. El consumidor pide el contacto a Core, que verifica el consentimiento.
5. **Opcional.** Un consumidor apagado para un client ignora el evento.
6. **Las suscripciones se guardan.** Un evento sin consumidor suscrito se descarta. El worker suscribe a cada consumidor al arrancar, así que hay que correr un worker una vez antes de recibir tráfico en una base nueva.
7. **Las dead letters se nombran, no se copian.** Un trabajo que agota sus reintentos va a la cola de dead letters; el worker registra su tipo, versión, id y client, y nada de su contenido.

## Forma de un evento

```ts title="packages/contracts/src/events/review.ts"
import {z} from 'zod';

export const ReviewReceivedV1 = z.object({
  type: z.literal('review.received'),
  version: z.literal(1),
  id: z.string().uuid(),            // clave de idempotencia
  occurredAt: z.string().datetime(),
  clientId: z.string().uuid(),
  locationId: z.string().uuid(),
  data: z.object({
    reviewId: z.string().uuid(),
    platform: z.enum(['google', 'yelp', 'other']),
    rating: z.number().int().min(1).max(5),
    guestId: z.string().uuid().optional(), // solo cuando lo vincula una encuesta o el AM
  }),
});
export type ReviewReceivedV1 = z.infer<typeof ReviewReceivedV1>;
```

## Catálogo de eventos

| Evento | Publica | Consumidores previstos |
| --- | --- | --- |
| `guest.identified` | Core | CRM, Growth (Ledger) |
| `consent.changed` | Core | CRM, notificaciones |
| `guest.erased` | Core | Todo módulo que guarde un `guest_id`: depurar y confirmar |
| `package.changed` | Core | Feature flags, Platform, Mobile, Manager |
| `signals.ingested` | signals | Job de rollup |
| `metrics.rebuilt` | signals | Scoring, Platform |
| `score.computed` | signals | Maître (Scorekeeper), Platform, Mobile |
| `benchmark.updated` | signals | Scoring |
| `grade.written` | signals | Scoring |
| `listing.drift.detected` | discoverability | Concierge (Front Door, Listings), Scorekeeper |
| `hub.button.updated` | discoverability | Schema, Platform |
| `review.received` | reputation | Echo, Sentiment, Scorekeeper |
| `review.replied` | reputation | Scorekeeper |
| `survey.sent` | reputation | Scorekeeper |
| `survey.response.submitted` | reputation | Recovery, Sentiment, Memory, Ask |
| `survey.response.read` | reputation | Recovery |
| `recovery.case.opened` | reputation | Notificaciones (alerta al dueño y al AM) |
| `recovery.case.resolved` | reputation | Scorekeeper |
| `review.link.clicked` | reputation | Scorekeeper |
| `contact.captured` | crm | Memory, Flows |
| `automation.fired` | crm | Scorekeeper |
| `campaign.sent` | crm | Ledger, Scorekeeper |
| `loyalty.card.issued` | crm | ninguno todavía |
| `loyalty.stamp.added` | crm | ninguno todavía |
| `loyalty.reward.earned` | crm | Crown |
| `loyalty.reward.redeemed` | crm | ninguno todavía |
| `content.status.changed` | content | Manager, Platform |
| `content.approved` | content | Distribución, Manager |
| `content.published` | content | Pulse, registro de elements |
| `task.fired` | ops | Manager |
| `task.completed` | ops | Manager, avance del ciclo |
| `cycle.started` | ops | Manager |
| `campaign.launched` | growth | Pacer, Ledger |
| `budget.pacing.alert` | growth | Maître, Manager |
| `offer.redeemed` | growth | Ledger |
| `order.attributed` | growth | Scorekeeper, Platform |
| `report.generated` | reports | Narrator, Manager |
| `report.sent` | reports | Archivo |

## Cómo cambiar un contrato

- Agregar un campo opcional: misma versión.
- Quitar, renombrar o cambiar el tipo de un campo: **versión nueva** (`V2`). El productor publica ambas versiones hasta que todos los consumidores migran.
- Cada evento tiene un ejemplo válido y uno inválido en sus pruebas de contrato.
