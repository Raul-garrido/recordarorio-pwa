export interface GeoResult {
  name: string;
  label: string;
  lat: number;
  lng: number;
}

interface NominatimRow {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/**
 * Address → coordinates with OpenStreetMap's Nominatim.
 * Usage policy: at most one request per second and no autocomplete, so call this only on an explicit search.
 */
export async function geocode(query: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "6", "accept-language": "es", addressdetails: "0" });
  if (near) {
    const d = 0.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`El buscador de direcciones respondió ${res.status}.`);
  const rows = (await res.json()) as NominatimRow[];
  return rows.map((r) => ({
    name: r.name || r.display_name.split(",")[0],
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
}
