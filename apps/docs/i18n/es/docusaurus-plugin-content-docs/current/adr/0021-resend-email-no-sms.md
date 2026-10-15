---
id: 0021-resend-email-no-sms
sidebar_position: 22
title: "0021 · Resend para el correo, sin SMS"
sidebar_label: "0021 · Resend para el correo, sin SMS"
description: "Resend para el correo, sin SMS"
---

# ADR 0021: Resend para el correo, sin SMS

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Aceptada** | 2026-10-15 | Atrium · producto y tecnología |

:::note
Reemplaza al [0017](./0017-twilio-email-and-sms).
:::

## Contexto

El ADR 0017 eligió Twilio para correo y SMS, con un registro ante las operadoras por restaurante antes de poder activar SMS. Atrium no enviará SMS, y el proveedor de correo ahora es Resend. La puerta de notificaciones ya esconde al proveedor detrás de un puerto.

## Decisión

El correo es el único canal. Lo envía Resend, a través del puerto `NotificationTransport` que ya existe. Un webhook firmado registra la entrega, los rebotes y las quejas; un rebote o una queja retira el consentimiento de ese guest. El pedido de reseña lleva un enlace de baja, y la baja retira el consentimiento. SMS, Twilio y el registro ante las operadoras se eliminan del esquema, del código y de la documentación. El teléfono del guest sigue siendo un dato de contacto para que el equipo llame; no es un canal.

## Consecuencias

- Un proveedor, un modelo de webhooks, un canal.
- Las aperturas y los clics del correo todavía no se miden; llegan con marketing y CRM.
- Un rebote detiene todo el correo a ese guest, incluida una invitación de encuesta posterior.
- La migración borra las filas viejas de SMS. Es aceptable solo porque todavía no hay datos reales de clients.
- La API y el servicio de agentes se niegan a arrancar fuera de desarrollo sin las variables de Resend.

## Alternativas descartadas

- Dejar SMS en el esquema para después: deja código muerto y una promesa que el producto no cumple.
- Enviar con el SDK del proveedor: una petición simple alcanza y es más fácil de probar.
- Medir aperturas en el correo transaccional: necesita una decisión previa con marketing.
