import { getLines, searchLinesByLabel } from './api';
import type { Line } from '../types/api';
import { chipStyle } from './contrast';

// El color de línea no llega con arrivals ni con el detalle de parada: se resuelve con
// UNA llamada a /lines (listado completo con color) y caché localStorage con TTL
// (`madmovil:linecolors-all`, patrón de crtmlinecolors.ts). El resultado por label se
// materializa en la caché de siempre (`madmovil:linecolors`), cuya clave es el label
// tal cual aparece en el chip (con sufijo "150/1" o ceros "046/1"). Si /lines cae,
// queda el respaldo por label (/lines/search) de antes.
// Los badges lo usan vía atributo data-line="<label>" y paintLineBadges los colorea.

const CACHE_KEY = 'madmovil:linecolors';
const ALL_CACHE_KEY = 'madmovil:linecolors-all';
const TTL_MS = 7 * 24 * 60 * 60_000;

let cache: Record<string, string> = {};
let loaded = false;
const pending = new Map<string, Promise<void>>();

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    cache = {};
  }
}

function persist(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage lleno o bloqueado: se resuelve sin caché */
  }
}

// —— Caché global del listado /lines (una llamada para TODOS los labels) ——————————

let allColors: Record<string, string> = {};
let allLoaded = false;
let fetching: Promise<void> | null = null;

function ensureAllLoaded(): void {
  if (allLoaded) return;
  allLoaded = true;
  // SSR-safe: sin localStorage (fallback ?q= del buscador) la caché va vacía y el
  // fetch es client-side
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(ALL_CACHE_KEY) ?? 'null') as { ts: number; colors: Record<string, string> } | null;
    if (raw && typeof raw.ts === 'number' && Date.now() - raw.ts < TTL_MS && raw.colors && typeof raw.colors === 'object') {
      allColors = raw.colors;
    }
  } catch {
    allColors = {};
  }
}

function persistAll(): void {
  try {
    localStorage.setItem(ALL_CACHE_KEY, JSON.stringify({ ts: Date.now(), colors: allColors }));
  } catch {
    /* storage lleno o bloqueado: se resuelve sin caché */
  }
}

async function fetchAllColors(): Promise<void> {
  const res = await getLines();
  allColors = {};
  for (const line of res.lines) {
    if (line.color) allColors[line.label] = `#${line.color}`;
  }
  persistAll();
}

/** ¿Está disponible el listado global (caché fresca o fetch OK)? false → respaldo por label */
async function ensureAllColors(): Promise<boolean> {
  ensureAllLoaded();
  if (Object.keys(allColors).length > 0) return true;
  if (!fetching) {
    fetching = fetchAllColors()
      .catch(() => {})
      .finally(() => {
        fetching = null;
      });
  }
  await fetching;
  return Object.keys(allColors).length > 0;
}

/** Respaldo por label (SOLO si /lines falló): GET /lines/search por label que falte */
async function fetchColor(label: string): Promise<void> {
  // El listado de paradas usa labels con sufijo de sentido (p. ej. "150/1"): buscar por la base
  const query = label.includes('/') ? label.split('/')[0] : label;
  let res = await searchLinesByLabel(query);
  let line: Line | undefined = res.lines.find((l) => l.label === query) ?? res.lines[0];
  // La API de paradas devuelve labels con ceros a la izquierda ("046/1") que /lines/search no
  // normaliza: reintentar sin ellos ("46"). "001"/"002" son labels reales y resuelven exactos.
  if (!line && /^0\d/.test(query)) {
    const stripped = query.replace(/^0+/, '');
    res = await searchLinesByLabel(stripped);
    line = res.lines.find((l) => l.label === stripped);
  }
  if (line?.color) cache[label] = `#${line.color}`;
}

export async function ensureLineColors(labels: string[]): Promise<void> {
  ensureLoaded();
  const missing = [...new Set(labels)].filter((l) => l && !cache[l]);
  if (missing.length === 0) return;
  if (await ensureAllColors()) {
    // Misma normalización que el respaldo: base del sufijo y, si no aparece, base sin
    // ceros a la izquierda. Si el label no está en el listado, se da por desconocido
    // (sin peticiones extra: la próxima carga reintenta gratis contra la caché global)
    let changed = false;
    for (const label of missing) {
      const base = label.includes('/') ? label.split('/')[0] : label;
      const hex = allColors[base] ?? (/^0\d/.test(base) ? allColors[base.replace(/^0+/, '')] : undefined);
      if (hex) {
        cache[label] = hex;
        changed = true;
      }
    }
    if (changed) persist();
    return;
  }
  const toFetch = missing.filter((l) => !pending.has(l));
  for (const label of toFetch) {
    const p = fetchColor(label)
      .catch(() => {})
      .finally(() => pending.delete(label));
    pending.set(label, p);
  }
  if (pending.size > 0) await Promise.all(pending.values());
  if (toFetch.length > 0) persist();
}

function labelsIn(root: HTMLElement | Document): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-line]')]
    .map((el) => el.dataset.line ?? '')
    .filter(Boolean);
}

export function paintLineBadges(root: HTMLElement | Document = document): void {
  ensureLoaded();
  root.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
    const color = cache[el.dataset.line ?? ''];
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
      el.setAttribute('style', chipStyle(color));
    }
  });
}

export async function paintAndFetchLineColors(root: HTMLElement | Document = document): Promise<void> {
  const labels = labelsIn(root);
  await ensureLineColors(labels);
  paintLineBadges(root);
}
