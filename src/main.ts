import "./styles.css";
import { categoryCss } from "./categories";
import { parseShared } from "./links";
import { MapView } from "./map";
import { byId, items, load, onChange, render, select, ui } from "./state";
import { requestPersistence } from "./store";
import { $, toast } from "./util";
import { initCard, openVisitForm, renderCard } from "./views/card";
import { initForm, openAdd, openEdit, quickPhoto } from "./views/form";
import { currentItems, initList, renderFilters, renderList, renderListBar, renderTabs, restoreList } from "./views/list";
import { initMore, renderMore } from "./views/more";
import { drawPois, initPois } from "./views/pois";

const VIEW_KEY = "recordatorio.view";

function injectCategoryColors(): void {
  const style = document.createElement("style");
  style.textContent = categoryCss();
  document.head.append(style);
}

/** Opens the form when another app shared something with us (manifest share_target). */
function handleShare(): void {
  const params = new URLSearchParams(location.search);
  const title = params.get("title") ?? "", text = params.get("text") ?? "", url = params.get("url") ?? "";
  const wantsAdd = params.has("add");
  if (!title && !text && !url && !wantsAdd) return;
  history.replaceState(null, "", location.pathname);
  if (wantsAdd && !title && !text && !url) return openAdd();
  const s = parseShared(title, text, url);
  openAdd({
    name: s.name,
    desc: s.desc,
    addr: s.addr,
    mapsUrl: s.mapsUrl,
    coords: s.coords,
    socials: s.socials,
  });
}

function restoreView(map: MapView): void {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.z)) {
      map.map.setView([v.lat, v.lng], v.z);
      return;
    }
  } catch {
    /* no saved view */
  }
  map.fitTo(items);
}

async function start(): Promise<void> {
  injectCategoryColors();
  const map = new MapView($("#map"), (id) => select(id));
  const locate = async () => {
    ui.here = await map.locate();
  };

  try {
    await load();
  } catch (e) {
    console.error(e);
    toast("No se pudieron leer tus datos guardados.");
  }

  initList({
    openVisit: (id) => {
      openVisitForm(id);
      const p = byId(id);
      if (p) map.focus(p);
    },
    focusItem: (id) => {
      const p = byId(id);
      if (p) map.focus(p);
    },
    locate,
    fitList: () => map.fitTo(currentItems()),
  });
  initCard({ edit: openEdit });
  initForm(map);
  initMore();
  initPois(map);

  onChange(() => {
    renderListBar();
    renderTabs();
    renderFilters();
    renderList();
    renderMore();
    renderCard();
    const shown = ui.tab === "more" ? items.filter((p) => !ui.list || p.lists.includes(ui.list)) : currentItems();
    map.setItems(shown, ui.sel, ui.tab === "more");
    drawPois();
    document.querySelector(".item.sel")?.scrollIntoView({ block: "nearest" });
  });

  $("#addBtn").addEventListener("click", () => openAdd());
  $<HTMLInputElement>("#quickCam").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    await quickPhoto(input.files);
    input.value = "";
  });
  $("#locateBtn").addEventListener("click", () => locate().then(render, (e: Error) => toast(e.message)));
  map.map.on("moveend", () => {
    const c = map.map.getCenter();
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, z: map.map.getZoom() }));
    } catch {
      /* storage unavailable: the view just isn't remembered */
    }
  });

  restoreList();
  restoreView(map);
  render();
  handleShare();
  if (items.length) requestPersistence();
}

start();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker no registrado", e));
  });
}
