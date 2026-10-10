import { distanceKm, parseTags } from "./items";
import type { Coords } from "./links";
import type { CatKey, Item, ItemInfo } from "./types";

/** A place from the map data (OpenStreetMap) that is not saved yet. */
export interface Poi {
  /** "node/123", "way/456"… */
  id: string;
  name: string;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

// Kinds of places worth saving, by OpenStreetMap key.
const KINDS: Record<string, Record<string, { label: string; cat: CatKey }>> = {
  amenity: {
    restaurant: { label: "Restaurante", cat: "comer" },
    cafe: { label: "Cafetería", cat: "comer" },
    bar: { label: "Bar", cat: "comer" },
    pub: { label: "Pub", cat: "comer" },
    fast_food: { label: "Comida rápida", cat: "comer" },
    ice_cream: { label: "Heladería", cat: "comer" },
    biergarten: { label: "Cervecería", cat: "comer" },
    food_court: { label: "Zona de restaurantes", cat: "comer" },
    cinema: { label: "Cine", cat: "ocio" },
    theatre: { label: "Teatro", cat: "ocio" },
    nightclub: { label: "Discoteca", cat: "ocio" },
    arts_centre: { label: "Centro cultural", cat: "ocio" },
    marketplace: { label: "Mercado", cat: "comer" },
  },
  tourism: {
    museum: { label: "Museo", cat: "ver" },
    attraction: { label: "Atracción", cat: "ver" },
    viewpoint: { label: "Mirador", cat: "ver" },
    gallery: { label: "Galería", cat: "ver" },
    zoo: { label: "Zoo", cat: "ocio" },
    aquarium: { label: "Acuario", cat: "ocio" },
    theme_park: { label: "Parque temático", cat: "ocio" },
  },
  historic: {
    monument: { label: "Monumento", cat: "ver" },
    castle: { label: "Castillo", cat: "ver" },
    ruins: { label: "Ruinas", cat: "ver" },
    palace: { label: "Palacio", cat: "ver" },
    memorial: { label: "Memorial", cat: "ver" },
  },
  leisure: {
    park: { label: "Parque", cat: "ver" },
    garden: { label: "Jardín", cat: "ver" },
  },
  shop: {
    bakery: { label: "Panadería", cat: "comer" },
    pastry: { label: "Pastelería", cat: "comer" },
    confectionery: { label: "Confitería", cat: "comer" },
    deli: { label: "Delicatessen", cat: "comer" },
    wine: { label: "Vinoteca", cat: "comer" },
  },
};

const CUISINE: Record<string, string> = {
  spanish: "española", regional: "regional", tapas: "tapas", italian: "italiana", pizza: "pizza", japanese: "japonesa",
  sushi: "sushi", chinese: "china", mexican: "mexicana", indian: "india", thai: "tailandesa", vietnamese: "vietnamita",
  korean: "coreana", french: "francesa", greek: "griega", turkish: "turca", lebanese: "libanesa", peruvian: "peruana",
  argentinian: "argentina", american: "americana", burger: "hamburguesas", seafood: "marisco", fish: "pescado",
  steak_house: "carne", grill: "brasa", vegetarian: "vegetariana", vegan: "vegana", coffee_shop: "café", ice_cream: "helados",
  chocolate: "chocolate", churros: "churros", sandwich: "bocadillos", kebab: "kebab", ramen: "ramen", portuguese: "portuguesa",
  galician: "gallega", basque: "vasca", asturian: "asturiana", andalusian: "andaluza", mediterranean: "mediterránea",
};

export function kindOf(tags: Record<string, string>): { label: string; cat: CatKey } {
  for (const [key, values] of Object.entries(KINDS)) {
    const k = values[tags[key]];
    if (k) return k;
  }
  return { label: "Lugar", cat: "varios" };
}

export function cuisineLabels(tags: Record<string, string>): string[] {
  return (tags.cuisine ?? "")
    .split(";")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .map((c) => CUISINE[c] ?? c.replace(/_/g, " "));
}

export function addressOf(tags: Record<string, string>): string {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  return [street, tags["addr:city"]].filter(Boolean).join(", ");
}

const DAYS: [RegExp, string][] = [
  [/\bMo\b/g, "Lu"], [/\bTu\b/g, "Ma"], [/\bWe\b/g, "Mi"], [/\bTh\b/g, "Ju"], [/\bFr\b/g, "Vi"],
  [/\bSa\b/g, "Sá"], [/\bSu\b/g, "Do"], [/\bPH\b/g, "Festivos"], [/\boff\b/g, "cerrado"], [/\bclosed\b/g, "cerrado"],
];

/** "Mo-Fr 12:00-16:00; Su off" → "Lu-Vi 12:00-16:00; Do cerrado" */
export function hoursEs(h: string): string {
  let s = h.trim();
  if (s === "24/7") return "Abierto 24 horas";
  for (const [re, es] of DAYS) s = s.replace(re, es);
  return s.replace(/\s*;\s*/g, "; ");
}

const pick = (t: Record<string, string>, ...keys: string[]) => keys.map((k) => t[k]).find((v) => v?.trim())?.trim() ?? "";

export function infoOf(p: Poi): ItemInfo {
  const t = p.tags;
  return {
    website: pick(t, "website", "contact:website", "url"),
    phone: pick(t, "phone", "contact:phone"),
    hours: pick(t, "opening_hours"),
    osmId: p.id,
  };
}

/** Everything the add form can be filled with, from a map place. */
export function prefillFromPoi(p: Poi) {
  const t = p.tags;
  const extra: string[] = [];
  if (t.outdoor_seating === "yes") extra.push("terraza");
  if (t["diet:vegetarian"] === "yes" || t["diet:vegetarian"] === "only") extra.push("vegetariano");
  if (t["diet:vegan"] === "yes" || t["diet:vegan"] === "only") extra.push("vegano");
  return {
    cat: kindOf(t).cat,
    name: p.name,
    addr: addressOf(t),
    coords: { lat: p.lat, lng: p.lng } as Coords,
    tags: parseTags([...cuisineLabels(t), ...extra].join(",")),
    info: infoOf(p),
  };
}

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpass(json: { elements?: OverpassEl[] }): Poi[] {
  return (json.elements ?? []).flatMap((e) => {
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    const name = e.tags?.name?.trim();
    if (lat == null || lng == null || !name) return [];
    return [{ id: `${e.type}/${e.id}`, name, lat, lng, tags: e.tags! }];
  });
}

export interface Bounds {
  s: number;
  w: number;
  n: number;
  e: number;
}

function overpassQuery(b: Bounds): string {
  const bb = `${b.s.toFixed(5)},${b.w.toFixed(5)},${b.n.toFixed(5)},${b.e.toFixed(5)}`;
  const parts = Object.entries(KINDS).map(([key, values]) => `nwr["${key}"~"^(${Object.keys(values).join("|")})$"]["name"](${bb});`);
  return `[out:json][timeout:20];(${parts.join("")});out center tags 400;`;
}

/** Places worth saving within `radius` metres of a point, nearest first. */
export async function fetchPoisAround(c: Coords, radius = 60, signal?: AbortSignal): Promise<Poi[]> {
  const around = `around:${radius},${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
  const parts = Object.entries(KINDS).map(([key, values]) => `nwr["${key}"~"^(${Object.keys(values).join("|")})$"]["name"](${around});`);
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: `[out:json][timeout:15];(${parts.join("")});out center tags 30;` }),
    signal,
  });
  if (!res.ok) throw new Error(`El mapa de locales respondió ${res.status}.`);
  return sortByDistance(parseOverpass(await res.json()), c);
}

export function sortByDistance(pois: Poi[], c: Coords): Poi[] {
  return [...pois].sort((a, b) => distanceKm(c, a) - distanceKm(c, b));
}

/** Street address of a point (Nominatim reverse), e.g. "Calle de Tetuán, 12, Madrid". "" when unknown. */
export async function reverseAddress(c: Coords, signal?: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ lat: String(c.lat), lon: String(c.lng), format: "jsonv2", zoom: "18", addressdetails: "1", "accept-language": "es" });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) return "";
  const r = (await res.json()) as { address?: Record<string, string>; display_name?: string };
  const a = r.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.footway ?? a.square, a.house_number].filter(Boolean).join(", ");
  const place = a.city ?? a.town ?? a.village ?? "";
  return [street, place].filter(Boolean).join(", ") || (r.display_name ?? "").split(",").slice(0, 3).join(",").trim();
}

/** Places worth saving inside the given area (Overpass API). Keep the area small: use it only when zoomed in. */
export async function fetchPois(b: Bounds, signal?: AbortSignal): Promise<Poi[]> {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: overpassQuery(b) }),
    signal,
  });
  if (!res.ok) throw new Error(`El mapa de locales respondió ${res.status}.`);
  return parseOverpass(await res.json());
}

interface NominatimPlace {
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
  extratags?: Record<string, string> | null;
  address?: Record<string, string>;
}

export function poiFromNominatim(r: NominatimPlace): Poi {
  const tags: Record<string, string> = { ...(r.extratags ?? {}) };
  if (r.category && r.type) tags[r.category] = r.type;
  const a = r.address ?? {};
  if (a.road) tags["addr:street"] ??= a.road;
  if (a.house_number) tags["addr:housenumber"] ??= a.house_number;
  const city = a.city ?? a.town ?? a.village;
  if (city) tags["addr:city"] ??= city;
  const name = r.name || r.display_name.split(",")[0];
  tags.name ??= name;
  return {
    id: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : `search/${r.lat},${r.lon}`,
    name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    tags,
  };
}

/** Search places and addresses by name around the map view (Nominatim). One request per explicit search. */
export async function searchPois(q: string, view: Bounds, signal?: AbortSignal): Promise<Poi[]> {
  const params = new URLSearchParams({
    q, format: "jsonv2", limit: "10", "accept-language": "es", extratags: "1", addressdetails: "1",
    viewbox: `${view.w},${view.n},${view.e},${view.s}`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`El buscador respondió ${res.status}.`);
  return ((await res.json()) as NominatimPlace[]).map(poiFromNominatim);
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** The saved item for this map place, if any: same OpenStreetMap id, or same name within 80 m. */
export function findSaved(items: Item[], p: Poi): Item | undefined {
  return (
    items.find((i) => i.info.osmId && i.info.osmId === p.id) ??
    items.find(
      (i) =>
        i.lat != null && i.lng != null &&
        fold(i.name) === fold(p.name) &&
        distanceKm({ lat: i.lat, lng: i.lng }, { lat: p.lat, lng: p.lng }) < 0.08,
    )
  );
}
