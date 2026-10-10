import { cat, isCatKey } from "./categories";
import { daysAgo, isIsoDate, isoDate } from "./dates";
import { platformOf, type Coords } from "./links";
import type { CatKey, Item, ItemInfo, Order, Period, Tab, Visit } from "./types";

export const emptyInfo = (): ItemInfo => ({ website: "", phone: "", hours: "", osmId: "" });

export function newId(prefix = ""): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

export const hasLoc = (p: Pick<Item, "lat" | "lng">): boolean =>
  typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export const isDone = (p: Item): boolean => p.visits.length > 0;

export const lastVisit = (p: Item): string =>
  p.visits.reduce((m, v) => (v.date > m ? v.date : m), "");

/** Average of the rated visits, or 0 when none is rated. */
export function avgRating(p: Item): number {
  const rated = p.visits.filter((v) => v.rating > 0);
  return rated.length ? rated.reduce((s, v) => s + v.rating, 0) / rated.length : 0;
}

/** Every photo id an item uses: its own and its visits'. */
export const allPhotos = (p: Item): string[] => [...p.photos, ...p.visits.flatMap((v) => v.photos)];

/** Newest first; same-day entries keep the most recently added on top. */
export function sortVisits(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** Great-circle distance in km. */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return `${km.toLocaleString("es-ES", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/** "#Terraza, barato  #con niños" → ["terraza", "barato", "con-niños"] */
export function parseTags(text: string): string[] {
  const parts = text.includes("#") ? text.split(/[#,]/) : text.split(/[,;\n]/);
  return [
    ...new Set(
      parts
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-").replace(/^-+|-+$/g, ""))
        .filter(Boolean),
    ),
  ];
}

export function cleanListName(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 60);
}

/** Every tag or list in use, most used first, then alphabetical. */
export function usage(items: Item[], key: "tags" | "lists"): { name: string; n: number }[] {
  const count = new Map<string, number>();
  for (const p of items) for (const t of p[key]) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "es"));
}

export function makeItem(fields: Partial<Item> & { name: string; cat: CatKey }): Item {
  const now = new Date().toISOString();
  return {
    id: newId("i"),
    desc: "",
    ingr: "",
    addr: "",
    lat: null,
    lng: null,
    mapsUrl: "",
    socials: [],
    tags: [],
    lists: [],
    info: emptyInfo(),
    photos: [],
    visits: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);

/** Validates an item from storage or an imported file. Returns null if it can't be used. */
export function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  const visits: Visit[] = Array.isArray(r.visits)
    ? r.visits.flatMap((v) => {
        const o = (v ?? {}) as Record<string, unknown>;
        if (!isIsoDate(o.date)) return [];
        const rating = Math.round(num(o.rating) ?? 0);
        return [{
          id: str(o.id) || newId("v"),
          date: o.date,
          note: str(o.note),
          rating: rating >= 1 && rating <= 5 ? rating : 0,
          photos: strList(o.photos),
        }];
      })
    : [];
  const lat = num(r.lat), lng = num(r.lng);
  const now = new Date().toISOString();
  return {
    id: str(r.id) || newId("i"),
    name,
    cat: isCatKey(r.cat) ? r.cat : "varios",
    desc: str(r.desc),
    ingr: str(r.ingr),
    addr: str(r.addr),
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    mapsUrl: str(r.mapsUrl),
    socials: strList(r.socials),
    tags: parseTags(strList(r.tags).join(",")),
    lists: [...new Set(strList(r.lists).map(cleanListName).filter(Boolean))],
    info: (() => {
      const o = (r.info ?? {}) as Record<string, unknown>;
      return { website: str(o.website), phone: str(o.phone), hours: str(o.hours), osmId: str(o.osmId) };
    })(),
    photos: strList(r.photos),
    visits: sortVisits(visits),
    createdAt: str(r.createdAt) || now,
    updatedAt: str(r.updatedAt) || now,
  };
}

export interface Filters {
  tab: Tab;
  cats: Set<CatKey>;
  tags: Set<string>;
  /** Active trip/city list, or null for all. */
  list: string | null;
  q: string;
  period: Period;
  order: Order;
  /** Where the user is, for "Cerca de mí". */
  here: Coords | null;
}

/** Orders that make sense in each tab; anything else falls back to the first one. */
export const ORDERS_BY_TAB: Record<"pend" | "done", Order[]> = {
  pend: ["recent", "near", "az"],
  done: ["recent", "most", "rating", "near", "az"],
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function matchesQuery(p: Item, q: string): boolean {
  const needle = fold(q.trim().replace(/#/g, ""));
  if (!needle) return true;
  const hay = fold(
    [
      p.name, p.desc, p.addr, p.ingr, cat(p.cat).name,
      ...p.tags, ...p.lists,
      ...p.socials.map(platformOf),
      ...p.visits.map((v) => v.note),
    ].join(" "),
  );
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

export function inPeriod(p: Item, period: Period, today: Date = new Date()): boolean {
  if (period === "all") return true;
  const from = period === "d30" ? daysAgo(30, today) : `${today.getFullYear()}-01-01`;
  return p.visits.some((v) => v.date >= from && v.date <= isoDate(today));
}

export function matchesTab(p: Item, f: Pick<Filters, "tab" | "period">, today?: Date): boolean {
  if (f.tab === "more") return true;
  if (f.tab === "done") return isDone(p) && inPeriod(p, f.period, today);
  return !isDone(p);
}

/** List and tag filters, shared by the counts and the visible items. */
export function matchesScope(p: Item, f: Pick<Filters, "list" | "tags">): boolean {
  if (f.list && !p.lists.includes(f.list)) return false;
  for (const t of f.tags) if (!p.tags.includes(t)) return false;
  return true;
}

export function effectiveOrder(f: Pick<Filters, "tab" | "order">): Order {
  const allowed = ORDERS_BY_TAB[f.tab === "done" ? "done" : "pend"];
  return allowed.includes(f.order) ? f.order : allowed[0];
}

/** Items for the current tab and filters, in display order. */
export function visibleItems(items: Item[], f: Filters, today?: Date): Item[] {
  const r = items.filter(
    (p) =>
      (f.cats.size === 0 || f.cats.has(p.cat)) &&
      matchesTab(p, f, today) &&
      matchesScope(p, f) &&
      matchesQuery(p, f.q),
  );
  const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, "es");
  const byLast = (a: Item, b: Item) => lastVisit(b).localeCompare(lastVisit(a));
  switch (effectiveOrder(f)) {
    case "az":
      return r.sort(byName);
    case "most":
      return r.sort((a, b) => b.visits.length - a.visits.length || byLast(a, b));
    case "rating":
      return r.sort((a, b) => avgRating(b) - avgRating(a) || byLast(a, b));
    case "near": {
      const here = f.here;
      if (!here) return r.sort(byName);
      const d = (p: Item) => (hasLoc(p) ? distanceKm(here, { lat: p.lat!, lng: p.lng! }) : Infinity);
      return r.sort((a, b) => d(a) - d(b) || byName(a, b));
    }
    default:
      return f.tab === "done" ? r.sort(byLast) : r.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Merges imported items into the current ones: same id → the most recently updated wins. */
export function mergeItems(current: Item[], incoming: Item[]): { items: Item[]; added: number; updated: number } {
  const byId = new Map(current.map((p) => [p.id, p]));
  let added = 0, updated = 0;
  for (const p of incoming) {
    const old = byId.get(p.id);
    if (!old) {
      byId.set(p.id, p);
      added++;
    } else if (p.updatedAt > old.updatedAt) {
      byId.set(p.id, p);
      updated++;
    }
  }
  return { items: [...byId.values()], added, updated };
}

/** Renames (or, with an empty new name, removes) a list on every item that has it. Returns the changed items. */
export function renameList(items: Item[], from: string, to: string): Item[] {
  const target = cleanListName(to);
  return items
    .filter((p) => p.lists.includes(from))
    .map((p) => ({
      ...p,
      lists: [...new Set(p.lists.flatMap((l) => (l === from ? (target ? [target] : []) : [l])))],
    }));
}
