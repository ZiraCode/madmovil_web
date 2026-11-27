// Cachés de detalle de paradas favoritas (nombre, dirección, líneas y municipio CRTM):
// el favorito solo guarda stopId/alias/lines, y el detalle se resuelve contra el API y se
// cachea en localStorage para no repetir llamadas (stopnames/stopaddresses son las mismas
// cachés que usa la home; las CRTM van en claves propias: 68 códigos cortos colisionan
// con stopIds EMT, nunca se mezclan). Compartido por /favoritos (esta lista) y la home
// (FavoriteStops), que antes mantenía una copia de las 4 de nombre/dirección.
//
// Las claves y el formato de los valores NO se tocan: los usuarios tienen datos guardados.

import { getStopDetail, searchCrtmStopById } from './api';
import { crtmStopCode, isCrtmStopId } from './favorites';

export const NAMES_KEY = 'madmovil:stopnames';
export const ADDR_KEY = 'madmovil:stopaddresses';
export const LINES_KEY = 'madmovil:stoplines';
export const CRTM_NAMES_KEY = 'madmovil:crtmstopnames';
export const CRTM_ADDR_KEY = 'madmovil:crtmstopaddresses';
export const CRTM_LINES_KEY = 'madmovil:crtmstoplines';
// El municipio desambigua los labels de bus duplicados entre redes ('1' = M1 y urbana):
// sin él, crtmLineColorInStop no puede elegir entre el azul del metro y el rojo urbano
export const CRTM_MUNI_KEY = 'madmovil:crtmstopmunicipalities';

export type StopCacheMap = Record<string, string | string[]>;

export function readCache<T extends StopCacheMap>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as T;
  } catch {
    return {} as T;
  }
}

export function writeCache(key: string, map: StopCacheMap): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* storage lleno o bloqueado: se resuelve sin caché */
  }
}

const nameCache = readCache(NAMES_KEY);
const addrCache = readCache(ADDR_KEY);
const linesCache = readCache(LINES_KEY);
const crtmNameCache = readCache(CRTM_NAMES_KEY);
const crtmAddrCache = readCache(CRTM_ADDR_KEY);
const crtmLinesCache = readCache(CRTM_LINES_KEY);
const crtmMuniCache = readCache(CRTM_MUNI_KEY);

function str(map: StopCacheMap, stopId: string): string | undefined {
  const v = map[stopId];
  return typeof v === 'string' ? v : undefined;
}

export function cachedName(stopId: string): string | undefined {
  return str(isCrtmStopId(stopId) ? crtmNameCache : nameCache, stopId);
}

export function cachedAddress(stopId: string): string | undefined {
  return str(isCrtmStopId(stopId) ? crtmAddrCache : addrCache, stopId);
}

export function cachedLines(stopId: string): string[] {
  const v = (isCrtmStopId(stopId) ? crtmLinesCache : linesCache)[stopId];
  return Array.isArray(v) ? v : [];
}

export function cachedMunicipality(stopId: string): string | null {
  return str(crtmMuniCache, stopId) ?? null;
}

// Completa nombre, dirección y líneas de las paradas que falten en caché. EMT con
// /stops/detail (503 fail-soft: esa card se queda sin dirección/chips, sin romper la
// página); CRTM con /crtm/stops/search (artefactos KV).
export async function resolveDetails(stopIds: string[]): Promise<void> {
  const missingE = [...new Set(stopIds.filter((id) => !isCrtmStopId(id) && (!nameCache[id] || !addrCache[id] || cachedLines(id).length === 0)))];
  const missingC = [
    ...new Set(
      stopIds.filter(
        (id) =>
          isCrtmStopId(id) &&
          // El municipio entra en la condición: caches completas de antes de 2026-11-22
          // (visitas a la ficha) no lo tienen y sin él los labels ambiguos no resuelven
          (!crtmNameCache[id] || !crtmAddrCache[id] || !crtmMuniCache[id] || cachedLines(id).length === 0)
      )
    ),
  ];
  if (missingE.length === 0 && missingC.length === 0) return;
  const [emtResults, crtmResults] = await Promise.all([
    Promise.allSettled(missingE.map((stopId) => getStopDetail(stopId))),
    Promise.allSettled(missingC.map((stopId) => searchCrtmStopById(crtmStopCode(stopId)))),
  ]);
  let changed = false;
  // 503 (EMT caída) u otro error: esa card se queda sin dirección/chips-toggle, sin romper la página
  emtResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      nameCache[missingE[i]] = r.value.name;
      addrCache[missingE[i]] = r.value.postalAddress;
      linesCache[missingE[i]] = [...new Set(r.value.lines.map((l) => l.label))];
      changed = true;
    }
  });
  crtmResults.forEach((r, i) => {
    const stop = r.status === 'fulfilled' ? r.value.stops[0] : undefined;
    if (stop) {
      crtmNameCache[missingC[i]] = stop.name;
      crtmAddrCache[missingC[i]] = stop.address;
      crtmLinesCache[missingC[i]] = [...new Set(stop.lines)];
      if (stop.municipality) crtmMuniCache[missingC[i]] = stop.municipality;
      changed = true;
    }
  });
  if (changed) {
    writeCache(NAMES_KEY, nameCache);
    writeCache(ADDR_KEY, addrCache);
    writeCache(LINES_KEY, linesCache);
    writeCache(CRTM_NAMES_KEY, crtmNameCache);
    writeCache(CRTM_ADDR_KEY, crtmAddrCache);
    writeCache(CRTM_LINES_KEY, crtmLinesCache);
    writeCache(CRTM_MUNI_KEY, crtmMuniCache);
  }
}
