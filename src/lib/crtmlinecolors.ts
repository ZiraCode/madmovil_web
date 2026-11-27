import { getCrtmLines } from './api';
import { accessibleChipColors } from './contrast';
import { trimMunicipality } from './crtm';
import type { CrtmNetwork } from '../types/crtm';

// Color de línea CRTM para contextos que solo tienen el LABEL sin network (chips de
// favoritos fijados, popups del mapa, resultados de parada de la búsqueda): los items
// del API no viajan con color y chipFallbackColors no puede distinguir bus (uniforme
// por red) ni metro (labels colisionan) sin network. /crtm/lines trae TODOS los
// colores en una sola llamada → caché localStorage (`madmovil:crtmlinecolors`) con
// TTL holgado (7 días: los colores cambian poco, pero un feed nuevo se acaba comiendo).
// El mapa es label → color SOLO para labels únicos entre redes: un label duplicado con
// colores distintos es ambiguo y NO entra (queda al tono de red, mejor que mal pintado).
// Para esos ambiguos ('1'–'11' son M1–M11 Y urbanas de otros municipios) la caché
// guarda además TODAS las entradas por label (red, municipio, color) y
// crtmLineColorInStop desambigua con el contexto de la parada — la misma regla que la
// ficha /parada/crtm usa para resolver label→routeId.
// Patrón calcado de linecolors.ts (EMT) con fetch único en vez de por label.

const CACHE_KEY = 'madmovil:crtmlinecolors';
const TTL_MS = 7 * 24 * 60 * 60_000;

interface CrtmLineEntry {
  network: CrtmNetwork;
  municipality: string;
  color: string;
}

let cache: Record<string, string> = {};
let entries: Record<string, CrtmLineEntry[]> = {};
// Las cachés escritas antes de `entries` solo traen los únicos: se refetchean una vez
let entriesLoaded = false;
let loaded = false;
let fetching: Promise<void> | null = null;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  // SSR-safe: sin localStorage (fallback ?q= del buscador) la caché va vacía y el chip
  // queda con su tono de red — el repaint es client-side
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as {
      ts: number;
      colors: Record<string, string>;
      entries?: Record<string, CrtmLineEntry[]>;
    } | null;
    if (raw && typeof raw.ts === 'number' && Date.now() - raw.ts < TTL_MS && raw.colors && typeof raw.colors === 'object') {
      cache = raw.colors;
      if (raw.entries && typeof raw.entries === 'object') {
        entries = raw.entries;
        entriesLoaded = true;
      }
    }
  } catch {
    cache = {};
  }
}

function persist(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), colors: cache, entries }));
  } catch {
    /* storage lleno o bloqueado: se resuelve sin caché */
  }
}

async function fetchAll(): Promise<void> {
  const res = await getCrtmLines();
  const byLabel = new Map<string, string>();
  const ambiguous = new Set<string>();
  entries = {};
  for (const line of res.lines) {
    if (!line.color) continue;
    const hex = `#${line.color}`;
    const prev = byLabel.get(line.label);
    if (prev === undefined) byLabel.set(line.label, hex);
    else if (prev !== hex) ambiguous.add(line.label);
    (entries[line.label] ??= []).push({ network: line.network, municipality: line.municipality, color: hex });
  }
  for (const label of ambiguous) byLabel.delete(label);
  cache = Object.fromEntries(byLabel);
  entriesLoaded = true;
  persist();
}

export async function ensureCrtmLineColors(): Promise<void> {
  ensureLoaded();
  if (Object.keys(cache).length > 0 && entriesLoaded) return;
  if (!fetching) {
    fetching = fetchAll()
      .catch(() => {})
      .finally(() => {
        fetching = null;
      });
  }
  await fetching;
}

/** Color oficial del label (par accesible) si está en caché y es único entre redes */
export function crtmLineColor(label: string): { color: string; textColor: string } | null {
  ensureLoaded();
  const hex = cache[label];
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const c = accessibleChipColors(hex);
  return { color: c.background, textColor: c.text };
}

/**
 * Color del label en el contexto de una parada CONCRETA: el único si no es ambiguo y,
 * si lo es ('1' = M1 y urbana de otro municipio), la entrada que case con el municipio
 * de la parada o con su tipo de estación (4_ metro, r_ cercanías — los intercambiadores
 * 10_ mezclan redes y solo decide el municipio). Empate real → null (tono de red).
 */
// El municipio de la parada (/crtm/stops/search) y el de la línea (/crtm/lines) salen de
// pipelines distintos y difieren en acentos/mayúsculas ("Alcalá de Henares" vs "ALCALA…"):
// se comparan normalizados (sin diacríticos, mayúsculas)
function muniKey(m: string): string {
  return m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

export function crtmLineColorInStop(
  label: string,
  context: { stopCode?: string; municipality?: string | null }
): { color: string; textColor: string } | null {
  const unique = crtmLineColor(label);
  if (unique) return unique;
  let pool = entries[label] ?? [];
  if (pool.length === 0) return null;
  const muni = context.municipality ? trimMunicipality(context.municipality) : '';
  if (muni) {
    const key = muniKey(muni);
    const byMuni = pool.filter((c) => muniKey(trimMunicipality(c.municipality)) === key);
    if (byMuni.length > 0) pool = byMuni;
  }
  if (pool.length > 1) {
    const code = context.stopCode ?? '';
    const net = code.startsWith('4_') ? 'metro' : code.startsWith('r_') ? 'cercanias' : null;
    if (net) pool = pool.filter((c) => c.network === net);
  }
  const distinct = new Set(pool.map((c) => c.color));
  if (distinct.size !== 1) return null;
  const c = accessibleChipColors(pool[0].color);
  return { color: c.background, textColor: c.text };
}

// Los badges lo usan vía atributo data-crtm-line="<label>": solo se marca el chip que
// quedó SIN color del contexto — el painter nunca pisa un style oficial ya pintado
export function paintCrtmLineBadges(root: HTMLElement | Document = document): void {
  root.querySelectorAll<HTMLElement>('[data-crtm-line]').forEach((el) => {
    const known = crtmLineColor(el.dataset.crtmLine ?? '');
    if (known) el.setAttribute('style', `background:${known.color};color:${known.textColor}`);
  });
}

export async function paintAndFetchCrtmLineColors(root: HTMLElement | Document = document): Promise<void> {
  await ensureCrtmLineColors();
  paintCrtmLineBadges(root);
}
