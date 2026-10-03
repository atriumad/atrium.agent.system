---
sidebar_position: 8
title: "Autonomía"
description: "Los cuatro niveles de autonomía y cómo se sube de nivel."
---

# Cuatro niveles. *La confianza se gana.*

Cada subagente empieza en un nivel por herramienta y sube cuando acumula evidencia. Todo lo que habla en público con la voz del client, o gasta el dinero del client, pasa por una persona hasta que se gane lo contrario.

| Nivel | Nombre | Qué significa | Ejemplos iniciales |
| --- | --- | --- | --- |
| <span className="pill pill--l1">1</span> | Observa | Mide y avisa. Nada sale hacia afuera | Radar, Schema, Pulse, Sentiment |
| <span className="pill pill--l2">2</span> | Propone | Prepara borradores y planes. Una persona decide | Listings, Crave, Voices, Recovery, Capture, Strategist, Campaigner, Refresher |
| <span className="pill pill--l3">3</span> | Con aprobación | Actúa después de un clic de aprobación | Front Door, Amplify, Echo, Letters, Narrator, Pacer |
| <span className="pill pill--l4">4</span> | Ejecuta solo | Actúa dentro de reglas ya aprobadas; todo queda en el registro | Scorekeeper, Ask, Memory, Flows, Crown, Ledger |

## El nivel es por herramienta, no por agente

Un mismo subagente puede ejecutar solo una herramienta de lectura y necesitar aprobación para una que escribe. Por eso el manifiesto declara el nivel herramienta por herramienta, y por eso el nivel de las tablas de arriba es el nivel *inicial* del subagente para su herramienta principal. Ver [Agentes y MCP](../architecture/agents-and-mcp).

## Quién aprueba

| Acción | Quién aprueba |
| --- | --- |
| Contenido y respuestas públicas | Dueño del client o Account Manager |
| Lanzamientos de paid, movimientos de presupuesto, afirmaciones de precio o menú | Account Manager (el COG lo exige); el dueño para montos sobre el umbral del client |
| Respuestas a reseñas negativas | Account Manager, por escrito |
| Cambios en listings (horario, menú) | Account Manager, tras la confirmación del restaurante |
| Subir el nivel de un subagente | Account Manager |

## Cómo se sube de nivel

1. Las **evals** del subagente están en verde para la herramienta.
2. Hay **historial suficiente** de aprobaciones sin edición (umbral propuesto: 50 seguidas, sin incidentes).
3. El **Account Manager del client** lo aprueba, y el cambio queda como nueva versión del manifiesto.

Bajar de nivel es inmediato: cualquier persona con rol de agencia puede hacerlo, y el interruptor apaga al subagente para un client sin desplegar nada.
