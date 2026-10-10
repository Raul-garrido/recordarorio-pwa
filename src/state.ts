import { sortVisits } from "./items";
import * as store from "./store";
import type { CatKey, Item, Order, Period, Tab } from "./types";
import { toast } from "./util";

export interface UiState {
  tab: Tab;
  cats: Set<CatKey>;
  q: string;
  period: Period;
  order: Order;
  sel: string | null;
  /** Card sub-states, reset whenever the selection changes. */
  addingVisit: boolean;
  addingLink: boolean;
  confirmDelete: boolean;
  confirmVisit: string | null;
}

export const ui: UiState = {
  tab: "pend",
  cats: new Set(),
  q: "",
  period: "all",
  order: "recent",
  sel: null,
  addingVisit: false,
  addingLink: false,
  confirmDelete: false,
  confirmVisit: null,
};

export let items: Item[] = [];

type Listener = () => void;
const listeners: Listener[] = [];
export const onChange = (fn: Listener) => listeners.push(fn);
export const render = () => listeners.forEach((fn) => fn());

const fail = (e: unknown) => {
  console.error(e);
  toast("No se pudo guardar en este dispositivo. Revisa el espacio libre.");
};

export async function load(): Promise<void> {
  items = await store.loadAll();
}

export const byId = (id: string | null) => (id ? items.find((p) => p.id === id) : undefined);

export function upsert(item: Item): void {
  item.visits = sortVisits(item.visits);
  item.updatedAt = new Date().toISOString();
  const i = items.findIndex((p) => p.id === item.id);
  if (i >= 0) items[i] = item;
  else items.push(item);
  store.putItem(item).catch(fail);
  render();
}

export function remove(id: string): void {
  items = items.filter((p) => p.id !== id);
  if (ui.sel === id) ui.sel = null;
  store.deleteItem(id).catch(fail);
  render();
}

export function replaceAll(next: Item[]): Promise<unknown> {
  items = next;
  render();
  return store.putMany(next).catch(fail);
}

export function select(id: string | null): void {
  ui.sel = id;
  ui.addingVisit = false;
  ui.addingLink = false;
  ui.confirmDelete = false;
  ui.confirmVisit = null;
  render();
}

export function setTab(tab: Tab): void {
  ui.tab = tab;
  render();
}
