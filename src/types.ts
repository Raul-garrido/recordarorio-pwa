export type CatKey = "comer" | "ver" | "ocio" | "receta" | "varios";

/** One dated entry in an item's log: a visit to a place, or a time a recipe was cooked. */
export interface Visit {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  note: string;
  /** 1–5 stars, 0 when not rated. */
  rating: number;
  /** Ids of photos kept in the "photos" store. */
  photos: string[];
}

/** Extra details that come from the map data (OpenStreetMap) when a place is added from the map. */
export interface ItemInfo {
  website: string;
  phone: string;
  /** Opening hours as given by OpenStreetMap, e.g. "Mo-Fr 12:00-16:00". */
  hours: string;
  /** OpenStreetMap id ("node/123"), used to recognise a place already saved. */
  osmId: string;
}

export interface Item {
  id: string;
  name: string;
  cat: CatKey;
  desc: string;
  /** Recipes only. Free text, one ingredient per line or comma separated. */
  ingr: string;
  addr: string;
  lat: number | null;
  lng: number | null;
  /** The Google Maps link the item was created from, if any. */
  mapsUrl: string;
  /** Links to videos or posts where the item was seen (TikTok, Instagram…). */
  socials: string[];
  /** Free tags without "#", lower case: "terraza", "barato". */
  tags: string[];
  /** Trips or cities the item belongs to: "Lisboa mayo", "Madrid". */
  lists: string[];
  info: ItemInfo;
  /** Photos of the place itself (e.g. taken on the spot before visiting). Visit photos live in each visit. */
  photos: string[];
  visits: Visit[];
  createdAt: string;
  updatedAt: string;
}

export type Tab = "pend" | "done" | "more";
export type Period = "all" | "d30" | "year";
export type Order = "recent" | "most" | "rating" | "near" | "az";
