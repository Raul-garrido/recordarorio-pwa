import { describe, expect, it } from "vitest";
import {
  avgRating, distanceKm, fmtDistance, inPeriod, makeItem, matchesQuery, mergeItems, normalizeItem, parseTags, renameList,
  sortVisits, visibleItems, type Filters,
} from "./items";
import { parseImport, toExportJson } from "./store";
import type { Item, Visit } from "./types";

const visit = (id: string, date: string, note = "", rating = 0): Visit => ({ id, date, note, rating, photos: [] });

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026

const item = (over: Partial<Item> & { name: string }): Item => makeItem({ cat: "comer", ...over });

const filters = (over: Partial<Filters> = {}): Filters => ({
  tab: "pend",
  cats: new Set(),
  tags: new Set(),
  list: null,
  here: null,
  q: "",
  period: "all",
  order: "recent",
  ...over,
});

describe("visibleItems", () => {
  const labra = item({ name: "Casa Labra", visits: [visit("v1", "2026-09-28", "Croquetas 10/10")] });
  const debod = item({
    name: "Templo de Debod",
    cat: "ver",
    visits: [
      visit("v2", "2026-10-07", ""),
      visit("v3", "2026-07-01", ""),
    ],
  });
  const prado = item({ name: "Museo del Prado", cat: "ver", visits: [visit("v4", "2025-09-05", "")] });
  const tortilla = item({ name: "Tortilla de patatas", cat: "receta", ingr: "huevos, patatas, cebolla" });
  const all = [labra, debod, prado, tortilla];

  it("splits pending and visited", () => {
    expect(visibleItems(all, filters(), TODAY).map((p) => p.name)).toEqual(["Tortilla de patatas"]);
    expect(visibleItems(all, filters({ tab: "done" }), TODAY)).toHaveLength(3);
  });

  it("filters visited by period", () => {
    const names = (period: Filters["period"]) =>
      visibleItems(all, filters({ tab: "done", period }), TODAY).map((p) => p.name);
    expect(names("d30")).toEqual(["Templo de Debod", "Casa Labra"]);
    expect(names("year")).toEqual(["Templo de Debod", "Casa Labra"]);
    expect(names("all")).toContain("Museo del Prado");
  });

  it("orders visited by most visits and alphabetically", () => {
    expect(visibleItems(all, filters({ tab: "done", order: "most" }), TODAY)[0].name).toBe("Templo de Debod");
    expect(visibleItems(all, filters({ tab: "done", order: "az" }), TODAY).map((p) => p.name)).toEqual([
      "Casa Labra",
      "Museo del Prado",
      "Templo de Debod",
    ]);
  });

  it("filters by category", () => {
    expect(visibleItems(all, filters({ tab: "done", cats: new Set(["ver"]) }), TODAY)).toHaveLength(2);
  });
});

describe("matchesQuery", () => {
  const p = item({ name: "Tortilla de patatas", cat: "receta", ingr: "Cebolla pochada", socials: ["https://vm.tiktok.com/x"] });

  it("searches ingredients, platform and category, ignoring accents and case", () => {
    expect(matchesQuery(p, "CEBOLLA")).toBe(true);
    expect(matchesQuery(p, "tiktok")).toBe(true);
    expect(matchesQuery(p, "recetas")).toBe(true);
    expect(matchesQuery(item({ name: "Café Central" }), "cafe")).toBe(true);
  });

  it("requires every word to match", () => {
    expect(matchesQuery(p, "tortilla cebolla")).toBe(true);
    expect(matchesQuery(p, "tortilla jamón")).toBe(false);
  });

  it("searches visit notes", () => {
    expect(matchesQuery(item({ name: "X", visits: [visit("v", "2026-01-01", "Croquetas")] }), "croquetas")).toBe(true);
  });
});

describe("inPeriod", () => {
  it("ignores future-dated visits in the last-30-days view", () => {
    const p = item({ name: "X", visits: [visit("v", "2026-12-01", "")] });
    expect(inPeriod(p, "d30", TODAY)).toBe(false);
  });
});

describe("sortVisits", () => {
  it("puts the newest first, and the latest added first within a day", () => {
    const sorted = sortVisits([
      visit("a", "2026-10-01", ""),
      visit("c", "2026-10-05", ""),
      visit("b", "2026-10-05", ""),
    ]);
    expect(sorted.map((v) => v.id)).toEqual(["c", "b", "a"]);
  });
});

describe("normalizeItem", () => {
  it("rejects entries without a name", () => {
    expect(normalizeItem({ cat: "comer" })).toBeNull();
    expect(normalizeItem("hola")).toBeNull();
  });

  it("fills defaults, drops bad visits and unknown categories", () => {
    const p = normalizeItem({ name: " Rastro ", cat: "mercadillos", lat: 40.4, visits: [{ date: "ayer" }, { date: "2026-10-01" }] })!;
    expect(p.name).toBe("Rastro");
    expect(p.cat).toBe("varios");
    expect(p.lat).toBeNull(); // lat without lng is not a location
    expect(p.visits).toHaveLength(1);
    expect(p.socials).toEqual([]);
  });
});

describe("export / import", () => {
  it("round-trips items and merges by id, keeping the newest version", () => {
    const a = item({ name: "A", updatedAt: "2026-10-01T00:00:00Z" });
    const b = item({ name: "B" });
    const back = parseImport(toExportJson([a, b]));
    expect(back.items.map((p) => p.name)).toEqual(["A", "B"]);

    const newerA = { ...a, name: "A editado", updatedAt: "2026-10-09T00:00:00Z" };
    const c = item({ name: "C" });
    const res = mergeItems([a, b], [newerA, c]);
    expect(res).toMatchObject({ added: 1, updated: 1 });
    expect(res.items.find((p) => p.id === a.id)!.name).toBe("A editado");
  });

  it("accepts a bare array and rejects other files", () => {
    expect(parseImport(JSON.stringify([{ name: "Solo" }])).items).toHaveLength(1);
    expect(() => parseImport('{"foo":1}')).toThrow();
  });
});

describe("tags", () => {
  it("parses commas or hashes, lower-cases and joins words", () => {
    expect(parseTags("Terraza, barato ,  con niños")).toEqual(["terraza", "barato", "con-niños"]);
    expect(parseTags("#Terraza #barato #terraza")).toEqual(["terraza", "barato"]);
    expect(parseTags("  ")).toEqual([]);
  });

  it("filters by every selected tag and finds tags in search", () => {
    const a = item({ name: "A", tags: ["terraza", "barato"] });
    const b = item({ name: "B", tags: ["terraza"] });
    const names = (tags: string[]) => visibleItems([a, b], filters({ tags: new Set(tags) }), TODAY).map((p) => p.name).sort();
    expect(names(["terraza"])).toEqual(["A", "B"]);
    expect(names(["terraza", "barato"])).toEqual(["A"]);
    expect(matchesQuery(a, "#barato")).toBe(true);
  });
});

describe("lists", () => {
  const lis = item({ name: "Pastéis de Belém", lists: ["Lisboa mayo"] });
  const mad = item({ name: "Casa Labra", lists: ["Madrid"] });
  const both = item({ name: "Bacalao", lists: ["Lisboa mayo", "Madrid"] });

  it("shows only the active list", () => {
    const names = visibleItems([lis, mad, both], filters({ list: "Madrid" }), TODAY).map((p) => p.name).sort();
    expect(names).toEqual(["Bacalao", "Casa Labra"]);
  });

  it("renames and removes a list on every item", () => {
    const renamed = renameList([lis, mad, both], "Madrid", "  Madrid centro ");
    expect(renamed.map((p) => p.lists)).toEqual([["Madrid centro"], ["Lisboa mayo", "Madrid centro"]]);
    expect(renameList([lis, both], "Lisboa mayo", "").map((p) => p.lists)).toEqual([[], ["Madrid"]]);
  });
});

describe("ratings", () => {
  it("averages only rated visits", () => {
    const p = item({ name: "X", visits: [visit("a", "2026-10-01", "", 4), visit("b", "2026-10-02", "", 0), visit("c", "2026-10-03", "", 5)] });
    expect(avgRating(p)).toBe(4.5);
    expect(avgRating(item({ name: "Y" }))).toBe(0);
  });

  it("orders visited by best rating", () => {
    const good = item({ name: "Bueno", visits: [visit("a", "2026-01-01", "", 5)] });
    const meh = item({ name: "Regular", visits: [visit("b", "2026-10-01", "", 3)] });
    const none = item({ name: "Sin nota", visits: [visit("c", "2026-10-05")] });
    const r = visibleItems([meh, none, good], filters({ tab: "done", order: "rating" }), TODAY).map((p) => p.name);
    expect(r).toEqual(["Bueno", "Regular", "Sin nota"]);
  });

  it("keeps valid ratings and photos when loading, drops bad ones", () => {
    const p = normalizeItem({ name: "X", visits: [{ date: "2026-10-01", rating: 9, photos: ["f1", 3] }, { date: "2026-10-02", rating: 4 }] })!;
    expect(p.visits.map((v) => [v.rating, v.photos])).toEqual([[4, []], [0, ["f1"]]]);
  });
});

describe("cerca de mí", () => {
  const sol = { lat: 40.4169, lng: -3.7035 };
  it("measures distance", () => {
    expect(distanceKm(sol, { lat: 40.4138, lng: -3.6921 })).toBeCloseTo(1.02, 1); // Sol → Prado
    expect(fmtDistance(0.234)).toBe("230 m");
    expect(fmtDistance(1.24)).toBe("1,2 km");
    expect(fmtDistance(23.4)).toBe("23 km");
  });

  it("sorts by distance with items without location last", () => {
    const far = item({ name: "Lejos", lat: 40.45, lng: -3.69 });
    const near = item({ name: "Cerca", lat: 40.417, lng: -3.704 });
    const noloc = item({ name: "Sin sitio" });
    const r = visibleItems([far, noloc, near], filters({ order: "near", here: sol }), TODAY).map((p) => p.name);
    expect(r).toEqual(["Cerca", "Lejos", "Sin sitio"]);
  });

  it("falls back to an allowed order for the tab", () => {
    const a = item({ name: "B" }), b = item({ name: "A" });
    // "most" only exists in Visitados; in Pendientes it falls back to newest first.
    expect(visibleItems([a, b], filters({ order: "most" }), TODAY)).toHaveLength(2);
  });
});

describe("import with photos", () => {
  it("keeps only image data URLs", () => {
    const json = toExportJson([item({ name: "A" })], { f1: "data:image/jpeg;base64,AAAA", f2: "javascript:alert(1)" });
    expect(Object.keys(parseImport(json).photos ?? {})).toEqual(["f1"]);
  });
});
