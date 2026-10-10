import { describe, expect, it } from "vitest";
import { inPeriod, makeItem, matchesQuery, mergeItems, normalizeItem, sortVisits, visibleItems, type Filters } from "./items";
import { parseImport, toExportJson } from "./store";
import type { Item } from "./types";

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026

const item = (over: Partial<Item> & { name: string }): Item => makeItem({ cat: "comer", ...over });

const filters = (over: Partial<Filters> = {}): Filters => ({
  tab: "pend",
  cats: new Set(),
  q: "",
  period: "all",
  order: "recent",
  ...over,
});

describe("visibleItems", () => {
  const labra = item({ name: "Casa Labra", visits: [{ id: "v1", date: "2026-09-28", note: "Croquetas 10/10" }] });
  const debod = item({
    name: "Templo de Debod",
    cat: "ver",
    visits: [
      { id: "v2", date: "2026-10-07", note: "" },
      { id: "v3", date: "2026-07-01", note: "" },
    ],
  });
  const prado = item({ name: "Museo del Prado", cat: "ver", visits: [{ id: "v4", date: "2025-09-05", note: "" }] });
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
    expect(matchesQuery(item({ name: "X", visits: [{ id: "v", date: "2026-01-01", note: "Croquetas" }] }), "croquetas")).toBe(true);
  });
});

describe("inPeriod", () => {
  it("ignores future-dated visits in the last-30-days view", () => {
    const p = item({ name: "X", visits: [{ id: "v", date: "2026-12-01", note: "" }] });
    expect(inPeriod(p, "d30", TODAY)).toBe(false);
  });
});

describe("sortVisits", () => {
  it("puts the newest first, and the latest added first within a day", () => {
    const sorted = sortVisits([
      { id: "a", date: "2026-10-01", note: "" },
      { id: "c", date: "2026-10-05", note: "" },
      { id: "b", date: "2026-10-05", note: "" },
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
    expect(back.map((p) => p.name)).toEqual(["A", "B"]);

    const newerA = { ...a, name: "A editado", updatedAt: "2026-10-09T00:00:00Z" };
    const c = item({ name: "C" });
    const res = mergeItems([a, b], [newerA, c]);
    expect(res).toMatchObject({ added: 1, updated: 1 });
    expect(res.items.find((p) => p.id === a.id)!.name).toBe("A editado");
  });

  it("accepts a bare array and rejects other files", () => {
    expect(parseImport(JSON.stringify([{ name: "Solo" }]))).toHaveLength(1);
    expect(() => parseImport('{"foo":1}')).toThrow();
  });
});
