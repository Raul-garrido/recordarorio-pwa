import { CATEGORIES, cat, iconSvg } from "../categories";
import { geocode, type GeoResult } from "../geocode";
import { cleanListName, emptyInfo, makeItem, parseTags, usage } from "../items";
import { normUrl, parseMapsLink, platformOf, type Coords } from "../links";
import type { MapView } from "../map";
import { byId, items, select, setTab, ui, upsert } from "../state";
import type { CatKey, Item, ItemInfo } from "../types";
import { $, esc, toast } from "../util";
import { setList } from "./list";

export interface FormPrefill {
  cat?: CatKey;
  name?: string;
  desc?: string;
  addr?: string;
  mapsUrl?: string;
  coords?: Coords | null;
  socials?: string[];
  tags?: string[];
  lists?: string[];
  info?: ItemInfo;
  /** Shown next to the location, e.g. "del mapa". */
  locSource?: string;
}

interface Draft {
  editId: string | null;
  cat: CatKey;
  loc: Coords | null;
  /** Where the location came from, shown to the user. */
  locSource: string;
  /** Socials that arrived through sharing, offered for attaching to an existing item. */
  shared: string[];
  /** A Maps link that arrived through sharing while the input shows its address instead. */
  sharedMaps: string;
  lists: Set<string>;
  info: ItemInfo;
}

const d: Draft = { editId: null, cat: "comer", loc: null, locSource: "", shared: [], sharedMaps: "", lists: new Set(), info: emptyInfo() };
let map: MapView;
let geoAbort: AbortController | null = null;
let lastGeoAt = 0;

const linkIn = () => $<HTMLInputElement>("#fLink");
const nameIn = () => $<HTMLInputElement>("#fName");

function setHint(text: string, kind: "" | "ok" | "warn" = ""): void {
  const h = $("#linkHint");
  h.className = `hint ${kind}`;
  h.textContent = text;
}

function renderCatPick(): void {
  $("#catpick").innerHTML = CATEGORIES.map(
    (c) => `<button type="button" class="c-${c.key}" data-k="${c.key}" aria-pressed="${d.cat === c.key}">
      <span class="ico">${iconSvg(c.key, 18)}</span>${esc(c.name)}<small>${esc(c.sub)}</small></button>`,
  ).join("");
}

function syncCat(): void {
  const c = cat(d.cat);
  const rec = c.location === "none";
  $("#locField").hidden = rec;
  $("#ingrField").hidden = !rec;
  const verb = d.editId ? "Editar" : "Añadir";
  $("#formTitle").textContent = rec ? `${verb} receta` : d.cat === "varios" ? `${verb} en Varios` : `${verb} sitio`;
  nameIn().placeholder = rec ? "Ej. Croquetas de jamón" : d.cat === "varios" ? "Ej. Idea de regalo" : "Ej. Bodega de la Ardosa";
  $<HTMLTextAreaElement>("#fDesc").placeholder = rec
    ? "Trucos del vídeo, tiempos, temperatura…"
    : "Qué pedir, qué ver, a qué hora ir…";
  $("#locField label").textContent =
    c.location === "optional"
      ? "Ubicación (opcional): enlace de Google Maps, dirección o coordenadas"
      : "Ubicación: enlace de Google Maps, dirección o coordenadas";
  renderCatPick();
  renderLocState();
}

function renderLocState(): void {
  const el = $("#locState");
  if (d.loc) {
    el.innerHTML = `<span class="ok">✓ Ubicación lista${d.locSource ? ` (${esc(d.locSource)})` : ""}: <span class="mono">${d.loc.lat.toFixed(5)}, ${d.loc.lng.toFixed(5)}</span></span>
      <span class="locbtns"><button type="button" class="btn ghost small" data-act="pick">Cambiar en el mapa</button><button type="button" class="btn ghost small" data-act="clear">Quitar</button></span>`;
  } else {
    el.innerHTML = `<span class="muted">Sin ubicación todavía.</span>
      <span class="locbtns"><button type="button" class="btn ghost small" data-act="pick">Elegir en el mapa</button></span>`;
  }
}

function setLoc(c: Coords | null, source = ""): void {
  d.loc = c;
  d.locSource = source;
  map.showDraft(c);
  renderLocState();
}

function onLinkInput(): void {
  const v = linkIn().value.trim();
  $("#geoResults").hidden = true;
  if (!v) {
    setHint("Pega un enlace de Google Maps (Compartir → Copiar enlace) o escribe la dirección y pulsa Buscar.");
    return;
  }
  const info = parseMapsLink(v);
  if (info.name && !nameIn().value.trim()) nameIn().value = info.name;
  if (info.coords) {
    setLoc(info.coords, info.isUrl ? "del enlace" : "coordenadas");
    setHint("Coordenadas leídas del enlace.", "ok");
  } else if (info.isShort) {
    setHint("Los enlaces cortos de Maps no traen la ubicación. Escribe el nombre y pulsa Buscar, o elígela en el mapa.", "warn");
  } else if (info.isUrl && !info.isMaps) {
    setHint("Ese enlace no es de Google Maps. Si es un vídeo, ponlo abajo en «Visto en».", "warn");
  } else if (info.isUrl) {
    setHint(info.query ? "Pulsa Buscar para encontrar el sitio del enlace." : "Pulsa Buscar con el nombre del sitio, o elígelo en el mapa.");
  } else {
    setHint("Pulsa Buscar para encontrar esta dirección.");
  }
}

function geoQuery(): string {
  const v = linkIn().value.trim();
  const info = parseMapsLink(v);
  if (info.query) return info.query;
  if (v && !info.isUrl) return v;
  return [nameIn().value.trim(), info.name].find(Boolean) ?? "";
}

async function geoSearch(): Promise<void> {
  const q = geoQuery();
  const out = $("#geoResults");
  if (!q) {
    setHint("Escribe una dirección o el nombre del sitio para buscar.", "warn");
    return;
  }
  // Nominatim allows one request per second.
  const wait = 1100 - (Date.now() - lastGeoAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeoAt = Date.now();
  geoAbort?.abort();
  geoAbort = new AbortController();
  setHint(`Buscando «${q}»…`);
  try {
    const res = await geocode(q, map.center(), geoAbort.signal);
    if (!res.length) {
      setHint("No encontré esa dirección. Prueba con calle y ciudad, o elige el sitio en el mapa.", "warn");
      out.hidden = true;
      return;
    }
    setHint(res.length === 1 ? "Encontrado:" : "Elige el resultado correcto:");
    out.innerHTML = res
      .map((r, i) => `<li><button type="button" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.label)}</span></button></li>`)
      .join("");
    out.hidden = false;
    out.onclick = (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button[data-i]");
      if (!b) return;
      pickResult(res[Number(b.dataset.i)]);
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    setHint("No se pudo buscar la dirección. ¿Tienes conexión? También puedes elegir el sitio en el mapa.", "warn");
  }
}

function pickResult(r: GeoResult): void {
  setLoc({ lat: r.lat, lng: r.lng }, "de la búsqueda");
  if (!nameIn().value.trim()) nameIn().value = r.name;
  const v = linkIn().value.trim();
  if (!v || /^https?:\/\//i.test(v)) linkIn().dataset.addr = r.label.split(",").slice(0, 3).join(",").trim();
  $("#geoResults").hidden = true;
  setHint("Ubicación elegida.", "ok");
}

function socialRow(value = ""): HTMLElement {
  const row = document.createElement("div");
  row.className = "srow";
  row.innerHTML = `<span class="plat">Enlace</span><input type="url" inputmode="url" placeholder="https://www.tiktok.com/@…/video/…" aria-label="Enlace del vídeo o post"><button type="button" class="rm" aria-label="Quitar enlace">×</button>`;
  const inp = row.querySelector("input")!;
  const tag = row.querySelector<HTMLElement>(".plat")!;
  const sync = () => {
    const v = inp.value.trim();
    tag.textContent = v ? platformOf(v) : "Enlace";
    tag.classList.toggle("on", !!v);
  };
  inp.value = value;
  inp.addEventListener("input", sync);
  row.querySelector(".rm")!.addEventListener("click", () => {
    row.remove();
    if (!$("#socials").children.length) $("#socials").append(socialRow());
  });
  sync();
  return row;
}

function renderAttach(): void {
  const field = $("#attachField");
  const candidates = [...items].sort((a, b) => a.name.localeCompare(b.name, "es"));
  field.hidden = d.editId !== null || !d.shared.length || !candidates.length;
  if (field.hidden) return;
  $("#attachSel").innerHTML =
    `<option value="">Elige uno…</option>` +
    candidates.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(cat(p.cat).name)}</option>`).join("");
}

function renderTagSugg(): void {
  const current = new Set(parseTags($<HTMLInputElement>("#fTags").value));
  const sugg = usage(items, "tags").filter((t) => !current.has(t.name)).slice(0, 12);
  $("#tagSugg").innerHTML = sugg.map((t) => `<button type="button" class="tag" data-addtag="${esc(t.name)}">+ #${esc(t.name)}</button>`).join("");
}

function renderListPick(): void {
  const names = [...new Set([...usage(items, "lists").map((l) => l.name), ...d.lists])];
  $("#listPick").innerHTML =
    names.map((n) => `<button type="button" class="listchip" data-list="${esc(n)}" aria-pressed="${d.lists.has(n)}">${esc(n)}</button>`).join("") +
    `<span class="inl newlist-inl"><input id="fNewList" placeholder="Nueva lista" aria-label="Nueva lista" maxlength="60"><button type="button" class="btn small" id="fNewListBtn">Añadir</button></span>`;
}

function addNewList(): void {
  const name = cleanListName($<HTMLInputElement>("#fNewList").value);
  if (!name) return;
  d.lists.add(name);
  renderListPick();
}

function showError(msg: string): void {
  const el = $("#formErr");
  el.textContent = msg;
  el.hidden = !msg;
}

function open(): void {
  $("#overlay").hidden = false;
  document.body.classList.add("modal");
}

export function closeForm(): void {
  $("#overlay").hidden = true;
  document.body.classList.remove("modal");
  stopPicking();
  map.showDraft(null);
  geoAbort?.abort();
}

let pickCallback: ((c: Coords) => void) | null = null;

function startPicking(after: (c: Coords) => void): void {
  pickCallback = after;
  $("#overlay").hidden = true;
  $("#pickbar").hidden = false;
  select(null);
  map.startPicking((c) => {
    const cb = pickCallback;
    stopPicking();
    cb?.(c);
  });
}

function stopPicking(): void {
  pickCallback = null;
  $("#pickbar").hidden = true;
  map.stopPicking();
}

function fill(p: FormPrefill & { ingr?: string }): void {
  d.lists = new Set(p.lists ?? (ui.list ? [ui.list] : []));
  d.info = p.info ?? emptyInfo();
  $<HTMLFormElement>("#form").reset();
  showError("");
  d.cat = p.cat ?? ([...ui.cats][0] || "comer");
  nameIn().value = p.name ?? "";
  $<HTMLTextAreaElement>("#fDesc").value = p.desc ?? "";
  $<HTMLTextAreaElement>("#fIngr").value = p.ingr ?? "";
  linkIn().value = p.mapsUrl || p.addr || "";
  linkIn().dataset.addr = p.mapsUrl && p.addr ? p.addr : "";
  $("#geoResults").hidden = true;
  const socials = p.socials?.length ? p.socials : [""];
  $("#socials").replaceChildren(...socials.map(socialRow));
  $<HTMLInputElement>("#fTags").value = (p.tags ?? [...ui.tags]).join(", ");
  renderTagSugg();
  renderListPick();
  setLoc(p.coords ?? null, p.coords ? "guardada" : "");
  syncCat();
  renderAttach();
  if (linkIn().value) onLinkInput();
  else setHint("Pega un enlace de Google Maps (Compartir → Copiar enlace) o escribe la dirección y pulsa Buscar.");
  if (p.coords) setLoc(p.coords, d.editId ? "guardada" : p.locSource ?? "del enlace");
  if (!d.editId && p.locSource === "del mapa") setHint("Datos del mapa. Solo te falta tu comentario.", "ok");
}

export function openAdd(prefill: FormPrefill = {}): void {
  d.editId = null;
  d.shared = prefill.socials ?? [];
  d.sharedMaps = "";
  fill(prefill);
  open();
  if (prefill.mapsUrl && !prefill.coords && (prefill.name || prefill.addr)) {
    // Shared from Google Maps with a short link: look the address up straight away.
    d.sharedMaps = prefill.mapsUrl;
    linkIn().value = prefill.addr || prefill.name || "";
    linkIn().dataset.addr = "";
    geoSearch();
  }
  setTimeout(() => (prefill.name ? $<HTMLTextAreaElement>("#fDesc") : linkIn()).focus({ preventScroll: true }), 50);
}

export function openEdit(id: string): void {
  const p = byId(id);
  if (!p) return;
  d.editId = id;
  d.shared = [];
  d.sharedMaps = "";
  fill({ ...p, coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null });
  open();
}

function collect(): Partial<Item> {
  const rec = cat(d.cat).location === "none";
  const v = linkIn().value.trim();
  const info = parseMapsLink(v);
  const addr = rec ? "" : info.isUrl ? linkIn().dataset.addr || "" : info.coords ? "" : v;
  const socials = [
    ...new Set(
      [...document.querySelectorAll<HTMLInputElement>("#socials input")].map((i) => normUrl(i.value)).filter(Boolean),
    ),
  ];
  return {
    name: nameIn().value.trim(),
    cat: d.cat,
    desc: $<HTMLTextAreaElement>("#fDesc").value.trim(),
    ingr: rec ? $<HTMLTextAreaElement>("#fIngr").value.trim() : "",
    addr,
    mapsUrl: rec ? "" : info.isMaps ? v : d.sharedMaps,
    lat: rec || !d.loc ? null : d.loc.lat,
    lng: rec || !d.loc ? null : d.loc.lng,
    socials,
    tags: parseTags($<HTMLInputElement>("#fTags").value),
    lists: [...d.lists],
    info: d.info,
  };
}

function save(fields: Partial<Item>): void {
  const existing = byId(d.editId);
  const item = existing ? { ...existing, ...fields } : makeItem(fields as Partial<Item> & { name: string; cat: CatKey });
  upsert(item);
  closeForm();
  if (!existing && ui.tab !== "pend") setTab("pend");
  if (ui.cats.size && !ui.cats.has(item.cat)) ui.cats.add(item.cat);
  // Make sure the item just saved is visible with the current list and tag filters.
  if (ui.list && !item.lists.includes(ui.list)) setList(null);
  if ([...ui.tags].some((t) => !item.tags.includes(t))) ui.tags.clear();
  select(item.id);
  map.focus(item);
  toast(existing ? "Cambios guardados." : `«${item.name}» guardado.`);
}

function submit(e: Event): void {
  e.preventDefault();
  const f = collect();
  if (!f.name) {
    showError("Ponle un nombre.");
    nameIn().focus();
    return;
  }
  if (cat(d.cat).location === "required" && f.lat == null) {
    showError("");
    toast("Falta la ubicación: toca el mapa donde está.");
    startPicking((c) => save({ ...f, lat: c.lat, lng: c.lng }));
    return;
  }
  save(f);
}

export function initForm(mapView: MapView): void {
  map = mapView;
  $("#catpick").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-k]");
    if (!b) return;
    d.cat = b.dataset.k as CatKey;
    syncCat();
  });
  linkIn().addEventListener("input", () => {
    linkIn().dataset.addr = "";
    onLinkInput();
  });
  linkIn().addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      geoSearch();
    }
  });
  $("#geoBtn").addEventListener("click", geoSearch);
  $("#locState").addEventListener("click", (e) => {
    const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "clear") setLoc(null);
    if (act === "pick") {
      startPicking((c) => {
        setLoc(c, "elegida en el mapa");
        open();
      });
    }
  });
  $<HTMLInputElement>("#fTags").addEventListener("input", renderTagSugg);
  $("#tagSugg").addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-addtag]")?.dataset.addtag;
    if (!t) return;
    const inp = $<HTMLInputElement>("#fTags");
    inp.value = [...parseTags(inp.value), t].join(", ");
    renderTagSugg();
  });
  $("#listPick").addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("#fNewListBtn")) return addNewList();
    const n = t.closest<HTMLElement>("[data-list]")?.dataset.list;
    if (!n) return;
    if (d.lists.has(n)) d.lists.delete(n);
    else d.lists.add(n);
    renderListPick();
  });
  $("#listPick").addEventListener("keydown", (e) => {
    if ((e.target as Element).id === "fNewList" && e.key === "Enter") {
      e.preventDefault();
      addNewList();
    }
  });
  $("#addSocial").addEventListener("click", () => {
    const r = socialRow();
    $("#socials").append(r);
    r.querySelector("input")!.focus();
  });
  $("#attachBtn").addEventListener("click", () => {
    const p = byId($<HTMLSelectElement>("#attachSel").value);
    if (!p) return showError("Elige a cuál añadir el enlace.");
    const socials = [...new Set([...p.socials, ...d.shared])];
    upsert({ ...p, socials });
    closeForm();
    select(p.id);
    map.focus(p);
    toast(`Enlace añadido a «${p.name}».`);
  });
  $("#form").addEventListener("submit", submit);
  $("#fCancel").addEventListener("click", closeForm);
  $("#overlay").addEventListener("click", (e) => {
    if ((e.target as Element).id === "overlay") closeForm();
  });
  // Picking always starts from the form, so cancelling goes back to it.
  $("#pickCancel").addEventListener("click", () => {
    stopPicking();
    open();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#pickbar").hidden) $("#pickCancel").click();
    else if (!$("#overlay").hidden) closeForm();
  });
}
