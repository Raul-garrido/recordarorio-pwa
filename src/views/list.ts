import { CATEGORIES, cat, countLabel, iconSvg, isCatKey } from "../categories";
import { fmtDate } from "../dates";
import { hasLoc, isDone, lastVisit, matchesQuery, matchesTab, visibleItems } from "../items";
import { platformOf } from "../links";
import { items, render, select, setTab, ui } from "../state";
import type { Item, Order, Period } from "../types";
import { $, esc, ICONS } from "../util";

const PERIODS: Record<Period, string> = { all: "Siempre", d30: "Últimos 30 días", year: "Este año" };
const ORDERS: Record<Order, string> = { recent: "Recientes", most: "Más veces", az: "A–Z" };

export const currentItems = () => visibleItems(items, ui);

export function renderTabs(): void {
  const nDone = items.filter(isDone).length;
  $("#tabPend").innerHTML = `Pendientes <b>${items.length - nDone}</b>`;
  $("#tabDone").innerHTML = `Visitados <b>${nDone}</b>`;
  for (const [id, tab] of [["#tabPend", "pend"], ["#tabDone", "done"], ["#tabMore", "more"]] as const) {
    $(id).setAttribute("aria-selected", String(ui.tab === tab));
  }
  $("#paneList").hidden = ui.tab === "more";
  $("#paneMore").hidden = ui.tab !== "more";
}

export function renderFilters(): void {
  if (ui.tab === "more") return;
  const base = items.filter((p) => matchesTab(p, ui) && matchesQuery(p, ui.q));
  const btn = (key: string, label: string, n: number, pressed: boolean) =>
    `<button type="button" class="fbtn ${key === "all" ? "" : `c-${key}`}" data-cat="${key}" aria-pressed="${pressed}"><i></i>${label} <b>${n}</b></button>`;
  $("#fcats").innerHTML =
    btn("all", "Todo", base.length, ui.cats.size === 0) +
    CATEGORIES.map((c) => btn(c.key, c.name, base.filter((p) => p.cat === c.key).length, ui.cats.has(c.key))).join("");

  $("#fextra").hidden = ui.tab !== "done";
  const seg = (sel: string, opts: Record<string, string>, cur: string) => {
    $(sel).innerHTML = Object.entries(opts)
      .map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === cur}">${v}</button>`)
      .join("");
  };
  seg("#fperiod", PERIODS, ui.period);
  seg("#forder", ORDERS, ui.order);
}

function itemHtml(p: Item): string {
  const done = isDone(p);
  const l = cat(p.cat).log;
  const plats = [...new Set(p.socials.map(platformOf))];
  const vids = plats.length
    ? `<span class="vids" title="Visto en ${esc(plats.join(", "))}">${ICONS.play}${esc(plats.join(" · "))}${p.socials.length > 1 ? ` (${p.socials.length})` : ""}</span>`
    : "";
  const noloc = !hasLoc(p) && cat(p.cat).location !== "none" ? '<span class="noloc">Sin ubicación</span>' : "";
  let body: string;
  if (done) {
    const lv = lastVisit(p);
    const last = p.visits.find((v) => v.date === lv)!;
    body = `<div class="last">${ICONS.cal}${fmtDate(lv)} <em>· ${countLabel(p.cat, p.visits.length)}</em></div>
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
        ${noloc || vids ? `<div class="tags">${noloc}${vids}</div>` : ""}
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
    } else if (ui.tab === "done" && !items.some(isDone)) {
      msg = "Aún no has registrado visitas. Cuando vayas a un sitio pendiente, pulsa su ✓.";
    } else if (ui.tab === "pend" && items.every(isDone)) {
      msg = "No te queda nada pendiente. Pulsa <b>Añadir</b> para guardar algo nuevo.";
    } else {
      msg = "Nada con estos filtros.";
    }
    list.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  list.innerHTML = shown.map(itemHtml).join("");
}

export function initList(opts: { openVisit: (id: string) => void; focusItem: (id: string) => void }): void {
  $("#tabPend").addEventListener("click", () => setTab("pend"));
  $("#tabDone").addEventListener("click", () => setTab("done"));
  $("#tabMore").addEventListener("click", () => setTab("more"));

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
  $("#fextra").addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
    if (!b) return;
    if (b.parentElement?.id === "fperiod") ui.period = b.dataset.v as Period;
    else ui.order = b.dataset.v as Order;
    render();
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
