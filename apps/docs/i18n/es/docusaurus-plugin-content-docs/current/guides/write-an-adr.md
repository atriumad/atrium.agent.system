---
sidebar_position: 8
title: "Escribir un ADR"
description: "Plantilla y criterios para registrar decisiones."
---

# Escribir un *ADR*

Escribe un ADR cuando una decisión es difícil de revertir, afecta a más de un módulo o alguien preguntará "¿por qué hicimos esto?" dentro de seis meses.

## Plantilla

```markdown title="docs/adr/NNNN-titulo-corto.md"
---
id: NNNN-titulo-corto
title: "NNNN · Título en una línea"
---

# ADR NNNN: Título en una línea

| Estado | Fecha | Decisores |
| --- | --- | --- |
| Propuesta | AAAA-MM-DD | nombres o roles |

## Contexto
Qué problema hay y qué restricciones existen. Hechos, no opiniones.

## Decisión
Qué se decide, en presente: "Usamos…".

## Consecuencias
- Qué se gana.
- Qué cuesta o qué riesgo queda.

## Alternativas descartadas
- Opción: por qué no.
```

## Estados

| Estado | Significado |
| --- | --- |
| Propuesta | En discusión |
| Aceptada | Vigente |
| Reemplazada por NNNN | Ya no aplica; se conserva como historia |
| Diferida | Se evaluó y no es parte del plan actual; se conserva para poder retomarla |
| Rechazada | Se evaluó y no se adoptó |

Un ADR aceptado no se edita. Si la decisión cambia, se escribe uno nuevo y el anterior pasa a "Reemplazada".
