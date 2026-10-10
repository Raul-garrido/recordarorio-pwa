import { allPhotos, normalizeItem } from "./items";
import type { Item } from "./types";

const DB_NAME = "recordatorio";
const ITEMS = "items";
const PHOTOS = "photos";

interface PhotoRow {
  id: string;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadAll(): Promise<Item[]> {
  const raw = (await tx<unknown[]>(ITEMS, "readonly", (s) => s.getAll())) ?? [];
  return raw.map(normalizeItem).filter((p): p is Item => p !== null);
}

export function putItem(item: Item): Promise<unknown> {
  return tx(ITEMS, "readwrite", (s) => s.put(item));
}

export function deleteItem(id: string): Promise<unknown> {
  return tx(ITEMS, "readwrite", (s) => s.delete(id));
}

export function putMany(items: Item[]): Promise<unknown> {
  return tx(ITEMS, "readwrite", (s) => {
    for (const p of items) s.put(p);
  });
}

export function putPhoto(id: string, blob: Blob): Promise<unknown> {
  return tx(PHOTOS, "readwrite", (s) => s.put({ id, blob } satisfies PhotoRow));
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const row = await tx<PhotoRow | undefined>(PHOTOS, "readonly", (s) => s.get(id));
  return row?.blob ?? null;
}

export function deletePhotos(ids: string[]): Promise<unknown> {
  if (!ids.length) return Promise.resolve();
  return tx(PHOTOS, "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
}

/** Asks the browser not to evict our data when the device is low on space. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export const EXPORT_VERSION = 2;

export interface ExportData {
  items: Item[];
  /** Photo id → data: URL. Only present when the copy includes photos. */
  photos?: Record<string, string>;
}

export function toExportJson(items: Item[], photos?: Record<string, string>): string {
  return JSON.stringify(
    { app: "recordatorio", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), items, ...(photos ? { photos } : {}) },
    null,
    2,
  );
}

/** Accepts our export format (with or without photos) or a bare array of items. */
export function parseImport(text: string): ExportData {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error("El archivo no contiene una lista de elementos.");
  const items = list.map(normalizeItem).filter((p): p is Item => p !== null);
  const rawPhotos = Array.isArray(data) ? null : (data as { photos?: unknown }).photos;
  const photos: Record<string, string> = {};
  if (rawPhotos && typeof rawPhotos === "object") {
    for (const [id, url] of Object.entries(rawPhotos as Record<string, unknown>)) {
      if (typeof url === "string" && url.startsWith("data:image/")) photos[id] = url;
    }
  }
  return { items, photos };
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

export async function exportPhotos(items: Item[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of items.flatMap(allPhotos)) {
    const blob = await getPhoto(id);
    if (blob) out[id] = await blobToDataUrl(blob);
  }
  return out;
}

export async function importPhotos(photos: Record<string, string>): Promise<number> {
  let n = 0;
  for (const [id, url] of Object.entries(photos)) {
    const blob = await (await fetch(url)).blob();
    await putPhoto(id, blob);
    n++;
  }
  return n;
}
