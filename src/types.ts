export type CatKey = "comer" | "ver" | "ocio" | "receta" | "varios";

/** One dated entry in an item's log: a visit to a place, or a time a recipe was cooked. */
export interface Visit {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  note: string;
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
  visits: Visit[];
  createdAt: string;
  updatedAt: string;
}

export type Tab = "pend" | "done" | "more";
export type Period = "all" | "d30" | "year";
export type Order = "recent" | "most" | "az";
