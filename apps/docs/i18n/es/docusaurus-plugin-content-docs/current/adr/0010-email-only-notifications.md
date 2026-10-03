---
id: 0010-email-only-notifications
sidebar_position: 11
title: "0010 · Notificaciones solo por email en el MVP"
sidebar_label: "0010 · Notificaciones solo por email en el MVP"
description: "Notificaciones solo por email en el MVP"
---

# ADR 0010: Notificaciones solo por email en el MVP

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Reemplazada por 0017** | 2026-10-01 | Atrium · producto y tecnología |

:::note
Reemplazada. El email y el SMS marketing, las automatizaciones y las ventanas de revenue rastreadas son servicios que Atrium vende, así que la mensajería es parte del sistema. Ver [0017](./0017-twilio-email-and-sms).
:::

## Contexto

En el primer alcance, la comunicación se limitaba a avisos al client y al guest. El SMS exige registrar cada restaurante como marca 10DLC, con costo y 1–4 semanas de espera.

## Decisión

Un módulo simple de notificaciones en Core con Resend y React Email. Sin campañas ni SMS. Cada envío verifica consentimiento.

## Consecuencias

- Lanzamiento sin trámites externos.
- El SMS y las campañas se sumarían después.

## Alternativas descartadas

- Twilio o Telnyx desde el inicio: trámite por client sin necesidad real en ese alcance.
