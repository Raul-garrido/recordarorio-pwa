import type { CatKey } from "./types";

export interface LogLabels {
  title: string;
  one: string;
  many: string;
  cta: string;
  more: string;
  none: string;
  placeholder: string;
}

export interface Category {
  key: CatKey;
  name: string;
  sub: string;
  /** Pin and dot colors for light and dark themes. */
  color: { light: string; dark: string };
  /** SVG content drawn in a -8..8 box, stroked white. */
  icon: string;
  /** Whether items of this type go on the map. */
  location: "required" | "optional" | "none";
  log: LogLabels;
}

const PLACE_LOG: LogLabels = {
  title: "Visitas",
  one: "visita",
  many: "visitas",
  cta: "He ido: registrar visita",
  more: "Otra visita",
  none: "Aún no has ido.",
  placeholder: "¿Qué tal? Qué pediste, con quién fuiste, si volverías…",
};

// To add a new filter, add an entry here (and its key to CatKey in types.ts).
export const CATEGORIES: Category[] = [
  {
    key: "comer", name: "Comer", sub: "restaurantes, bares",
    color: { light: "#D24E26", dark: "#F07A50" },
    icon: '<path d="M-4.5,-6v4.5a2,2 0 0 0 4,0V-6M-2.5,-6v12M4,-6c-2.2,1.2-2.2,5.2 0,6.5V6"/>',
    location: "required", log: PLACE_LOG,
  },
  {
    key: "ver", name: "Ver", sub: "lugares, museos",
    color: { light: "#0F7C76", dark: "#38B3A9" },
    icon: '<path d="M-6.5,0Q0,-7.5 6.5,0Q0,7.5 -6.5,0Z"/><circle r="2.2"/>',
    location: "required", log: PLACE_LOG,
  },
  {
    key: "ocio", name: "Ocio", sub: "música, cine, planes",
    color: { light: "#6A48C6", dark: "#A08AF2" },
    icon: '<path d="M0,-6.5l1.9,4.1 4.5,.5-3.3,3 .9,4.4L0,3.3-4,5.5-3.1,1.1-6.4,-1.9-1.9,-2.4Z"/>',
    location: "required", log: PLACE_LOG,
  },
  {
    key: "receta", name: "Recetas", sub: "de vídeos",
    color: { light: "#A86A0C", dark: "#E2A84A" },
    icon: '<path d="M-6,-1.5h12v4a3,3 0 0 1-3,3h-6a3,3 0 0 1-3-3zM-7.5,-1.5h15M-2.5,-4.5c0-1.2 1-1.2 1-2.4M1.5,-4.5c0-1.2 1-1.2 1-2.4"/>',
    location: "none",
    log: {
      title: "Veces que la he hecho", one: "vez", many: "veces",
      cta: "La he hecho", more: "Otra vez", none: "Aún no la has hecho.",
      placeholder: "¿Cómo salió? Qué cambiarías la próxima vez…",
    },
  },
  {
    key: "varios", name: "Varios", sub: "todo lo demás",
    color: { light: "#3F6596", dark: "#86A8DA" },
    icon: '<circle cx="-4.5" r="1.2"/><circle r="1.2"/><circle cx="4.5" r="1.2"/>',
    location: "optional",
    log: {
      title: "Registro", one: "vez", many: "veces",
      cta: "Hecho: registrar", more: "Otra vez", none: "Aún sin registrar.",
      placeholder: "¿Qué tal fue?",
    },
  },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function cat(key: CatKey): Category {
  return BY_KEY.get(key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function isCatKey(v: unknown): v is CatKey {
  return typeof v === "string" && BY_KEY.has(v as CatKey);
}

export function countLabel(key: CatKey, n: number): string {
  const l = cat(key).log;
  return `${n} ${n === 1 ? l.one : l.many}`;
}

export function iconSvg(key: CatKey, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="-8 -8 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cat(key).icon}</svg>`;
}

/** CSS custom properties --cat-<key> for both themes, injected once at startup. */
export function categoryCss(): string {
  const light = CATEGORIES.map((c) => `--cat-${c.key}:${c.color.light};`).join("");
  const dark = CATEGORIES.map((c) => `--cat-${c.key}:${c.color.dark};`).join("");
  const classes = CATEGORIES.map((c) => `.c-${c.key}{--c:var(--cat-${c.key})}`).join("\n");
  return `:root{${light}}
@media (prefers-color-scheme: dark){:root{${dark}}}
${classes}`;
}
