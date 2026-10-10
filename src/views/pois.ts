import { cat } from "../categories";
import type { MapView } from "../map";
import { addressOf, cuisineLabels, fetchPois, findSaved, hoursEs, kindOf, prefillFromPoi, searchPois, type Bounds, type Poi } from "../poi";
import { items, select, ui } from "../state";
import type { Coords } from "../links";
import { $, esc, toast } from "../util";
import { openAdd } from "./form";

/** Map places only load when zoomed in this far, so each request covers a few streets. */
export const POI_ZOOM = 17;

const cache = new Map<string, Poi>();
let loaded: Bounds | null = null;
let results: Poi[] = [];
let abort: AbortController | null = null;
let timer = 0;
let lastSearchAt = 0;
let map: MapView;
/** Point the user tapped to add a pin of their own. */
let markAt: Coords | null = null;

function showMark(c: Coords): void {
  markAt = c;
  map.showPopup(c, `<div class="poipop">
    <b>¿Añadir este punto?</b>
    <span class="muted">Aunque no salga ningún local, puedes guardarlo.</span>
    <div class="row">
      <button type="button" class="btn primary small" data-mark="pend">+ Pendiente</button>
      <button type="button" class="btn small" data-mark="done">✓ Ya he estado</button>
    </div>
  </div>`);
}

const inside = (b: Bounds, outer: Bounds) => b.s >= outer.s && b.n <= outer.n && b.w >= outer.w && b.e <= outer.e;

function pad(b: Bounds, f: number): Bounds {
  const dy = (b.n - b.s) * f, dx = (b.e - b.w) * f;
  return { s: b.s - dy, n: b.n + dy, w: b.w - dx, e: b.e + dx };
}

function hint(text: string): void {
  const el = $("#poiHint");
  el.textContent = text;
  el.hidden = !text;
}

/** Redraws map places, leaving out the ones already saved (they have their own pin). */
export function drawPois(): void {
  if (!map) return;
  const zoomed = map.map.getZoom() >= POI_ZOOM;
  const b = map.bounds();
  const visible = zoomed
    ? [...cache.values()].filter((p) => p.lat >= b.s && p.lat <= b.n && p.lng >= b.w && p.lng <= b.e)
    : [];
  const byId = new Map([...visible, ...results].map((p) => [p.id, p]));
  const shown = [...byId.values()].filter((p) => !findSaved(items, p));
  map.setPois(shown, new Set(results.map((p) => p.id)));
}

async function load(): Promise<void> {
  if (map.map.getZoom() < POI_ZOOM) {
    hint(results.length ? "" : "Acerca el mapa para ver restaurantes, bares y lugares, o búscalos arriba.");
    drawPois();
    return;
  }
  const view = map.bounds();
  if (loaded && inside(view, loaded)) {
    hint("");
    drawPois();
    return;
  }
  abort?.abort();
  abort = new AbortController();
  const area = pad(view, 0.3);
  hint("Cargando locales…");
  try {
    const pois = await fetchPois(area, abort.signal);
    for (const p of pois) cache.set(p.id, p);
    loaded = area;
    hint("");
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    console.warn(e);
    hint("No se pudieron cargar los locales. Prueba a mover el mapa.");
  }
  drawPois();
}

function popupHtml(p: Poi): string {
  const k = kindOf(p.tags);
  const kinds = [k.label, ...cuisineLabels(p.tags)].join(" · ");
  const addr = addressOf(p.tags);
  const hours = p.tags.opening_hours ? hoursEs(p.tags.opening_hours) : "";
  const saved = findSaved(items, p);
  return `<div class="poipop c-${k.cat}">
    <b>${esc(p.name)}</b>
    <span class="kind">${esc(kinds)}</span>
    ${addr ? `<span>${esc(addr)}</span>` : ""}
    ${hours ? `<span class="muted">${esc(hours)}</span>` : ""}
    ${
      saved
        ? `<button type="button" class="btn small" data-poi-open="${esc(saved.id)}">Ya lo tienes: ver ficha</button>`
        : `<button type="button" class="btn primary small" data-poi-add="${esc(p.id)}">+ Añadir a ${esc(cat(k.cat).name)}</button>`
    }
  </div>`;
}

function showPoi(p: Poi): void {
  map.showPopup(p, popupHtml(p));
}

async function search(q: string): Promise<void> {
  const wait = 1100 - (Date.now() - lastSearchAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearchAt = Date.now();
  hint(`Buscando «${q}»…`);
  try {
    results = await searchPois(q, map.bounds());
  } catch (e) {
    console.warn(e);
    hint("");
    toast("No se pudo buscar. ¿Tienes conexión?");
    return;
  }
  $("#mapSearchClear").hidden = !results.length;
  if (!results.length) {
    hint("");
    toast(`No encontré «${q}» en el mapa. Prueba con otro nombre o añade la ciudad.`);
    drawPois();
    return;
  }
  hint(results.length > 1 ? `${results.length} resultados. Toca uno para verlo.` : "");
  for (const p of results) cache.set(p.id, p);
  drawPois();
  map.fitPoints(results);
  if (results.length === 1) {
    const saved = findSaved(items, results[0]);
    if (saved) {
      select(saved.id);
      toast(`«${saved.name}» ya está guardado.`);
    } else {
      setTimeout(() => showPoi(results[0]), 400);
    }
  }
}

function clearSearch(): void {
  results = [];
  $<HTMLInputElement>("#mapSearchIn").value = "";
  $("#mapSearchClear").hidden = true;
  load();
}

export function initPois(mapView: MapView): void {
  map = mapView;
  map.onPoi = showPoi;
  map.onEmptyTap = (c) => {
    // With a card open, the first tap on the map just closes it.
    if (ui.sel) return select(null);
    showMark(c);
  };
  map.onLongPress = showMark;
  map.map.on("moveend", () => {
    clearTimeout(timer);
    timer = window.setTimeout(load, 600);
  });
  map.map.getContainer().addEventListener("click", (e) => {
    const t = e.target as Element;
    const add = t.closest<HTMLElement>("[data-poi-add]")?.dataset.poiAdd;
    if (add) {
      const p = cache.get(add);
      map.closePopup();
      if (p) openAdd({ ...prefillFromPoi(p), locSource: "del mapa" });
      return;
    }
    const mark = t.closest<HTMLElement>("[data-mark]")?.dataset.mark;
    if (mark && markAt) {
      map.closePopup();
      openAdd({ coords: markAt, locSource: "marcada en el mapa", status: mark === "done" ? "done" : "pend", lookupNear: true });
      return;
    }
    const open = t.closest<HTMLElement>("[data-poi-open]")?.dataset.poiOpen;
    if (open) {
      map.closePopup();
      select(open);
    }
  });
  $("#mapSearch").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $<HTMLInputElement>("#mapSearchIn").value.trim();
    if (q) search(q);
    else clearSearch();
  });
  $("#mapSearchClear").addEventListener("click", clearSearch);
  load();
}
