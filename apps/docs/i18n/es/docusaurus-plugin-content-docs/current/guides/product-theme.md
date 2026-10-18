---
sidebar_position: 3.5
title: "Tema del producto"
description: "Cómo se diferencia la interfaz del producto de la marca, y las reglas para pantallas de datos."
---

# Tema del *producto*

El Manager y la Platform usan la marca Atrium como tinta sobre papel: un solo crema para la página y las tarjetas, tarjetas dibujadas con un contorno de 1px en vez de relleno o sombra, y el lima como única muestra de resaltador. El estilo toma su disciplina de Pirsch Analytics (plano, con contorno, un solo acento) y conserva lo propio de Atrium: lima, clay, charcoal, Inter Tight, Instrument Serif, etiquetas en versalitas espaciadas y el resaltado de marcador. La marca (el sitio y el sistema de diseño de `atrium-docs`) no cambia. La capa del producto vive en `packages/ui/src/tokens-product.css` y se carga después de `tokens.css`, así que solo sobrescribe valores.

## Qué cambia el producto

| Token | Marca | Producto |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f8f5ed` |
| `--surface-card` | `#fbf8f1` | `#f8f5ed` (igual que la página) |
| `--surface-sunken` | `#e9e1d1` | `#efe9dc` |
| `--border-frame` (nuevo, `border-frame`) | ninguno | `#242726`, el contorno de tarjetas, tablas y fichas |
| Radio de tarjeta (`rounded-card`) | 6px | 16px |
| Radio de control (`rounded-control`): campos, fichas pequeñas | 4px | 6px |
| Botones | 4px | píldora (`rounded-full`) |

El botón primario es lima con borde de tinta: el lima sobre crema da 1,4:1, así que el borde es lo que muestra el botón. Las insignias de estado son píldoras con contorno, una palabra y una marca, con los colores de estado de la marca. Cada color de texto de estado sobre su fondo da al menos 4,5:1, y una prueba lo exige. Las tablas se enmarcan como tarjetas, sin regla de tinta arriba. Una tarjeta interactiva se ilumina con un lavado de lima al pasar el cursor; no se eleva ni proyecta sombra.

Sin cambios: lima, clay, charcoal, Inter Tight, la barra lateral oscura, el tema oscuro y el movimiento. El tema oscuro conserva sus valores: la capa del producto se aplica a una raíz que no sea `data-atr-theme="dark"`, y una región oscura cambia el contorno de tinta por la línea fina oscura.

## Reglas para las pantallas del producto

- Una sola acción primaria lima por pantalla. Los botones con contorno son la secundaria.
- Sin sombra en el contenido. La sombra es para popovers y menús.
- Nada de blanco. El crema es la página y la tarjeta.
- El lima es una señal, no un relleno de áreas grandes. El clay es para errores y foco, nunca un botón en una pantalla de datos.
- Un estado nunca se indica solo con color.

## La página de datos

Una página de datos es una cabecera con como máximo una acción primaria, un `FilterBar` y un `DataTable`.

- `useTableState` guarda la búsqueda, los filtros, el orden y la página en la dirección (`?severity=high&sort=due:asc&page=2`). Se puede compartir un enlace y el botón atrás funciona. Se le pasa un `TableSpec` estable.
- `applyTableState` filtra en el navegador. La búsqueda es una coincidencia simple de texto.
- `DataTable` pagina de 25 en 25 filas, y la primera celda de una fila puede ser un enlace que cubre toda la fila.
- Un filtro que no encuentra nada es un estado vacío distinto de una tabla sin datos, y ofrece "Clear filters".

## La campana

La campana agrupa las notificaciones por día, muestra un icono según el tipo, una línea de contexto y la acción que se espera de la persona. Una notificación con destino abre ese caso, lugar o solicitud; una antigua abre la lista. "See all" abre una página de datos con filtros por tipo y estado de lectura.
