import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cat } from "./categories";
import { hasLoc, isDone } from "./items";
import type { Coords } from "./links";
import { kindOf, type Bounds, type Poi } from "./poi";
import type { Item } from "./types";

const PIN_PATH = "M17,42C13,33 2,25 2,15A15,15 0 1 1 32,15C32,25 21,33 17,42Z";
const CHECK = '<path d="M-5,0 -1.5,3.5 5.5,-4"/>';

function pinIcon(item: Item, selected: boolean, muted: boolean): L.DivIcon {
  const glyph = isDone(item) ? CHECK : cat(item.cat).icon;
  return L.divIcon({
    className: `pin c-${item.cat}${selected ? " sel" : ""}${muted ? " muted" : ""}`,
    html: `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">
      <ellipse cx="17" cy="42.5" rx="6" ry="2" class="pin-shadow"/>
      <path d="${PIN_PATH}" class="pin-body"/>
      <g transform="translate(17,15)" class="pin-glyph">${glyph}</g></svg>`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
  });
}

const DEFAULT_VIEW: [number, number] = [40.4168, -3.7038];

export class MapView {
  readonly map: L.Map;
  private markers = new Map<string, L.Marker>();
  private draft: L.Marker | null = null;
  private me: L.CircleMarker | null = null;
  private clickHandler: ((c: Coords) => void) | null = null;
  private poiLayer = L.layerGroup();
  /** Called when a map place (not one of ours) is tapped. */
  onPoi: ((p: Poi) => void) | null = null;

  constructor(el: HTMLElement, private onSelect: (id: string | null) => void) {
    this.map = L.map(el, { zoomControl: false, attributionControl: true }).setView(DEFAULT_VIEW, 13);
    L.control.zoom({ position: "topright" }).addTo(this.map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    this.map.on("click", (e: L.LeafletMouseEvent) => {
      if (this.clickHandler) this.clickHandler({ lat: e.latlng.lat, lng: e.latlng.lng });
      else this.onSelect(null);
    });
    new ResizeObserver(() => this.map.invalidateSize()).observe(el);
    this.poiLayer.addTo(this.map);
  }

  bounds(): Bounds {
    const b = this.map.getBounds();
    return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
  }

  /** Small dots for map places; highlighted ones (search results) are drawn bigger and on top. */
  setPois(pois: Poi[], highlighted: Set<string>): void {
    this.poiLayer.clearLayers();
    const ordered = [...pois].sort((a, b) => Number(highlighted.has(a.id)) - Number(highlighted.has(b.id)));
    for (const p of ordered) {
      const hi = highlighted.has(p.id);
      L.circleMarker([p.lat, p.lng], {
        radius: hi ? 10 : 8,
        weight: 2,
        className: `poi c-${kindOf(p.tags).cat}${hi ? " hi" : ""}`,
        bubblingMouseEvents: false,
      })
        .bindTooltip(p.name, { direction: "top", offset: [0, -6] })
        .on("click", () => {
          if (!this.clickHandler) this.onPoi?.(p);
        })
        .addTo(this.poiLayer);
    }
  }

  showPopup(c: Coords, html: string): void {
    L.popup({ className: "poipopup", maxWidth: 280, autoPanPadding: [20, 60] }).setLatLng([c.lat, c.lng]).setContent(html).openOn(this.map);
  }

  closePopup(): void {
    this.map.closePopup();
  }

  fitPoints(pts: Coords[]): void {
    if (pts.length === 1) this.map.setView([pts[0].lat, pts[0].lng], Math.max(this.map.getZoom(), 17));
    else if (pts.length > 1) this.map.fitBounds(L.latLngBounds(pts.map((p) => L.latLng(p.lat, p.lng))), { padding: [40, 40], maxZoom: 17 });
  }

  /** Draws pins for the given items; items without a location are skipped. */
  setItems(items: Item[], selectedId: string | null, muteDone: boolean): void {
    const keep = new Set<string>();
    for (const p of items) {
      if (!hasLoc(p)) continue;
      keep.add(p.id);
      const icon = pinIcon(p, p.id === selectedId, muteDone && isDone(p));
      const existing = this.markers.get(p.id);
      if (existing) {
        existing.setLatLng([p.lat!, p.lng!]).setIcon(icon);
        existing.setZIndexOffset(p.id === selectedId ? 1000 : 0);
      } else {
        const m = L.marker([p.lat!, p.lng!], { icon, title: p.name, keyboard: true, riseOnHover: true })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            if (!this.clickHandler) this.onSelect(p.id);
          })
          .addTo(this.map);
        m.setZIndexOffset(p.id === selectedId ? 1000 : 0);
        this.markers.set(p.id, m);
      }
    }
    for (const [id, m] of this.markers) {
      if (!keep.has(id)) {
        m.remove();
        this.markers.delete(id);
      }
    }
  }

  focus(p: Item): void {
    if (!hasLoc(p)) return;
    this.map.flyTo([p.lat!, p.lng!], Math.max(this.map.getZoom(), 15), { duration: 0.6 });
  }

  fitTo(items: Item[]): void {
    const pts = items.filter(hasLoc).map((p) => L.latLng(p.lat!, p.lng!));
    if (pts.length === 1) this.map.setView(pts[0], 15);
    else if (pts.length > 1) this.map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  }

  center(): Coords {
    const c = this.map.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  /** While active, a tap on the map calls back with its coordinates instead of deselecting. */
  startPicking(onPick: (c: Coords) => void): void {
    this.clickHandler = onPick;
    this.map.getContainer().classList.add("picking");
  }

  stopPicking(): void {
    this.clickHandler = null;
    this.map.getContainer().classList.remove("picking");
  }

  showDraft(c: Coords | null): void {
    this.draft?.remove();
    this.draft = null;
    if (!c) return;
    this.draft = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: "pin draft",
        html: `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="${PIN_PATH}" class="pin-body"/></svg>`,
        iconSize: [34, 44],
        iconAnchor: [17, 42],
      }),
      interactive: false,
    }).addTo(this.map);
    this.map.panTo([c.lat, c.lng]);
  }

  locate(): Promise<Coords> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Este navegador no da la ubicación."));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.me?.remove();
          this.me = L.circleMarker([c.lat, c.lng], { radius: 8, className: "me" }).addTo(this.map);
          this.map.flyTo([c.lat, c.lng], 15, { duration: 0.6 });
          resolve(c);
        },
        () => reject(new Error("No se pudo obtener tu ubicación. Revisa los permisos del navegador.")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }
}
