import { cat, countLabel } from "../categories";
import { fmtDate, isoDate } from "../dates";
import { avgRating, hasLoc, isDone, newId } from "../items";
import { normUrl, platformOf, shortUrl } from "../links";
import { hydratePhotos, photoUrl, savePhotos } from "../photos";
import { hoursEs } from "../poi";
import { byId, remove, render, select, setTab, ui, upsert } from "../state";
import { deletePhotos } from "../store";
import type { Item, Visit } from "../types";
import { $, esc, ICONS, safeHref, toast } from "../util";
import { setList, stars } from "./list";

const linkPill = (u: string) =>
  `<a class="lnk" href="${safeHref(u)}" target="_blank" rel="noopener">${ICONS.play}${esc(platformOf(u))} <span>${esc(shortUrl(u))}</span></a>`;

/** Visit being written: which entry is edited (null = new) and its pending stars and photos. */
const vdraft = { editing: null as string | null, rating: 0, keep: [] as string[], files: [] as File[] };

function mapsHref(p: Item): string {
  if (p.mapsUrl) return p.mapsUrl;
  if (hasLoc(p)) return `https://www.google.com/maps/search/?api=1&query=${p.lat!.toFixed(6)},${p.lng!.toFixed(6)}`;
  if (p.addr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.addr)}`;
  return "";
}

const thumbs = (ids: string[], removable = false) =>
  ids.length
    ? `<div class="thumbs">${ids
        .map(
          (id) => `<span class="thumb"><button type="button" data-photo-open="${esc(id)}" aria-label="Ver foto"><img data-photo="${esc(id)}" alt=""></button>${
            removable ? `<button type="button" class="thumb-rm" data-photo-rm="${esc(id)}" aria-label="Quitar foto">×</button>` : ""
          }</span>`,
        )
        .join("")}</div>`
    : "";

function starPick(r: number): string {
  return `<div class="starpick" role="group" aria-label="Valoración">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-star="${n}" aria-pressed="${n <= r}" aria-label="${n} de 5">★</button>`)
    .join("")}<button type="button" class="nostar" data-star="0">Sin nota</button></div>`;
}

function visitForm(p: Item, v: Visit | null): string {
  const today = isoDate();
  return `<form class="vform" id="visitForm">
    <input type="date" id="vDate" value="${esc(v?.date ?? today)}" max="${today}" aria-label="Fecha" required>
    ${starPick(vdraft.rating)}
    <textarea id="vNote" placeholder="${esc(cat(p.cat).log.placeholder)}" aria-label="Comentario">${esc(v?.note ?? "")}</textarea>
    <div class="photopick">
      <label class="btn small" for="vCam">Hacer foto</label>
      <input type="file" id="vCam" accept="image/*" capture="environment" hidden>
      <label class="btn small ghost" for="vPhotos">Desde la galería</label>
      <input type="file" id="vPhotos" accept="image/*" multiple hidden>
      <span class="hint" id="vPhotoInfo"></span>
    </div>
    ${thumbs(vdraft.keep, true)}
    <div class="row"><button class="btn primary" type="submit">Guardar</button><button class="btn ghost" type="button" id="vCancel">Cancelar</button></div>
  </form>`;
}

function visitRow(p: Item, v: Visit): string {
  if (ui.addingVisit && vdraft.editing === v.id) return `<li class="editing">${visitForm(p, v)}</li>`;
  const armed = ui.confirmVisit === v.id;
  return `<li>
    <div class="vhead"><time datetime="${esc(v.date)}">${fmtDate(v.date)}</time>${v.rating ? `<span class="vstars" aria-label="${v.rating} de 5">${"★".repeat(v.rating)}<span>${"★".repeat(5 - v.rating)}</span></span>` : ""}
      <span class="vacts"><button type="button" class="vbtn" data-vedit="${esc(v.id)}">Editar</button><button type="button" class="vbtn vdel ${armed ? "armed" : ""}" data-vdel="${esc(v.id)}" aria-label="Borrar esta entrada">${armed ? "¿Borrar?" : "×"}</button></span></div>
    ${v.note ? `<p>${esc(v.note)}</p>` : ""}
    ${thumbs(v.photos)}
  </li>`;
}

function infoHtml(p: Item): string {
  const { hours, phone, website } = p.info;
  if (!hours && !phone && !website) return "";
  const rows = [
    hours && `<div><span class="k">Horario</span><span>${esc(hoursEs(hours))}</span></div>`,
    phone && `<div><span class="k">Teléfono</span><a href="tel:${esc(phone.replace(/[^+\d]/g, ""))}">${esc(phone)}</a></div>`,
    website && `<div><span class="k">Web</span><a href="${safeHref(normUrl(website))}" target="_blank" rel="noopener">${esc(shortUrl(normUrl(website)))}</a></div>`,
  ].filter(Boolean);
  return `<div class="infobox">${rows.join("")}</div>`;
}

export function renderCard(): void {
  const card = $("#card");
  const p = byId(ui.sel);
  if (!p) {
    card.hidden = true;
    return;
  }
  // Re-rendering would wipe what is being typed in the visit form.
  if (!card.hidden && card.dataset.id === p.id && card.querySelector("#visitForm") && ui.addingVisit) return;
  const c = cat(p.cat);
  const L = c.log;
  const n = p.visits.length;
  const maps = mapsHref(p);
  const r = avgRating(p);
  const newForm = ui.addingVisit && vdraft.editing === null ? visitForm(p, null) : "";
  const log = n ? `<ul class="vlog">${p.visits.map((v) => visitRow(p, v)).join("")}</ul>` : newForm ? "" : `<p class="hint">${L.none}</p>`;
  const meta = [p.addr && esc(p.addr), hasLoc(p) && `${p.lat!.toFixed(4)}, ${p.lng!.toFixed(4)}`].filter(Boolean).join(" · ");

  card.hidden = false;
  card.dataset.id = p.id;
  card.className = `card c-${p.cat}`;
  card.innerHTML = `
    <button type="button" class="close" id="cardClose" aria-label="Cerrar">×</button>
    <div class="row"><span class="chip"><i></i>${esc(c.name)}</span><span class="ex">${n ? countLabel(p.cat, n) : "Pendiente"}</span>${r ? stars(r) : ""}</div>
    <h2>${esc(p.name)}</h2>
    ${p.tags.length || p.lists.length ? `<div class="links">${p.lists.map((l) => `<button type="button" class="listchip" data-golist="${esc(l)}">${esc(l)}</button>`).join("")}${p.tags.map((t) => `<button type="button" class="tag" data-tagfilter="${esc(t)}">#${esc(t)}</button>`).join("")}</div>` : ""}
    ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ""}
    ${p.photos.length ? thumbs(p.photos) : ""}
    ${p.ingr ? `<div class="vlabel">Ingredientes</div><div class="ingr">${esc(p.ingr)}</div>` : ""}
    ${meta ? `<div class="meta">${meta}</div>` : ""}
    ${infoHtml(p)}
    <div class="vlabel">Visto en</div>
    <div class="links">${p.socials.map(linkPill).join("")}${ui.addingLink ? "" : `<button type="button" class="lnk add" id="cardAddLink">+ ${p.socials.length ? "Otro enlace" : "Añadir enlace"}</button>`}</div>
    ${ui.addingLink ? `<form class="inl" id="linkForm"><input id="linkIn" type="url" inputmode="url" placeholder="Pega el enlace de TikTok, Instagram…" aria-label="Enlace"><button class="btn" type="submit">Añadir</button></form>` : ""}
    <div class="vlabel">${esc(L.title)}</div>
    ${newForm}
    ${log}
    <div class="row actions">
      ${ui.addingVisit ? "" : `<button type="button" class="btn primary" id="cardVisit">${n ? `+ ${esc(L.more)}` : `✓ ${esc(L.cta)}`}</button>`}
      ${maps ? `<a class="btn" href="${safeHref(maps)}" target="_blank" rel="noopener">Abrir en Maps ↗</a>` : ""}
      <button type="button" class="btn ghost" id="cardEdit">Editar</button>
      <button type="button" class="btn ghost danger" id="cardDel">${ui.confirmDelete ? "Toca otra vez para borrar" : "Borrar"}</button>
    </div>`;
  hydratePhotos(card);
}

function startVisit(v: Visit | null): void {
  vdraft.editing = v?.id ?? null;
  vdraft.rating = v?.rating ?? 0;
  vdraft.keep = v ? [...v.photos] : [];
  vdraft.files = [];
  ui.addingVisit = true;
  ui.confirmVisit = null;
  $("#card").dataset.id = "";
  renderCard();
  $<HTMLTextAreaElement>("#vNote").focus({ preventScroll: true });
}

export function openVisitForm(id: string): void {
  select(id);
  const p = byId(id);
  if (p) startVisit(null);
}

function closeVisit(): void {
  ui.addingVisit = false;
  $("#card").dataset.id = "";
  render();
}

function syncPhotoInfo(): void {
  const n = vdraft.files.length;
  const info = document.getElementById("vPhotoInfo");
  if (info) info.textContent = n ? `${n} ${n === 1 ? "foto nueva" : "fotos nuevas"}` : "";
}

async function openLightbox(id: string): Promise<void> {
  const url = await photoUrl(id);
  if (!url) return;
  $<HTMLImageElement>("#lightImg").src = url;
  $("#lightbox").hidden = false;
}

export function initCard(opts: { edit: (id: string) => void }): void {
  const card = $("#card");
  card.addEventListener("click", (e) => {
    const t = e.target as Element;
    const p = byId(ui.sel);
    if (!p) return;
    const photo = t.closest<HTMLElement>("[data-photo-open]");
    if (photo) return void openLightbox(photo.dataset.photoOpen!);
    const star = t.closest<HTMLElement>("[data-star]");
    if (star) {
      vdraft.rating = Number(star.dataset.star);
      card.querySelectorAll<HTMLElement>(".starpick [data-star]").forEach((b) => {
        const n = Number(b.dataset.star);
        if (n > 0) b.setAttribute("aria-pressed", String(n <= vdraft.rating));
      });
      return;
    }
    const rm = t.closest<HTMLElement>("[data-photo-rm]");
    if (rm) {
      vdraft.keep = vdraft.keep.filter((id) => id !== rm.dataset.photoRm);
      rm.closest(".thumb")?.remove();
      return;
    }
    if (t.closest("#cardClose")) return select(null);
    if (t.closest("#cardAddLink")) {
      ui.addingLink = true;
      render();
      $<HTMLInputElement>("#linkIn").focus();
      return;
    }
    const tag = t.closest<HTMLElement>("[data-tagfilter]");
    if (tag) {
      ui.tags = new Set([tag.dataset.tagfilter!]);
      if (ui.tab === "more") setTab("pend");
      return render();
    }
    const gl = t.closest<HTMLElement>("[data-golist]");
    if (gl) {
      setList(gl.dataset.golist!);
      return render();
    }
    if (t.closest("#cardVisit")) return startVisit(null);
    const ve = t.closest<HTMLElement>("[data-vedit]");
    if (ve) {
      const v = p.visits.find((x) => x.id === ve.dataset.vedit);
      if (v) startVisit(v);
      return;
    }
    if (t.closest("#vCancel")) return closeVisit();
    if (t.closest("#cardEdit")) return opts.edit(p.id);
    const vd = t.closest<HTMLElement>("[data-vdel]");
    if (vd) {
      const vid = vd.dataset.vdel!;
      if (ui.confirmVisit !== vid) {
        ui.confirmVisit = vid;
        return render();
      }
      ui.confirmVisit = null;
      const gone = p.visits.find((v) => v.id === vid);
      upsert({ ...p, visits: p.visits.filter((v) => v.id !== vid) });
      if (gone) deletePhotos(gone.photos).catch(console.error);
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

  card.addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if ((input.id !== "vPhotos" && input.id !== "vCam") || !input.files) return;
    vdraft.files.push(...[...input.files].filter((f) => f.type.startsWith("image/")));
    input.value = "";
    syncPhotoInfo();
  });

  card.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = byId(ui.sel);
    if (!p) return;
    const form = e.target as HTMLFormElement;
    if (form.id === "visitForm") {
      const submitBtn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      submitBtn.disabled = true;
      let added: string[] = [];
      try {
        if (vdraft.files.length) {
          submitBtn.textContent = "Guardando fotos…";
          added = await savePhotos(vdraft.files);
        }
      } catch (err) {
        console.error(err);
        toast("No se pudieron guardar las fotos.");
      }
      const prev = vdraft.editing ? p.visits.find((v) => v.id === vdraft.editing) : undefined;
      const entry: Visit = {
        id: prev?.id ?? newId("v"),
        date: $<HTMLInputElement>("#vDate").value || isoDate(),
        note: $<HTMLTextAreaElement>("#vNote").value.trim(),
        rating: vdraft.rating,
        photos: [...vdraft.keep, ...added],
      };
      if (prev) deletePhotos(prev.photos.filter((id) => !vdraft.keep.includes(id))).catch(console.error);
      const visits = prev ? p.visits.map((v) => (v.id === prev.id ? entry : v)) : [...p.visits, entry];
      ui.addingVisit = false;
      card.dataset.id = "";
      upsert({ ...(byId(p.id) ?? p), visits });
      if (ui.tab === "pend") setTab("done");
    } else if (form.id === "linkForm") {
      const u = normUrl($<HTMLInputElement>("#linkIn").value);
      ui.addingLink = false;
      if (u && !p.socials.includes(u)) upsert({ ...p, socials: [...p.socials, u] });
      else render();
    }
  });

  const lb = $("#lightbox");
  lb.addEventListener("click", () => (lb.hidden = true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lb.hidden) lb.hidden = true;
  });
}
