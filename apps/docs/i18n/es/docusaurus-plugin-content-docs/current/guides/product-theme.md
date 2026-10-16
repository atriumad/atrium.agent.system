---
sidebar_position: 3.5
title: "Tema del producto"
description: "Cómo se diferencia la interfaz del producto de la marca, y las reglas para pantallas de datos."
---

# Tema del *producto*

El Manager y la Platform usan la marca Atrium sobre una interfaz de papel y tarjetas pensada para datos densos. La marca (el sitio y el sistema de diseño de `atrium-docs`) no cambia. La capa del producto vive en `packages/ui/src/tokens-product.css` y se carga después de `tokens.css`, así que solo sobrescribe valores.

## Qué cambia el producto

| Token | Marca | Producto |
| --- | --- | --- |
| `--surface-page` | `#f4eee2` | `#f6f5f4` |
| `--surface-card` | `#fbf8f1` | `#ffffff` |
| `--surface-sunken` | `#e9e1d1` | `#f1efec` |
| `--border-light` | `#d4cab6` | `rgba(0, 0, 0, 0.08)` |
| Radio de tarjeta (`rounded-card`) | 6px | 12px |
| Radio de control (`rounded-control`) | 4px | 8px |

Las insignias de estado son píldoras con una palabra y una marca. Cada color de texto de estado sobre su fondo da al menos 4,5:1, y una prueba lo exige. Las tablas se enmarcan como tarjetas, sin regla de tinta arriba.

Sin cambios: lima, clay, charcoal, Inter Tight, la barra lateral oscura, el tema oscuro y el movimiento. El tema oscuro no se sobrescribe: la capa del producto se aplica a una raíz que no sea `data-atr-theme="dark"`.

## Reglas para las pantallas del producto

- Una sola acción primaria oscura por pantalla.
- Sin sombra en el contenido. La sombra es para popovers y menús.
- El blanco es una superficie de tarjeta, nunca el fondo de la página.
- Un estado nunca se indica solo con color.

## La página de datos

Una página de datos es una cabecera con como máximo una acción primaria, un `FilterBar` y un `DataTable`.

- `useTableState` guarda la búsqueda, los filtros, el orden y la página en la dirección (`?severity=high&sort=due:asc&page=2`). Se puede compartir un enlace y el botón atrás funciona. Se le pasa un `TableSpec` estable.
- `applyTableState` filtra en el navegador. La búsqueda es una coincidencia simple de texto.
- `DataTable` pagina de 25 en 25 filas, y la primera celda de una fila puede ser un enlace que cubre toda la fila.
- Un filtro que no encuentra nada es un estado vacío distinto de una tabla sin datos, y ofrece "Clear filters".

## La campana

La campana agrupa las notificaciones por día, muestra un icono según el tipo, una línea de contexto y la acción que se espera de la persona. Una notificación con destino abre ese caso, lugar o solicitud; una antigua abre la lista. "See all" abre una página de datos con filtros por tipo y estado de lectura.
