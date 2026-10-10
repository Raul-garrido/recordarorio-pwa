# Recordatorio

PWA para guardar sitios a los que quieres ir, recetas que ves en vídeos y otras ideas, con un mapa de chinchetas y filtros.

## Qué hace

- **Tipos**: Comer, Ver, Ocio, Recetas y Varios. Las recetas no llevan ubicación; en Varios es opcional.
- **Ubicación**: pega un enlace de Google Maps (lee las coordenadas), escribe una dirección y pulsa *Buscar* (OpenStreetMap / Nominatim) o toca el mapa.
- **Visto en**: varios enlaces por elemento (TikTok, Instagram, YouTube…), también añadibles después desde la ficha.
- **Pendientes / Visitados**: al registrar una visita (fecha + comentario) pasa a Visitados. Se pueden añadir tantas visitas como quieras. En las recetas, cada registro es una vez que la has hecho.
- **Filtros**: tipo, búsqueda (nombre, descripción, ingredientes, comentarios, plataforma) y, en Visitados, periodo y orden.
- **Compartir a la app** (Android, con la app instalada): desde Google Maps, TikTok o Instagram → Compartir → Recordatorio. Si es un vídeo, puedes añadirlo a algo que ya tengas guardado.
- **Sin conexión**: la app abre sin red y recuerda las zonas del mapa ya vistas.
- **Datos**: se guardan solo en el dispositivo (IndexedDB). En *Más* puedes descargar una copia y cargarla en otro móvil.

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
| `src/store.ts` | IndexedDB y copias de seguridad |
| `src/map.ts` | Mapa Leaflet + OpenStreetMap |
| `src/geocode.ts` | Dirección → coordenadas (Nominatim) |
| `src/views/*` | Lista, ficha, formulario y pestaña Más |
| `sw.template.js` | Service worker; `vite.config.ts` le añade la lista de archivos al compilar |
