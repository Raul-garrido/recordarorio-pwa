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
const BASEMAP_KEY = "recordatorio.basemap";
const COLLAPSED_KEY = "recordatorio.mapCollapsed";

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
};
const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

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

  const setBasemap = (kind: "streets" | "satellite") => {
    map.setBasemap(kind);
    $("#layerBtn").setAttribute("aria-pressed", String(kind === "satellite"));
    $("#layerLabel").textContent = kind === "satellite" ? "Mapa" : "Satélite";
    remember(BASEMAP_KEY, kind);
  };
  setBasemap(recall(BASEMAP_KEY) === "satellite" ? "satellite" : "streets");
  $("#layerBtn").addEventListener("click", () => setBasemap(map.basemap === "satellite" ? "streets" : "satellite"));

  // "Ampliar lista" hides the map so the results get the whole screen; picking one brings the map back.
  const setCollapsed = (collapsed: boolean) => {
    document.body.classList.toggle("map-collapsed", collapsed);
    $("#collapseBtn").setAttribute("aria-expanded", String(!collapsed));
    $("#collapseLabel").textContent = collapsed ? "Mostrar mapa" : "Ampliar lista";
    remember(COLLAPSED_KEY, collapsed ? "1" : "0");
    if (!collapsed) map.map.invalidateSize();
  };
  setCollapsed(recall(COLLAPSED_KEY) === "1");
  $("#collapseBtn").addEventListener("click", () => setCollapsed(!document.body.classList.contains("map-collapsed")));
  const showOnMap = (id: string) => {
    if (document.body.classList.contains("map-collapsed")) {
      setCollapsed(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const p = byId(id);
    if (p) map.focus(p);
  };

  try {
    await load();
  } catch (e) {
    console.error(e);
    toast("No se pudieron leer tus datos guardados.");
  }

  initList({
    openVisit: (id) => {
      showOnMap(id);
      openVisitForm(id);
    },
    focusItem: showOnMap,
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
  requestPersistence();
}

start();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // Only a change of controller after the page was already controlled means a new version arrived.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) $("#updateBar").hidden = false;
  });
  $("#updateBtn").addEventListener("click", () => location.reload());
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      // iPhone keeps home-screen apps alive in the background: look for a new version each time it comes back.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn("Service worker no registrado", e);
    }
  });
}
