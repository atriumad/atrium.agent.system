---
sidebar_position: 7
title: "Riesgos y cumplimiento"
description: "Prácticas prohibidas y riesgos de diseño."
---

# Riesgos y *cumplimiento*

Dos prácticas del deck original se corrigen antes de construir. El resto son riesgos de diseño con su respuesta.

| Riesgo | Qué se hace |
| --- | --- |
| **Review gating.** La política de Google prohíbe pedir reseña solo a los guests satisfechos. El flujo original enviaba a Google a los contentos y a un canal privado a los descontentos | Se pide reseña a todos. La encuesta ofrece además un canal privado, nunca en lugar de la reseña. El link de reseña lo agrega el sistema y nunca depende de la calificación. Ver [ADR 0018](../adr/0018-no-review-gating) |
| **Consentimiento.** Un contacto capturado no es permiso de marketing; en EE.UU. CAN-SPAM exige baja y dirección del remitente en email | Registro de consentimientos por canal y propósito, con fecha y origen. Ningún envío promocional sin consentimiento. Baja en cada mensaje. El origen del opt-in (portal WiFi, QR, checkout) se registra por contacto |
| **Reseñas incentivadas.** Google prohíbe ofrecer premios por reseñas | La lealtad y las ofertas nunca se condicionan a dejar una reseña |
| Datos personales de guests | Acceso por rol, aislamiento por client, borrado a pedido, depurados de los logs |
| Atribución sobreestimada | Cada revenue atribuido muestra su método. Las estimaciones se etiquetan. La correlación temporal nunca se suma como atribuida |
| Doble conteo de identidad | Identity stitching (ID de pixel, cruce con POS, teléfono o email) para contar a un guest una sola vez entre fuentes |
| Agentes fuera de sus límites | Herramientas MCP como única puerta, motor de políticas, auditoría e interruptor. Ver [Agentes y MCP](../architecture/agents-and-mcp) |
| Inyección de prompts desde reseñas o comentarios | Todo texto escrito por guests es dato no confiable, nunca instrucción |
| Dependencia de terceros | Conectores por proveedor que escriben un formato normalizado; un registro manual sigue funcionando cuando un conector falla |
| Calidad del benchmark | Los benchmarks solo se muestran con un tamaño de muestra; con una muestra delgada se oculta la marca ámbar en vez de adivinar |

:::caution No es asesoría legal
Validar textos de consentimiento y flujos de mensajes con un abogado antes del piloto.
:::
