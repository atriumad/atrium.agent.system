---
id: 0017-twilio-email-and-sms
sidebar_position: 18
title: "0017 · Twilio para email y SMS"
sidebar_label: "0017 · Twilio para email y SMS"
description: "Twilio para email y SMS"
---

# ADR 0017: Twilio para email y SMS

| Estado | Fecha | Decisores |
| --- | --- | --- |
| **Reemplazada por [0021](./0021-resend-email-no-sms)** | 2026-10-01 | Atrium · producto y tecnología |

:::note
Reemplaza a [0010](./0010-email-only-notifications).
:::

## Contexto

El email y el SMS marketing, las automatizaciones y las ventanas de revenue rastreadas (14 días para email, 7 para SMS) son servicios que Atrium vende. Necesitan aperturas, clics, entregas y bajas como signals. El SMS necesita un registro 10DLC por restaurante.

## Decisión

Twilio para cada envío, con webhooks escritos en `signals_daily`, React Email para las plantillas y un chequeo de consentimiento en cada envío. El registro 10DLC empieza en el onboarding; el SMS se activa para un client solo cuando su registro está aprobado.

## Consecuencias

- Un solo proveedor y un solo modelo de webhooks para cada envío.
- Las bajas actualizan el registro de consentimientos al instante.
- El plazo del SMS (1–4 semanas) se vuelve un paso del onboarding.

## Alternativas descartadas

- Resend para email más un proveedor de SMS aparte: dos modelos que rastrear.
- Una plataforma de campañas: duplica segmentos y automatizaciones que son del módulo CRM.
