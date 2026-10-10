export interface Coords {
  lat: number;
  lng: number;
}

export interface MapsLinkInfo {
  coords: Coords | null;
  /** Place name found in the link (…/maps/place/<name>/…). */
  name: string;
  /** Free-text search found in the link (?q=…), usable for geocoding. */
  query: string;
  isUrl: boolean;
  isMaps: boolean;
  /** maps.app.goo.gl and similar: the location can't be read from the link itself. */
  isShort: boolean;
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const MAPS_RE = /(^|\.)google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|openstreetmap\.org/i;
const SHORT_RE = /maps\.app\.goo\.gl|goo\.gl\/maps/i;

const validLat = (v: number) => Number.isFinite(v) && Math.abs(v) <= 90;
const validLng = (v: number) => Number.isFinite(v) && Math.abs(v) <= 180;

function coordsFrom(a: string | undefined, b: string | undefined): Coords | null {
  if (a == null || b == null) return null;
  const lat = Number(a), lng = Number(b);
  return validLat(lat) && validLng(lng) ? { lat, lng } : null;
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
};

/** Reads coordinates, place name and search text from a Google/Apple Maps link or plain "lat, lng" text. */
export function parseMapsLink(input: string): MapsLinkInfo {
  const s = input.trim();
  const isUrl = /^https?:\/\//i.test(s);
  const isMaps = isUrl && MAPS_RE.test(s);
  const info: MapsLinkInfo = { coords: null, name: "", query: "", isUrl, isMaps, isShort: isUrl && SHORT_RE.test(s) };

  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  // Order matters: !3d!4d is the place itself, @lat,lng is only the viewport centre.
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|query|ll|sll|destination|daddr)=${num},\\s*${num}(?:[&#]|$)`),
    new RegExp(`@${num},${num}`),
    new RegExp(`^geo:${num},${num}`, "i"),
    new RegExp(`^${num}\\s*,\\s*${num}$`),
    new RegExp(`[?&]mlat=${num}&mlon=${num}`),
  ];
  for (const re of patterns) {
    const m = s.match(re);
    const c = m && coordsFrom(m[1], m[2]);
    if (c) {
      info.coords = c;
      break;
    }
  }

  const place = s.match(/\/maps\/place\/([^/@?#]+)/i);
  if (place) info.name = decode(place[1]).split(",")[0].trim();

  if (isUrl) {
    try {
      const u = new URL(s);
      const q = u.searchParams.get("q") ?? u.searchParams.get("query") ?? "";
      if (q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) info.query = q.trim();
    } catch {
      /* not a valid URL: nothing more to read */
    }
  }
  return info;
}

const PLATFORMS: { re: RegExp; name: string }[] = [
  { re: /(^|\.|\/\/)tiktok\.com/i, name: "TikTok" },
  { re: /instagram\.com|instagr\.am/i, name: "Instagram" },
  { re: /youtube\.com|youtu\.be/i, name: "YouTube" },
  { re: /facebook\.com|fb\.watch/i, name: "Facebook" },
  { re: /(^|\.|\/\/)(x|twitter)\.com/i, name: "X" },
  { re: /pinterest\.|pin\.it/i, name: "Pinterest" },
];

/** Name of the site a link belongs to: TikTok, Instagram… or "Web". */
export function platformOf(url: string): string {
  return PLATFORMS.find((p) => p.re.test(url))?.name ?? "Web";
}

export function isSocial(url: string): boolean {
  return PLATFORMS.some((p) => p.re.test(url));
}

/** Adds https:// to bare domains like "tiktok.com/@x". Returns "" for empty input. */
export function normUrl(u: string): string {
  const s = u.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function shortUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

export interface SharedData {
  name: string;
  addr: string;
  desc: string;
  mapsUrl: string;
  coords: Coords | null;
  socials: string[];
}

/**
 * Turns what another app shares with us (Web Share Target: title, text, url) into item fields.
 * Google Maps on Android shares "Name\nAddress\nhttps://maps.app.goo.gl/…";
 * TikTok/Instagram share a caption plus a link.
 */
export function parseShared(title = "", text = "", url = ""): SharedData {
  const all = [title, text, url].join("\n");
  const urls = [...new Set((all.match(URL_RE) ?? []).map((u) => u.replace(/[),.;]+$/, "")))];
  const out: SharedData = { name: "", addr: "", desc: "", mapsUrl: "", coords: null, socials: [] };

  for (const u of urls) {
    if (MAPS_RE.test(u)) {
      if (!out.mapsUrl) out.mapsUrl = u;
    } else {
      out.socials.push(u);
    }
  }

  const lines = text
    .replace(URL_RE, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const cleanTitle = title.replace(URL_RE, "").trim();

  if (out.mapsUrl) {
    const info = parseMapsLink(out.mapsUrl);
    out.coords = info.coords;
    out.name = cleanTitle || lines[0] || info.name || info.query;
    const rest = cleanTitle ? lines.filter((l) => l !== cleanTitle) : lines.slice(1);
    out.addr = rest.join(", ");
  } else {
    out.name = cleanTitle;
    out.desc = lines.join("\n");
  }
  return out;
}
