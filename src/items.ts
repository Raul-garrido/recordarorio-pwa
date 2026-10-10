import { cat, isCatKey } from "./categories";
import { daysAgo, isIsoDate, isoDate } from "./dates";
import { platformOf } from "./links";
import type { CatKey, Item, Order, Period, Tab, Visit } from "./types";

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

/** Newest first; same-day entries keep the most recently added on top. */
export function sortVisits(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
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
    visits: [],
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Validates an item from storage or an imported file. Returns null if it can't be used. */
export function normalizeItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name).trim();
  if (!name) return null;
  const visits: Visit[] = Array.isArray(r.visits)
    ? r.visits.flatMap((v) => {
        const o = (v ?? {}) as Record<string, unknown>;
        return isIsoDate(o.date) ? [{ id: str(o.id) || newId("v"), date: o.date, note: str(o.note) }] : [];
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
    socials: Array.isArray(r.socials) ? r.socials.filter((s): s is string => typeof s === "string" && !!s.trim()) : [],
    visits: sortVisits(visits),
    createdAt: str(r.createdAt) || now,
    updatedAt: str(r.updatedAt) || now,
  };
}

export interface Filters {
  tab: Tab;
  cats: Set<CatKey>;
  q: string;
  period: Period;
  order: Order;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function matchesQuery(p: Item, q: string): boolean {
  const needle = fold(q.trim());
  if (!needle) return true;
  const hay = fold(
    [p.name, p.desc, p.addr, p.ingr, cat(p.cat).name, ...p.socials.map(platformOf), ...p.visits.map((v) => v.note)].join(" "),
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

/** Items for the current tab and filters, in display order. */
export function visibleItems(items: Item[], f: Filters, today?: Date): Item[] {
  const r = items.filter(
    (p) => (f.cats.size === 0 || f.cats.has(p.cat)) && matchesTab(p, f, today) && matchesQuery(p, f.q),
  );
  if (f.tab === "done") {
    if (f.order === "recent") r.sort((a, b) => lastVisit(b).localeCompare(lastVisit(a)));
    else if (f.order === "most") r.sort((a, b) => b.visits.length - a.visits.length || lastVisit(b).localeCompare(lastVisit(a)));
    else r.sort((a, b) => a.name.localeCompare(b.name, "es"));
  } else {
    r.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return r;
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
