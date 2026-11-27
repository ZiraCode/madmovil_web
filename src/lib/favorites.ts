import { clientLocale, t } from './i18n';

export interface LocalFavorite {
  stopId: string;
  name: string;
  alias: string | null;
  lines: string[];
  savedAt: string;
}

export type FavoriteItem = LocalFavorite;

/** Documento local versionado: la MISMA forma que el export, sin exportedAt */
interface FavoritesDoc {
  version: number;
  favorites: LocalFavorite[];
}

/** Formato de export/import por archivo, QR, enlace y vault cifrado (F2) */
export interface FavoritesExport {
  version: number;
  exportedAt: string;
  favorites: LocalFavorite[];
}

const LOCAL_KEY = 'madmovil:favorites';
export const FAVORITES_FORMAT_VERSION = 1;
export const MAX_LINES_PER_STOP = 20;

// Favoritos mixtos EMT/CRTM: el stopId CRTM lleva prefijo "crtm:" (68 códigos cortos
// colisionan con stopIds EMT).
export function isCrtmStopId(stopId: string): boolean {
  return stopId.startsWith('crtm:');
}

export function crtmStopCode(stopId: string): string {
  return stopId.slice('crtm:'.length);
}

export function stopUrl(stopId: string): string {
  return isCrtmStopId(stopId) ? `/parada/crtm/${encodeURIComponent(crtmStopCode(stopId))}` : `/parada/${encodeURIComponent(stopId)}`;
}

// Imports sin savedAt (fichero/QR/enlace/vault editados a mano): centinela 1970 para que
// NUNCA ganen el merge por fecha contra un favorito local real; la lectura de
// localStorage conserva su default de "ahora"
const IMPORT_MISSING_SAVED_AT = new Date(0).toISOString();

function normalizeFavorite(raw: Partial<LocalFavorite>, missingSavedAt: string = new Date().toISOString()): LocalFavorite | null {
  if (typeof raw.stopId !== 'string' || !raw.stopId.trim()) return null;
  const lines = Array.isArray(raw.lines)
    ? [...new Set(raw.lines.filter((l): l is string => typeof l === 'string' && l.length > 0))].slice(0, MAX_LINES_PER_STOP)
    : [];
  return {
    stopId: raw.stopId,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : raw.stopId,
    alias: typeof raw.alias === 'string' && raw.alias.length > 0 ? raw.alias : null,
    lines,
    savedAt: typeof raw.savedAt === 'string' && !Number.isNaN(Date.parse(raw.savedAt)) ? raw.savedAt : missingSavedAt,
  };
}

// Acepta el doc versionado { version, favorites } y el array pelado legado (< F1)
function favoritesFromDoc(parsed: unknown, missingSavedAt?: string): LocalFavorite[] {
  const list: unknown = Array.isArray(parsed) ? parsed : (parsed as Partial<FavoritesDoc> | null)?.favorites;
  if (!Array.isArray(list)) return [];
  return list
    .map((f) => normalizeFavorite(f as Partial<LocalFavorite>, missingSavedAt))
    .filter((f): f is LocalFavorite => f !== null);
}

export function getLocalFavorites(): LocalFavorite[] {
  try {
    return favoritesFromDoc(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'));
  } catch {
    return [];
  }
}

function setLocalFavorites(favorites: LocalFavorite[]): void {
  const doc: FavoritesDoc = { version: FAVORITES_FORMAT_VERSION, favorites };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
  } catch {
    throw new Error(t(clientLocale(), 'fav.saveError'));
  }
  window.dispatchEvent(new CustomEvent('favorites:changed', { detail: { count: favorites.length } }));
}

export async function getFavorites(): Promise<LocalFavorite[]> {
  return getLocalFavorites();
}

export async function getFavorite(stopId: string): Promise<LocalFavorite | null> {
  return getLocalFavorites().find((f) => f.stopId === stopId) ?? null;
}

// Los arrivals pueden traer la línea con sufijo de sentido ("150/1"); el favorito guarda el label canónico ("150")
export function matchesFavoriteLine(arrivalLine: string, label: string): boolean {
  return arrivalLine === label || arrivalLine.startsWith(`${label}/`);
}

export async function addFavorite(stop: { stopId: string; name: string; alias?: string | null; lines?: string[] }): Promise<void> {
  const locals = getLocalFavorites();
  if (!locals.some((f) => f.stopId === stop.stopId)) {
    locals.unshift({ stopId: stop.stopId, name: stop.name, alias: stop.alias ?? null, lines: stop.lines ?? [], savedAt: new Date().toISOString() });
    setLocalFavorites(locals);
  }
}

// PATCH: reemplaza alias y/o el CONJUNTO COMPLETO de lines (no incremental)
export async function updateFavorite(stopId: string, patch: { alias?: string | null; lines?: string[] }): Promise<void> {
  const locals = getLocalFavorites();
  const fav = locals.find((f) => f.stopId === stopId);
  if (!fav) {
    throw new Error(t(clientLocale(), 'fav.notFoundError'));
  }
  if (patch.alias !== undefined) fav.alias = patch.alias;
  if (patch.lines !== undefined) fav.lines = [...new Set(patch.lines)].slice(0, MAX_LINES_PER_STOP);
  setLocalFavorites(locals);
}

export async function removeFavorite(stopId: string): Promise<void> {
  setLocalFavorites(getLocalFavorites().filter((f) => f.stopId !== stopId));
}

// —— Export / import (F1) ————————————————————————————————————————————————————

export function exportFavorites(): FavoritesExport {
  return { version: FAVORITES_FORMAT_VERSION, exportedAt: new Date().toISOString(), favorites: getLocalFavorites() };
}

export function exportFavoritesJson(): string {
  return JSON.stringify(exportFavorites());
}

/** Valida una copia (archivo, QR, enlace o vault) y devuelve los favoritos que contiene.
 *  allowEmpty: el vault remoto puede contener legítimamente una lista vacía. */
export function parseFavoritesDoc(raw: string, opts: { allowEmpty?: boolean } = {}): LocalFavorite[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(t(clientLocale(), 'backup.invalid'));
  }
  const version = Array.isArray(parsed) ? 1 : (parsed as Partial<FavoritesExport> | null)?.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > FAVORITES_FORMAT_VERSION) {
    throw new Error(t(clientLocale(), 'backup.unsupportedVersion', { version: String(version) }));
  }
  const favorites = favoritesFromDoc(parsed, IMPORT_MISSING_SAVED_AT);
  if (favorites.length === 0 && !opts.allowEmpty) {
    throw new Error(t(clientLocale(), 'backup.invalid'));
  }
  return favorites;
}

export function parseImportedFavorites(raw: string): LocalFavorite[] {
  return parseFavoritesDoc(raw);
}

export interface ImportPlan {
  added: LocalFavorite[];
  replaced: LocalFavorite[];
  unchanged: LocalFavorite[];
}

/** Merge por stopId: gana el savedAt más reciente (la copia existente gana los empates) */
export function planImport(incoming: LocalFavorite[]): ImportPlan {
  const deduped = new Map<string, LocalFavorite>();
  for (const f of incoming) {
    const prev = deduped.get(f.stopId);
    if (!prev || Date.parse(f.savedAt) > Date.parse(prev.savedAt)) deduped.set(f.stopId, f);
  }
  const plan: ImportPlan = { added: [], replaced: [], unchanged: [] };
  const existing = new Map(getLocalFavorites().map((f) => [f.stopId, f]));
  for (const f of deduped.values()) {
    const current = existing.get(f.stopId);
    if (!current) plan.added.push(f);
    else if (Date.parse(f.savedAt) > Date.parse(current.savedAt)) plan.replaced.push(f);
    else plan.unchanged.push(current);
  }
  return plan;
}

/** Aplica un plan ya confirmado: sustituye en su sitio y antepone las nuevas */
export function applyImport(plan: ImportPlan): void {
  const merged = getLocalFavorites().map((f) => plan.replaced.find((r) => r.stopId === f.stopId) ?? f);
  setLocalFavorites([...plan.added, ...merged]);
}

/** Igualdad de contenido entre dos listas de favoritos (local vs vault remoto descifrado),
 *  independiente del orden de la lista y de exportedAt. Estricta ante la duda devuelve
 *  false — subir de más es seguro, no subir de menos no lo es. */
export function sameFavorites(a: LocalFavorite[], b: LocalFavorite[]): boolean {
  if (a.length !== b.length) return false;
  // JSON.stringify de la tupla evita colisiones de separadores que un join sufriría
  const keyOf = (f: LocalFavorite): string => JSON.stringify([f.stopId, f.name, f.alias, f.lines, f.savedAt]);
  const ka = a.map(keyOf).sort();
  const kb = b.map(keyOf).sort();
  return ka.every((k, i) => k === kb[i]);
}
