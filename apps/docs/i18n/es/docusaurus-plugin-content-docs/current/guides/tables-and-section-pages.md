---
sidebar_position: 3.7
title: "Tablas y páginas de sección"
description: "Cómo se arma una página de sección, las reglas que sigue toda tabla y qué muestran las páginas Cases y Responses."
---

# Tablas y *páginas de sección*

Cases y Responses son páginas de sección: un resumen corto arriba y, debajo, una tabla convencional con una fila por caso o por respuesta. Las dos apps usan las mismas páginas (el Manager y la Platform) y la seguridad por filas decide qué filas ve cada persona. Las piezas viven en `@atrium/ui` (`DataSectionPage`, `DataTable`, `FilterBar`).

## La página

De arriba abajo:

1. **Encabezado.** El título y una línea de descripción a la izquierda; a la derecha el rango (`7D`, `30D`, `90D`) y el selector **Place**. Por defecto es `30D` y todos los lugares.
2. **Banda de resumen.** Cuatro cifras y, al lado o debajo, un gráfico o un reparto ordenado. Tiene su propia carga y su propio error con botón Retry, así que una banda lenta nunca retiene la tabla.
3. **Una nota** que dice que los filtros se aplican a la tabla y que el resumen sigue el rango y el lugar.
4. **Pestañas**, cada una con su conteo (estado en Cases, filtros rápidos en Responses).
5. **Barra de filtros.** Búsqueda, selectores, los filtros activos como chips, un conteo ("8 of 107") y "Clear all".
6. **La tabla**, enmarcada como una tarjeta, con un pie ("Showing 1–25 of 107 · sorted by …") y el paginador.

En pantallas desde `lg` (1024px) las cuatro cifras van en una fila; por debajo van de dos en dos y los bloques de gráfico se apilan. Desde `2xl` (1536px) los bloques de gráfico ocupan el tercio derecho de la banda.

## Las reglas de la tabla

Toda tabla sigue las mismas reglas, así que la persona aprende una sola.

- **Una línea por fila.** Un texto largo se corta con puntos suspensivos y el texto completo aparece al pasar el cursor.
- **La primera columna es el enlace.** La fila entera abre el detalle; un enlace o botón dentro de la fila sigue funcionando por su cuenta.
- **Los números van alineados a la derecha**, en cifras tabulares.
- **Un estado siempre lleva una palabra** junto a su marca (`Overdue`, `Negative`, `Resolved`). El color nunca es la única señal.
- **Las fechas** se leen `Oct 18, 9:40`, en la zona horaria de quien mira, con el tiempo transcurrido al pasar el cursor. Un rating se lee como estrellas (`★★☆☆☆`) y como "2 of 5" para un lector de pantalla.
- **Encabezado fijo** en pantallas grandes: el encabezado se queda a la vista mientras las filas se desplazan.
- **Las pantallas pequeñas** desplazan la tabla de lado y mantienen fija la primera columna. La banda se apila.
- **Nada que mostrar.** La tabla dice que aún no hay datos, o que los filtros no encontraron nada, con un botón "Clear filters".

### Ancho completo y columnas que se ocultan

El contenido usa todo el ancho de la ventana. Por debajo de unos **1536px** (`2xl`) se ocultan las columnas menos importantes para que el comentario conserve espacio para leerse:

| Página | Columna | Se oculta por debajo de | Dónde sigue disponible la información |
| --- | --- | --- | --- |
| Cases | Opened | 1280px (`xl`) | La página del caso dice cuándo se abrió |
| Cases | Topics | 1536px (`2xl`) | El filtro `Topic (read answers)` sigue acotando la tabla |
| Responses | Topics | 1536px (`2xl`) | El cajón de la fila muestra la lectura y sus temas |

## El rango y el lugar mueven la banda y la tabla

El rango y el lugar de arriba mueven tanto la banda como la tabla:

- El **rango** fija la ventana: los últimos 7, 30 o 90 días. Los días son los días locales de cada lugar, como en [Leer el Overview](./reading-the-overview#rango-y-lugar).
- El **lugar** se aplica en el servidor, para las filas y para los conteos de las pestañas, así que una página de un solo lugar no es la lista entera recortada en el navegador. En Cases, el filtro `Place` de la barra es el mismo control que el del encabezado; Responses no tiene filtro `Place` en la barra, solo el del encabezado.
- **Las pestañas, los chips, la búsqueda y los filtros de columna acotan solo la tabla.** La banda no cambia mientras alguien busca. Cambiar el rango o el lugar vuelve a la página 1.

## Cases

La página Cases (`Recovery cases` en el Manager, `Guest feedback to follow up` en la Platform) lista los casos de la ventana: abiertos en ella, o todavía abiertos o contactados sin importar cuándo se abrieron.

**La banda.** Cuatro cifras: `Active`, `Overdue`, `Median time to contact` y `Resolved`; después `Opened per day` y `By severity` (high, medium, low).

- `Active` cuenta los casos abiertos más los contactados, ahora. Su nota dice cuántos están vencidos. Es el mismo número que la pestaña `Active`. La pestaña `Open`, en cambio, significa solo abiertos: un caso contactado está en `Active` y no en `Open`.
- `Overdue` también es una cifra de "ahora", con el número de la ventana anterior como nota.
- `Median time to contact` usa la definición del Overview, con la meta de 24 horas.
- `Resolved` cuenta los casos resueltos en la ventana.

**Pestañas.** `Active`, `Open`, `Contacted`, `Resolved` y `All`. Sus conteos vienen del servidor para toda la ventana y el lugar, así que se mantienen correctos incluso con más de 200 casos. La tabla guarda como máximo los últimos 200 casos; cuando hay más, el pie dice "Showing the latest 200 cases".

**Columnas.**

| Columna | Qué muestra |
| --- | --- |
| Severity | `High`, `Medium` o `Low`, como una píldora |
| Rating | Las estrellas del huésped |
| Place | El lugar; el cliente y el lugar (`Client · Place`) para el staff de la agencia |
| What the guest said | Los primeros 160 caracteres del comentario, cortado a una línea |
| Topics | Hasta dos temas y `+N`; un guion cuando la respuesta aún no se ha leído |
| Due | Cuándo vence el caso, o una píldora `Overdue` con hace cuánto. El orden por defecto, el más antiguo primero |
| Opened | Cuándo se abrió el caso |
| Status | `Open`, `Contacted` o `Resolved` |

**Filtros.** Búsqueda, `Severity`, `Place`, `Topic (read answers)` y `Wants contact`. La búsqueda mira el comentario que muestra la tabla, sin distinguir mayúsculas. Los filtros trabajan sobre los casos cargados. Cuando algunos aún no se han leído, el pie dice "N not read, so no topics".

**La fila** abre la página del caso.

## Responses

La página Responses lista las respuestas de la ventana. A diferencia de Cases, pagina en el servidor: es la única lista que crece sin límite, y cada página pide sus propias 25 filas.

**La banda.** Cuatro cifras: `Responses`, `Average rating`, `Negative share` y `Review link clicks`; después `Rating distribution`, cinco barras (1 a 5 estrellas) con sus conteos.

- `Negative share` es la proporción de las respuestas **que se leyeron** y resultaron negativas. Su nota dice "of N answers that were read". Una respuesta sin lectura no se cuenta como negativa. Tiene su propia regla de muestra pequeña: el cambio aparece solo con 10 o más respuestas leídas en las dos ventanas.
- `Review link clicks` cuenta los clics y muestra su proporción sobre **todas** las respuestas de la ventana.
- El rating, la regla de muestra pequeña y las unidades de cambio son las de [Leer el Overview](./reading-the-overview#la-regla-de-muestra-pequeña).

**Pestañas.** `All`, `3 stars or fewer`, `Wants contact`, `Has a case` y `Safety`. Los conteos vienen del servidor para la ventana y el lugar; los demás filtros no los cambian. `Safety` muestra solo las respuestas que la lectura marcó, y muestra 0 cuando nada está marcado o nada se ha leído.

**Columnas.**

| Columna | Qué muestra |
| --- | --- |
| Date | Cuándo respondió el huésped. El orden por defecto, la más reciente primero |
| Rating | Las estrellas |
| Place | El lugar; `Client · Place` para el staff de la agencia |
| Comment | El comentario, cortado a una línea; "No comment" cuando no hay |
| Sentiment | `Positive`, `Mixed` o `Negative`; un guion cuando la respuesta no se ha leído |
| Topics | Hasta dos temas y `+N` |
| Contact | `Yes` cuando el huésped pidió que lo contacten |
| Review | Una marca cuando el huésped fue al enlace de reseña |
| Case | `View case` cuando la respuesta abrió un caso |

Solo ordenan `Date`, `Rating`, `Place` y `Sentiment`. Ordenan en el servidor, a través de todas las páginas.

**Filtros.** Búsqueda, `Rating`, `Sentiment` y `Topic (read answers)`, más el lugar del encabezado.

**La fila** abre un cajón, no una página.

## La lectura: sentimiento y temas

Cada respuesta que se ha leído lleva un sentimiento, una lista de temas, una preocupación y una marca de seguridad. El sentimiento es `positive`, `mixed` o `negative`. Los temas son food, service, wait, cleanliness, price, atmosphere, staff y other.

**Not read yet** significa que la respuesta no tiene lectura: el servicio de Sentiment no la ha leído, o está apagado. Su sentimiento y sus temas se muestran como un guion, y el cajón dice "Not read yet". Por eso los filtros de tema y sentimiento se llaman `Topic (read answers)` y solo coinciden con respuestas leídas. El pie dice cuántas filas aún no tienen lectura.

## Búsqueda

- En Responses, la búsqueda mira el comentario, lo mejor y qué mejorar, sin distinguir mayúsculas.
- El texto se recorta de espacios y se corta a **200 caracteres**.
- La petición sale tras una breve pausa (300 ms) desde la última tecla, así que escribir no envía una petición por letra. Vaciar la caja se aplica al instante.
- `%` y `_` coinciden consigo mismos; no son comodines.

## La página del caso

Un caso se abre en su propia página: `/reputation/cases/<id>` en el Manager y `/reputation/feedback/<id>` en la Platform. Muestra la respuesta, los datos de contacto donde se permite, la línea de tiempo y las acciones.

`Back to cases` vuelve a la tabla como la persona la dejó. El enlace de la fila lleva la dirección de la tabla en un parámetro `back` (`?back=…`), con los filtros, el orden, el rango y el lugar. Las notificaciones de la campana abren la misma página.

Un enlace antiguo `?case=<id>` sigue funcionando: se lee y se redirige a la página del caso, conservando los demás parámetros.

## El cajón de la respuesta

Una fila de Responses abre un cajón a la derecha, y la tabla se queda donde está.

- Muestra la respuesta completa (comentario, lo mejor, qué mejorar), la lectura (sentimiento, preocupación, temas, marca de seguridad), la preferencia de contacto del huésped y si fue al enlace de reseña.
- `Open case` aparece cuando la respuesta tiene un caso.
- `Ask for help about this` aparece para los dueños, que pueden pedir ayuda; abre una solicitud de ayuda sobre esa respuesta.
- `Escape` cierra el cajón. La dirección no cambia, así que un cajón no es algo para compartir.

## La dirección es el estado

El rango, el lugar, la pestaña, los filtros, la búsqueda, el orden y la página viven en la dirección (por ejemplo `?range=7d&place=<id>&tab=low&sort=rating:asc&page=2`). Una vista filtrada se puede compartir y el botón de atrás funciona. Un lugar fuera del alcance de la persona no encuentra nada.

## Lo que no está

- **Exportar a CSV.** Los comentarios de los huéspedes son datos de terceros; exportarlos necesita reglas por rol.
- **Selección múltiple y acciones en bloque.**
- **Un selector de columnas** y un cambio de densidad.
- **El indicador de origen QR o enlace** que mostraba la lista antigua de Responses.
- **Paginación en el servidor para Cases.** La tabla guarda las últimas 200 y lo dice.
