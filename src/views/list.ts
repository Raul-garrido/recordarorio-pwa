import { CATEGORIES, cat, countLabel, iconSvg, isCatKey } from "../categories";
import { fmtDate } from "../dates";
import {
  avgRating, cleanListName, distanceKm, effectiveOrder, fmtDistance, hasLoc, isDone, lastVisit,
  matchesQuery, matchesScope, matchesTab, ORDERS_BY_TAB, usage, visibleItems,
} from "../items";
import { platformOf } from "../links";
import { items, render, select, setTab, ui } from "../state";
import type { Item, Order, Period } from "../types";
import { $, esc, ICONS, toast } from "../util";

const PERIODS: Record<Period, string> = { all: "Siempre", d30: "Últimos 30 días", year: "Este año" };
const ORDER_NAMES: Record<Order, string> = { recent: "Recientes", most: "Más veces", rating: "Mejor valorados", near: "Cerca de mí", az: "A–Z" };
const LIST_KEY = "recordatorio.list";

export const currentItems = () => visibleItems(items, ui);

export const stars = (n: number) =>
  `<span class="stars" aria-label="${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} de 5">★ ${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</span>`;

export function setList(name: string | null): void {
  ui.list = name;
  ui.tags.clear();
  try {
    if (name) localStorage.setItem(LIST_KEY, name);
    else localStorage.removeItem(LIST_KEY);
  } catch {
    /* not remembered */
  }
}

export function restoreList(): void {
  try {
    const name = localStorage.getItem(LIST_KEY);
    if (name && items.some((p) => p.lists.includes(name))) ui.list = name;
  } catch {
    /* nothing saved */
  }
}

export function renderListBar(): void {
  const lists = usage(items, "lists");
  // A just-created list has no items yet but must still show as selected.
  if (ui.list && !lists.some((l) => l.name === ui.list)) lists.unshift({ name: ui.list, n: 0 });
  $("#listSel").innerHTML =
    `<option value="">Todas (${items.length})</option>` +
    lists.map((l) => `<option value="${esc(l.name)}" ${l.name === ui.list ? "selected" : ""}>${esc(l.name)} (${l.n})</option>`).join("");
}

export function renderTabs(): void {
  const scoped = items.filter((p) => matchesScope(p, { list: ui.list, tags: new Set() }));
  const nDone = scoped.filter(isDone).length;
  $("#tabPend").innerHTML = `Pendientes <b>${scoped.length - nDone}</b>`;
  $("#tabDone").innerHTML = `Visitados <b>${nDone}</b>`;
  for (const [id, tab] of [["#tabPend", "pend"], ["#tabDone", "done"], ["#tabMore", "more"]] as const) {
    $(id).setAttribute("aria-selected", String(ui.tab === tab));
  }
  $("#paneList").hidden = ui.tab === "more";
  $("#paneMore").hidden = ui.tab !== "more";
}

export function renderFilters(): void {
  if (ui.tab === "more") return;
  const inTab = items.filter((p) => matchesTab(p, ui) && matchesScope(p, { list: ui.list, tags: new Set() }));
  const base = inTab.filter((p) => matchesScope(p, ui) && matchesQuery(p, ui.q));
  const btn = (key: string, label: string, n: number, pressed: boolean) =>
    `<button type="button" class="fbtn ${key === "all" ? "" : `c-${key}`}" data-cat="${key}" aria-pressed="${pressed}"><i></i>${label} <b>${n}</b></button>`;
  $("#fcats").innerHTML =
    btn("all", "Todo", base.length, ui.cats.size === 0) +
    CATEGORIES.map((c) => btn(c.key, c.name, base.filter((p) => p.cat === c.key).length, ui.cats.has(c.key))).join("");

  // Tags used in this tab and list; selected ones stay visible even if nothing else matches.
  const tags = usage(inTab, "tags");
  for (const t of ui.tags) if (!tags.some((x) => x.name === t)) tags.push({ name: t, n: 0 });
  const ftags = $("#ftags");
  ftags.hidden = !tags.length;
  ftags.innerHTML = tags
    .slice(0, 24)
    .map((t) => `<button type="button" class="tag" data-tag="${esc(t.name)}" aria-pressed="${ui.tags.has(t.name)}">#${esc(t.name)}</button>`)
    .join("");

  const done = ui.tab === "done";
  $("#fperiodLabel").hidden = !done;
  $("#fperiod").hidden = !done;
  const seg = (sel: string, opts: [string, string][], cur: string) => {
    $(sel).innerHTML = opts.map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === cur}">${v}</button>`).join("");
  };
  seg("#fperiod", Object.entries(PERIODS), ui.period);
  seg("#forder", ORDERS_BY_TAB[done ? "done" : "pend"].map((o) => [o, ORDER_NAMES[o]]), effectiveOrder(ui));
}

function itemHtml(p: Item): string {
  const done = isDone(p);
  const l = cat(p.cat).log;
  const plats = [...new Set(p.socials.map(platformOf))];
  const tags: string[] = [];
  if (ui.here && hasLoc(p) && effectiveOrder(ui) === "near") {
    tags.push(`<span class="dist">${fmtDistance(distanceKm(ui.here, { lat: p.lat!, lng: p.lng! }))}</span>`);
  }
  if (!hasLoc(p) && cat(p.cat).location !== "none") tags.push('<span class="noloc">Sin ubicación</span>');
  if (plats.length) {
    tags.push(`<span class="vids" title="Visto en ${esc(plats.join(", "))}">${ICONS.play}${esc(plats.join(" · "))}${p.socials.length > 1 ? ` (${p.socials.length})` : ""}</span>`);
  }
  for (const t of p.tags) tags.push(`<span class="tagtxt">#${esc(t)}</span>`);
  let body: string;
  if (done) {
    const lv = lastVisit(p);
    const last = p.visits.find((v) => v.date === lv)!;
    const r = avgRating(p);
    body = `<div class="last">${ICONS.cal}${fmtDate(lv)} <em>· ${countLabel(p.cat, p.visits.length)}</em>${r ? stars(r) : ""}</div>
      ${last.note ? `<p>“${esc(last.note)}”</p>` : ""}`;
  } else {
    body = p.desc || p.addr ? `<p>${esc(p.desc || p.addr)}</p>` : "";
  }
  const action = done
    ? `<button type="button" class="check plus" data-visit="${esc(p.id)}" aria-label="${esc(l.more)}" title="${esc(l.more)}">+</button>`
    : `<button type="button" class="check" data-visit="${esc(p.id)}" aria-label="${esc(l.cta)}" title="${esc(l.cta)}">${ICONS.check}</button>`;
  return `<div class="item c-${p.cat} ${ui.sel === p.id ? "sel" : ""}" data-id="${esc(p.id)}">
      <div class="dot">${iconSvg(p.cat)}</div>
      <div class="body">
        <h3>${esc(p.name)}</h3>
        ${body}
        ${tags.length ? `<div class="tags">${tags.join("")}</div>` : ""}
      </div>
      ${action}
    </div>`;
}

export function renderList(): void {
  if (ui.tab === "more") return;
  const list = $("#list");
  const shown = currentItems();
  if (!shown.length) {
    let msg: string;
    if (!items.length) {
      msg = `<b>Aún no tienes nada guardado.</b><br>Pulsa <b>Añadir</b> y pega un enlace de Google Maps, o un vídeo de TikTok o Instagram.`;
    } else if (ui.list && !items.some((p) => p.lists.includes(ui.list!))) {
      msg = `La lista <b>${esc(ui.list)}</b> está vacía. Pulsa <b>Añadir</b> y lo nuevo irá a esta lista.`;
    } else if (ui.tab === "done" && !items.some(isDone)) {
      msg = "Aún no has registrado visitas. Cuando vayas a un sitio pendiente, pulsa su ✓.";
    } else {
      msg = "Nada con estos filtros.";
    }
    list.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  list.innerHTML = shown.map(itemHtml).join("");
}

export function initList(opts: {
  openVisit: (id: string) => void;
  focusItem: (id: string) => void;
  locate: () => Promise<unknown>;
  fitList: () => void;
}): void {
  $("#tabPend").addEventListener("click", () => setTab("pend"));
  $("#tabDone").addEventListener("click", () => setTab("done"));
  $("#tabMore").addEventListener("click", () => setTab("more"));

  $<HTMLSelectElement>("#listSel").addEventListener("change", (e) => {
    setList((e.target as HTMLSelectElement).value || null);
    select(null);
    opts.fitList();
  });
  $("#newListBtn").addEventListener("click", () => {
    const f = $("#newListForm");
    f.hidden = !f.hidden;
    if (!f.hidden) $<HTMLInputElement>("#newListIn").focus();
  });
  $("#newListForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = cleanListName($<HTMLInputElement>("#newListIn").value);
    if (!name) return;
    $<HTMLInputElement>("#newListIn").value = "";
    $("#newListForm").hidden = true;
    setList(name);
    if (ui.tab === "more") ui.tab = "pend";
    select(null);
    toast(`Lista «${name}» creada. Lo que añadas ahora irá a ella.`);
  });

  $("#fcats").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-cat]");
    if (!b) return;
    const k = b.dataset.cat!;
    if (k === "all") ui.cats.clear();
    else if (isCatKey(k)) {
      if (ui.cats.has(k)) ui.cats.delete(k);
      else ui.cats.add(k);
    }
    render();
  });
  $("#ftags").addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-tag]")?.dataset.tag;
    if (!t) return;
    if (ui.tags.has(t)) ui.tags.delete(t);
    else ui.tags.add(t);
    render();
  });
  $("#fperiod").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
    if (!b) return;
    ui.period = b.dataset.v as Period;
    render();
  });
  $("#forder").addEventListener("click", async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
    if (!b) return;
    ui.order = b.dataset.v as Order;
    render();
    if (ui.order === "near") {
      try {
        await opts.locate();
      } catch (err) {
        toast((err as Error).message);
      }
      render();
    }
  });
  $<HTMLInputElement>("#q").addEventListener("input", (e) => {
    ui.q = (e.target as HTMLInputElement).value;
    if (ui.tab === "more") ui.tab = "pend";
    render();
  });
  $("#list").addEventListener("click", (e) => {
    const t = e.target as Element;
    const v = t.closest<HTMLElement>("[data-visit]");
    if (v) return opts.openVisit(v.dataset.visit!);
    const it = t.closest<HTMLElement>(".item");
    if (it) {
      select(it.dataset.id!);
      opts.focusItem(it.dataset.id!);
    }
  });
}
