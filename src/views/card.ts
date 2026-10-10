import { cat, countLabel } from "../categories";
import { fmtDate, isoDate } from "../dates";
import { hasLoc, isDone, newId } from "../items";
import { normUrl, platformOf, shortUrl } from "../links";
import { byId, remove, render, select, setTab, ui, upsert } from "../state";
import type { Item } from "../types";
import { $, esc, ICONS, safeHref } from "../util";

const linkPill = (u: string) =>
  `<a class="lnk" href="${safeHref(u)}" target="_blank" rel="noopener">${ICONS.play}${esc(platformOf(u))} <span>${esc(shortUrl(u))}</span></a>`;

function mapsHref(p: Item): string {
  if (p.mapsUrl) return p.mapsUrl;
  if (hasLoc(p)) return `https://www.google.com/maps/search/?api=1&query=${p.lat!.toFixed(6)},${p.lng!.toFixed(6)}`;
  if (p.addr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.addr)}`;
  return "";
}

export function renderCard(): void {
  const card = $("#card");
  const p = byId(ui.sel);
  if (!p) {
    card.hidden = true;
    return;
  }
  const c = cat(p.cat);
  const L = c.log;
  const n = p.visits.length;
  const maps = mapsHref(p);
  const today = isoDate();
  const log = n
    ? `<ul class="vlog">${p.visits
        .map((v) => {
          const armed = ui.confirmVisit === v.id;
          return `<li><time datetime="${esc(v.date)}">${fmtDate(v.date)}</time><span>${v.note ? esc(v.note) : "<i>Sin comentario</i>"}</span><button type="button" class="vdel ${armed ? "armed" : ""}" data-vdel="${esc(v.id)}" aria-label="Borrar esta entrada">${armed ? "¿Borrar?" : "×"}</button></li>`;
        })
        .join("")}</ul>`
    : `<p class="hint">${L.none}</p>`;
  const vform = ui.addingVisit
    ? `<form class="vform" id="visitForm">
        <input type="date" id="vDate" value="${today}" max="${today}" aria-label="Fecha" required>
        <textarea id="vNote" placeholder="${esc(L.placeholder)}" aria-label="Comentario"></textarea>
        <div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn ghost" type="button" id="vCancel">Cancelar</button></div>
      </form>`
    : "";
  const meta = [p.addr && esc(p.addr), hasLoc(p) && `${p.lat!.toFixed(4)}, ${p.lng!.toFixed(4)}`].filter(Boolean).join(" · ");

  card.hidden = false;
  card.className = `card c-${p.cat}`;
  card.innerHTML = `
    <button type="button" class="close" id="cardClose" aria-label="Cerrar">×</button>
    <div class="row"><span class="chip"><i></i>${esc(c.name)}</span><span class="ex">${n ? countLabel(p.cat, n) : "Pendiente"}</span></div>
    <h2>${esc(p.name)}</h2>
    ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ""}
    ${p.ingr ? `<div class="vlabel">Ingredientes</div><div class="ingr">${esc(p.ingr)}</div>` : ""}
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    <div class="vlabel">Visto en</div>
    <div class="links">${p.socials.map(linkPill).join("")}${ui.addingLink ? "" : `<button type="button" class="lnk add" id="cardAddLink">+ ${p.socials.length ? "Otro enlace" : "Añadir enlace"}</button>`}</div>
    ${ui.addingLink ? `<form class="inl" id="linkForm"><input id="linkIn" type="url" inputmode="url" placeholder="Pega el enlace de TikTok, Instagram…" aria-label="Enlace"><button class="btn" type="submit">Añadir</button></form>` : ""}
    <div class="vlabel">${esc(L.title)}</div>
    ${log}
    ${vform}
    <div class="row actions">
      ${ui.addingVisit ? "" : `<button type="button" class="btn primary" id="cardVisit">${n ? `+ ${esc(L.more)}` : `✓ ${esc(L.cta)}`}</button>`}
      ${maps ? `<a class="btn" href="${safeHref(maps)}" target="_blank" rel="noopener">Abrir en Maps ↗</a>` : ""}
      <button type="button" class="btn ghost" id="cardEdit">Editar</button>
      <button type="button" class="btn ghost danger" id="cardDel">${ui.confirmDelete ? "Toca otra vez para borrar" : "Borrar"}</button>
    </div>`;
}

export function openVisitForm(id: string): void {
  select(id);
  ui.addingVisit = true;
  render();
  $<HTMLTextAreaElement>("#vNote").focus({ preventScroll: true });
}

export function initCard(opts: { edit: (id: string) => void }): void {
  const card = $("#card");
  card.addEventListener("click", (e) => {
    const t = e.target as Element;
    const p = byId(ui.sel);
    if (!p) return;
    if (t.closest("#cardClose")) return select(null);
    if (t.closest("#cardAddLink")) {
      ui.addingLink = true;
      render();
      $<HTMLInputElement>("#linkIn").focus();
      return;
    }
    if (t.closest("#cardVisit")) return openVisitForm(p.id);
    if (t.closest("#vCancel")) {
      ui.addingVisit = false;
      return render();
    }
    if (t.closest("#cardEdit")) return opts.edit(p.id);
    const vd = t.closest<HTMLElement>("[data-vdel]");
    if (vd) {
      const vid = vd.dataset.vdel!;
      if (ui.confirmVisit !== vid) {
        ui.confirmVisit = vid;
        return render();
      }
      ui.confirmVisit = null;
      upsert({ ...p, visits: p.visits.filter((v) => v.id !== vid) });
      if (ui.tab === "done" && !isDone(byId(p.id)!)) setTab("pend");
      return;
    }
    if (t.closest("#cardDel")) {
      if (!ui.confirmDelete) {
        ui.confirmDelete = true;
        return render();
      }
      remove(p.id);
    }
  });

  card.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = byId(ui.sel);
    if (!p) return;
    const form = e.target as HTMLFormElement;
    if (form.id === "visitForm") {
      const date = $<HTMLInputElement>("#vDate").value || isoDate();
      const note = $<HTMLTextAreaElement>("#vNote").value.trim();
      ui.addingVisit = false;
      upsert({ ...p, visits: [...p.visits, { id: newId("v"), date, note }] });
      if (ui.tab === "pend") setTab("done");
    } else if (form.id === "linkForm") {
      const u = normUrl($<HTMLInputElement>("#linkIn").value);
      ui.addingLink = false;
      if (u && !p.socials.includes(u)) upsert({ ...p, socials: [...p.socials, u] });
      else render();
    }
  });
}
