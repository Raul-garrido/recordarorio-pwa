# Recordatorio

PWA para guardar sitios a los que quieres ir, recetas que ves en vídeos y otras ideas, con un mapa de chinchetas y filtros.

## Qué hace

- **Tipos**: Comer, Ver, Ocio, Recetas y Varios. Las recetas no llevan ubicación; en Varios es opcional.
- **Ubicación**: pega un enlace de Google Maps (lee las coordenadas), escribe una dirección y pulsa *Buscar* (OpenStreetMap / Nominatim) o toca el mapa.
- **Locales del mapa**: al acercar el mapa salen como puntos los restaurantes, bares, museos, cines… de OpenStreetMap (Overpass). Al tocar uno se añade con nombre, tipo, dirección, horario, teléfono, web y etiquetas (cocina, terraza); solo falta tu comentario. También se buscan por nombre con *Buscar en el mapa*. Los que ya tienes guardados no se repiten.
- **Mapa o satélite**: botón en el mapa para cambiar a vista satélite (Esri World Imagery, con nombres de calles y lugares). Se recuerda.
- **Ampliar lista**: esconde el mapa para ver los resultados a pantalla completa; al tocar uno, vuelve el mapa con ese sitio.
- **Marcar a mano**: toca cualquier punto vacío del mapa (o mantén pulsado) y elige *Pendiente* o *Ya he estado*. Se rellena la dirección y se proponen los locales que hay al lado.
- **Foto rápida**: el botón *Foto* abre la cámara, guarda la foto con tu ubicación y te propone los locales de al lado. Si no hay tiempo, se guarda aunque no tenga nombre (usa la dirección).
- **Estado al añadir**: *Pendiente* o *Ya he estado* (con fecha, estrellas y comentario), y fotos del sitio desde la cámara o la galería.
- **Visto en**: varios enlaces por elemento (TikTok, Instagram, YouTube…), también añadibles después desde la ficha.
- **Pendientes / Visitados**: al registrar una visita (fecha + comentario) pasa a Visitados. Se pueden añadir tantas visitas como quieras. En las recetas, cada registro es una vez que la has hecho.
- **Listas** por viaje o ciudad ("Lisboa mayo", "Madrid"): selector arriba de la lista; lo nuevo va a la lista activa. Se renombran o quitan en *Más*.
- **Etiquetas** libres (#terraza, #barato) para filtrar dentro de cada tipo.
- **Valoración y fotos** en cada visita (1–5 estrellas). La ficha muestra la media; las fotos se reducen a 1600 px antes de guardarlas.
- **Filtros**: tipo, etiquetas, búsqueda (nombre, descripción, ingredientes, etiquetas, comentarios, plataforma) y, en Visitados, periodo.
- **Orden**: recientes, A–Z y **Cerca de mí** (con la ubicación del móvil, muestra la distancia); en Visitados también más veces y mejor valorados.
- **Compartir a la app** (Android, con la app instalada): desde Google Maps, TikTok o Instagram → Compartir → Recordatorio. Si es un vídeo, puedes añadirlo a algo que ya tengas guardado.
- **Sin conexión**: la app abre sin red y recuerda las zonas del mapa ya vistas.
- **Datos**: se guardan solo en el dispositivo (IndexedDB). En *Más* puedes descargar una copia (con o sin fotos) y cargarla en otro móvil.

## Desarrollo

```sh
npm install
npm run dev        # servidor local
npm test           # pruebas
npm run build      # genera dist/
npm run preview    # sirve dist/ (con service worker)
```

Iconos: `node scripts/icons.mjs` (necesita Playwright) regenera los PNG a partir de `public/icons/icon.svg`.

## Añadir un tipo nuevo

Añade una entrada a `CATEGORIES` en `src/categories.ts` y su clave a `CatKey` en `src/types.ts`. Colores, filtro, chincheta y formulario salen de ahí.

## Publicación

`.github/workflows/deploy.yml` pasa las pruebas y publica en GitHub Pages cada push a `main`. Hay que activarlo una vez en *Settings → Pages → Source: GitHub Actions*.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/types.ts`, `src/categories.ts` | Modelo de datos y tipos |
| `src/links.ts` | Lee enlaces de Maps, detecta TikTok/Instagram… y lo que llega al compartir |
| `src/items.ts` | Filtros, orden, visitas, validación e importación |
| `src/store.ts` | IndexedDB (elementos y fotos) y copias de seguridad |
| `src/photos.ts` | Reduce, guarda y muestra las fotos de las visitas |
| `src/map.ts` | Mapa Leaflet + OpenStreetMap |
| `src/geocode.ts` | Dirección → coordenadas (Nominatim) |
| `src/poi.ts`, `src/views/pois.ts` | Locales del mapa: carga, búsqueda y alta con sus datos |
| `src/views/*` | Lista, ficha, formulario y pestaña Más |
| `sw.template.js` | Service worker; `vite.config.ts` le añade la lista de archivos al compilar |
