---
sidebar_position: 10
title: "Escenarios"
description: "Tres situaciones reales, paso a paso."
---

# Tres situaciones, *paso a paso*

Los ejemplos usan Casa Olivo, un restaurante ficticio. Los pasos marcados con **(persona)** son decisiones humanas.

## Llega una reseña de 2★

```mermaid
sequenceDiagram
  participant G as Google
  participant E as Echo
  participant R as Recovery
  participant AM as Account Manager
  participant M as Maître
  G->>E: Reseña nueva 2★ (espera larga)
  E->>E: La clasifica y redacta una respuesta en voz de marca
  E->>AM: Borrador en la cola de aprobaciones; las negativas exigen aprobación escrita
  AM-->>E: Aprueba con un cambio (persona)
  E->>G: Publica la respuesta
  R->>AM: Abre un caso privado si el mismo guest contestó una encuesta
  M->>AM: Brief semanal: 3 reseñas sobre espera
```

**Resultado:** respuesta pública en 24–48 h, un caso privado cuando el guest es conocido y la tasa de respuesta en 98–100%. Una reseña pública nunca se vincula a un guest por suposición: el caso se abre solo desde una respuesta de encuesta o cuando el Account Manager la vincula.

## Un martes lento

1. **Scorekeeper** detecta que los martes están por debajo del promedio de 8 semanas.
2. **Campaigner** propone una oferta de martes con promo code propio para medirla.
3. El dueño la aprueba desde la Platform o la app Mobile **(persona)**.
4. **Crave** redacta el post y la story; quedan en la cola de aprobaciones.
5. **Letters** prepara el SMS solo para guests con consentimiento.
6. **Pacer** fija el gasto always-on del día dentro del guardrail.
7. **Ledger** atribuye las visitas que usaron el código, etiquetadas como atribución por código.

## Un guest nuevo se vuelve regular

1. **Capture**: el guest escanea el QR de la mesa, deja su email y acepta comunicaciones.
2. **Memory** crea su perfil y lo une a la visita.
3. **Flows** envía la bienvenida de 24 h con una encuesta corta.
4. **Ask** incluye el pedido de reseña para todos, sin depender de la respuesta.
5. Día 60 sin volver: **Flows** envía el win-back con una novedad del menú.
6. 5ª visita: **Crown** lo reconoce como regular.
7. **Amplify** usa la audiencia de regulares para encontrar personas parecidas.
