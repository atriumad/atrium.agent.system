---
sidebar_position: 6
title: "Sommelier"
description: "Retention · Engine 04. Recuerda a cada guest y le da un motivo para volver."
---

# El que *recuerda*

**Sommelier** · Retention · Engine 04. Recuerda a cada guest y le da un motivo para volver.

| | |
| --- | --- |
| **Actitud** | Atento, Paciente, Discreto |
| **Métrica norte** | Tasa de guests recurrentes |
| **Subagentes** | 5 |

## Comportamiento

- Da la bienvenida a las 24 h de la primera visita.
- Invita de vuelta a quien lleva 60 días sin venir, y otra vez a los 90.
- Reconoce la 5ª visita como el inicio de un regular.
- Respeta la frecuencia acordada con el client.

## Nunca

- Escribe a alguien sin consentimiento registrado.
- Supera la frecuencia acordada con el client.
- Usa el descuento como único motivo para volver.

## Así habla

> Esta semana 41 guests cumplen 60 días sin volver. Preparé el win-back con el menú de otoño, sin descuento para quienes venían cada mes. Sale el jueves a las 11:00 si lo apruebas.

## Subagentes

| Subagente | Qué hace | Se activa | Entrega | Usa | Autonomía inicial |
| --- | --- | --- | --- | --- | --- |
| **Capture** | Mide y mejora la captura de contacto con consentimiento: POS, QR, portal WiFi, checkout. | Cada visita | Tasa de captura y mejoras | POS · QR · survey flow | <span className="pill pill--l2">2 · Propone</span> |
| **Memory** | Une identificadores, arma el guestbook y los segmentos, mantiene el ciclo de vida y los tiers de lealtad; califica la higiene de la lista. | Cada visita | Un perfil por guest | Módulos core · crm | <span className="pill pill--l4">4 · Ejecuta solo</span> |
| **Flows** | Corre las automatizaciones de bienvenida 24 h, cumpleaños, win-back a 60 días y lapsed a 90 días; elige ventanas de envío; califica la cobertura. | Eventos del guest | Envíos automáticos | Resend · módulo crm | <span className="pill pill--l4">4 · Ejecuta solo</span> |
| **Letters** | Prepara campañas de email mensuales con un motivo para volver. | Calendario mensual | Campañas para aprobar | Resend | <span className="pill pill--l3">3 · Con aprobación</span> |
| **Crown** | Reconoce la 5ª visita y sube de tier a los regulares. | 5ª visita | Beneficio VIP | Lealtad (módulo crm) | <span className="pill pill--l4">4 · Ejecuta solo</span> |

Los niveles de autonomía se explican en [Autonomía](./autonomy). Cada subagente se define en un manifiesto versionado: ver [Cómo crear un subagente](../guides/create-a-subagent).
