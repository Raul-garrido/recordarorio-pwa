import { CATEGORIES } from "../categories";
import { isDone, mergeItems } from "../items";
import { items, replaceAll, ui } from "../state";
import { parseImport, toExportJson } from "../store";
import { $, toast } from "../util";

export function renderMore(): void {
  if (ui.tab !== "more") return;
  const nDone = items.filter(isDone).length;
  const perCat = CATEGORIES.map((c) => `${c.name} ${items.filter((p) => p.cat === c.key).length}`).join(" · ");
  $("#paneMore").innerHTML = `
    <section>
      <h2>Tus datos</h2>
      <p>${items.length} guardados: ${items.length - nDone} pendientes y ${nDone} visitados.<br><span class="muted">${perCat}</span></p>
      <p class="muted">Todo se guarda solo en este dispositivo. Haz una copia de vez en cuando, o para pasar tus datos a otro móvil.</p>
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

export function initMore(): void {
  const pane = $("#paneMore");
  pane.addEventListener("click", (e) => {
    if ((e.target as Element).closest("#exportBtn")) {
      download(`recordatorio-${new Date().toISOString().slice(0, 10)}.json`, toExportJson(items));
      toast("Copia descargada.");
    }
  });
  pane.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id !== "importIn" || !input.files?.[0]) return;
    try {
      const incoming = parseImport(await input.files[0].text());
      const { items: merged, added, updated } = mergeItems(items, incoming);
      await replaceAll(merged);
      toast(`Copia cargada: ${added} nuevos, ${updated} actualizados.`);
    } catch (err) {
      console.error(err);
      toast("Ese archivo no es una copia de Recordatorio.");
    } finally {
      input.value = "";
    }
  });
}
