import { CATEGORIES } from "../categories";
import { allPhotos, cleanListName, isDone, mergeItems, usage } from "../items";
import { items, render, replaceAll, ui } from "../state";
import { exportPhotos, importPhotos, parseImport, toExportJson } from "../store";
import { $, esc, toast } from "../util";
import { changeList, knownLists, setList } from "./list";

/** List whose rename/delete controls are open. */
let editing: string | null = null;
let confirmDelete: string | null = null;

export function renderMore(): void {
  if (ui.tab !== "more") return;
  const nDone = items.filter(isDone).length;
  const nPhotos = items.reduce((n, p) => n + allPhotos(p).length, 0);
  const perCat = CATEGORIES.map((c) => `${c.name} ${items.filter((p) => p.cat === c.key).length}`).join(" · ");
  const lists = knownLists();
  const tags = usage(items, "tags");
  $("#paneMore").innerHTML = `
    <section>
      <h2>Listas</h2>
      ${
        lists.length
          ? `<ul class="mlist">${lists
              .map((l) =>
                editing === l.name
                  ? `<li><form class="inl" data-rename="${esc(l.name)}"><input name="to" value="${esc(l.name)}" aria-label="Nuevo nombre" maxlength="60"><button class="btn small" type="submit">Guardar</button></form>
                     <button type="button" class="btn ghost small danger" data-dellist="${esc(l.name)}">${confirmDelete === l.name ? "Toca otra vez: quitar lista" : "Quitar lista"}</button></li>`
                  : `<li><button type="button" class="linklike" data-golist="${esc(l.name)}">${esc(l.name)}</button> <span class="muted">${l.n}</span>
                     <span class="mbtns"><button type="button" class="btn ghost small" data-editlist="${esc(l.name)}">Renombrar</button>
                     <button type="button" class="btn ghost small danger" data-dellist="${esc(l.name)}">${confirmDelete === l.name ? "Toca otra vez para quitarla" : "Quitar"}</button></span></li>`,
              )
              .join("")}</ul>
             <p class="muted">Quitar una lista no borra nada: sus sitios siguen en «Todas».</p>`
          : `<p class="muted">Agrupa sitios por viaje o ciudad, como «Lisboa mayo». Crea una con <b>+ Nueva</b> arriba, o desde el formulario al añadir.</p>`
      }
    </section>
    <section>
      <h2>Etiquetas</h2>
      ${
        tags.length
          ? `<div class="links">${tags.map((t) => `<button type="button" class="tag" data-gotag="${esc(t.name)}">#${esc(t.name)} <span class="muted">${t.n}</span></button>`).join("")}</div>`
          : `<p class="muted">Añade etiquetas como #terraza o #barato al guardar algo. Luego filtras por ellas en la lista.</p>`
      }
    </section>
    <section>
      <h2>Tus datos</h2>
      <p>${items.length} guardados: ${items.length - nDone} pendientes y ${nDone} visitados. ${nPhotos} ${nPhotos === 1 ? "foto" : "fotos"}.<br><span class="muted">${perCat}</span></p>
      <p class="muted">Todo se guarda solo en este dispositivo. Haz una copia de vez en cuando, o para pasar tus datos a otro móvil.</p>
      <label class="checkline"><input type="checkbox" id="withPhotos" ${nPhotos ? "checked" : "disabled"}> Incluir las fotos en la copia</label>
      <div class="row">
        <button class="btn" type="button" id="exportBtn">Descargar copia</button>
        <label class="btn" for="importIn">Cargar copia</label>
        <input type="file" id="importIn" accept="application/json,.json" hidden>
      </div>
    </section>
    <section>
      <h2>Añadir desde otras apps</h2>
      <ol>
        <li>Instala Recordatorio: en Android, menú del navegador → <b>Instalar app</b>. En iPhone, Safari → Compartir → <b>Añadir a pantalla de inicio</b>.</li>
        <li>En Android, desde Google Maps, TikTok o Instagram pulsa <b>Compartir</b> y elige <b>Recordatorio</b>. Se abre el formulario ya relleno.</li>
        <li>En iPhone, copia el enlace, abre Recordatorio, pulsa <b>Añadir</b> y pégalo.</li>
      </ol>
    </section>
    <section>
      <h2>Tipos</h2>
      <p>Comer, Ver, Ocio, Recetas y Varios. Lo que acabe a menudo en Varios puede tener su propio filtro.</p>
    </section>`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyRename(from: string, to: string): void {
  editing = null;
  confirmDelete = null;
  changeList(from, to);
}

export function initMore(): void {
  const pane = $("#paneMore");
  pane.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const go = t.closest<HTMLElement>("[data-golist]")?.dataset.golist;
    if (go) {
      setList(go);
      ui.tab = "pend";
      return render();
    }
    const gt = t.closest<HTMLElement>("[data-gotag]")?.dataset.gotag;
    if (gt) {
      ui.tags = new Set([gt]);
      ui.tab = "pend";
      return render();
    }
    const ed = t.closest<HTMLElement>("[data-editlist]")?.dataset.editlist;
    if (ed) {
      editing = ed;
      confirmDelete = null;
      return render();
    }
    const del = t.closest<HTMLElement>("[data-dellist]")?.dataset.dellist;
    if (del) {
      if (confirmDelete !== del) {
        confirmDelete = del;
        return render();
      }
      return applyRename(del, "");
    }
    if (t.closest("#exportBtn")) {
      const withPhotos = $<HTMLInputElement>("#withPhotos").checked;
      const photos = withPhotos ? await exportPhotos(items) : undefined;
      download(`recordatorio-${new Date().toISOString().slice(0, 10)}.json`, toExportJson(items, photos));
      toast("Copia descargada.");
    }
  });
  pane.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const from = f.dataset.rename;
    if (!from) return;
    const to = cleanListName(new FormData(f).get("to")?.toString() ?? "");
    if (!to) return toast("Ponle un nombre a la lista.");
    if (to === from) {
      editing = null;
      return render();
    }
    applyRename(from, to);
  });
  pane.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id !== "importIn" || !input.files?.[0]) return;
    try {
      const data = parseImport(await input.files[0].text());
      const nPhotos = data.photos ? await importPhotos(data.photos) : 0;
      const { items: merged, added, updated } = mergeItems(items, data.items);
      await replaceAll(merged);
      toast(`Copia cargada: ${added} nuevos, ${updated} actualizados${nPhotos ? `, ${nPhotos} fotos` : ""}.`);
    } catch (err) {
      console.error(err);
      toast("Ese archivo no es una copia de Recordatorio.");
    } finally {
      input.value = "";
    }
  });
}

