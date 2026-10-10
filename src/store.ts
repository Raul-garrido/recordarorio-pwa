import { normalizeItem } from "./items";
import type { Item } from "./types";

const DB_NAME = "recordatorio";
const STORE = "items";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function loadAll(): Promise<Item[]> {
  const raw = (await tx<unknown[]>("readonly", (s) => s.getAll())) ?? [];
  return raw.map(normalizeItem).filter((p): p is Item => p !== null);
}

export function putItem(item: Item): Promise<unknown> {
  return tx("readwrite", (s) => s.put(item));
}

export function deleteItem(id: string): Promise<unknown> {
  return tx("readwrite", (s) => s.delete(id));
}

export function putMany(items: Item[]): Promise<unknown> {
  return tx("readwrite", (s) => {
    for (const p of items) s.put(p);
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

export const EXPORT_VERSION = 1;

export function toExportJson(items: Item[]): string {
  return JSON.stringify({ app: "recordatorio", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), items }, null, 2);
}

/** Accepts our export format or a bare array of items. */
export function parseImport(text: string): Item[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error("El archivo no contiene una lista de elementos.");
  return list.map(normalizeItem).filter((p): p is Item => p !== null);
}
