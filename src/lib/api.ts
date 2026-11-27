import type { ApiResponse, BusArrival, CatalogData, Line, LineIncidents, LineRoute, LineTimetable, Stop, StopDetail } from '../types/api';
import type { CrtmDaySchedule, CrtmLineDetailDoc, CrtmLineDocsResponse, CrtmLineIncidents, CrtmLineRouteDoc, CrtmLinesResponse, CrtmStopArrivals, CrtmStopSearchResponse, CrtmTimetableDoc } from '../types/crtm';
import type { ConnectionsData } from '../types/connections';
import type { SearchResponse } from '../types/search';
import { API_BASE_URL } from './config';
import { ssrApiKey } from './ssr-key';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Clasificación de un fallo del API para las fichas SSR: estado de respuesta y banderas de
// UI. `down` (503, servicio degradado) solo lo distinguen las fichas de parada; las de
// línea tratan el 503 como 502 en su call-site (ignoran `down`)
export interface ApiFailure {
  notFound: boolean;
  down: boolean;
  status: 404 | 503 | 502;
}

export function mapApiError(err: unknown): ApiFailure {
  if (err instanceof ApiError && err.status === 404) return { notFound: true, down: false, status: 404 };
  if (err instanceof ApiError && err.status === 503) return { notFound: false, down: true, status: 503 };
  return { notFound: false, down: false, status: 502 };
}

// W1 (auditoría de CPU 2026-11-24): caché de las respuestas del API para el fetch SSR.
// El fetch() de un Worker NO consulta la caché CDN del edge, así que cada render
// re-invocaba al server (ratio medido: 4,3 llamadas por ficha, ninguna servida de caché,
// ni siquiera /crtm/lines con s-maxage 3600). caches.default con URL sintética en un
// origen interno: espacio de claves propio (sin colisionar con las entradas del edge de
// api.madmovil.es) y a prueba del `cache-control: no-cache` que mandan crawlers como
// ExaSearchBot (el match se hace con un GET limpio, nunca con los headers del visitante).
// El TTL sale del Cache-Control de la respuesta del API (s-maxage > max-age), la misma
// fuente de verdad que el server ya define por familia. Solo SSR (sin window) + GET sin
// signal; no-store/private (arrivals, vault) queda fuera por diseño y las respuestas de
// error nunca se guardan. Fail-open total: cualquier problema con la caché = fetch directo.
const SSR_CACHE_ORIGIN = 'https://ssr-cache.madmovil.internal';

function ssrCache(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    return null;
  }
}

function ssrCacheTtlSec(response: Response): number | null {
  const cc = response.headers.get('cache-control');
  if (!cc) return null;
  const tokens = cc.split(',').map((token) => token.trim().toLowerCase());
  if (tokens.includes('no-store') || tokens.includes('private')) return null;
  const pick = (prefix: string): number | null => {
    const token = tokens.find((t) => t.startsWith(prefix));
    if (!token) return null;
    const secs = Number(token.slice(prefix.length));
    return Number.isFinite(secs) && secs > 0 ? secs : null;
  };
  return pick('s-maxage=') ?? pick('max-age=');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // GET y sin signal (el buscador aborta búsquedas): solo esos se cachean
  const canCache = (init?.method ?? 'GET') === 'GET' && !init?.signal && typeof window === 'undefined';
  const cache = canCache ? ssrCache() : null;
  const cacheUrl = `${SSR_CACHE_ORIGIN}${path}`;

  if (cache) {
    try {
      const hit = await cache.match(cacheUrl);
      if (hit) {
        // Una entrada expirada no sale del match (su TTL lo marca el Cache-Control con
        // el que se guardó). El error cacheado no existe (solo se guardan 2xx sin error),
        // pero por si acaso: miss y a refetchar
        const cached = (await hit.json()) as ApiResponse<T>;
        if (cached.status !== 'error') return cached.data as T;
      }
    } catch {
      /* fail-open: fetch directo */
    }
  }

  const headers = new Headers(init?.headers);
  if (typeof window === 'undefined') {
    headers.set('user-agent', 'madmovil-web-ssr/1.0 (+https://madmovil.es)');
    // Fase 11A: bypass del rate limit del API para nuestro propio SSR (W1 del server,
    // comparación timing-safe de X-SSR-Key). Solo fetch server-side y solo con secret
    // presente (fail-closed: sin él, rate limit normal). NUNCA loguear el header.
    const key = ssrApiKey();
    if (key) headers.set('X-SSR-Key', key);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    // Los aborts del buscador (AbortController) no son errores de red: se propagan tal cual
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(response.status, `Respuesta inválida del servidor (${response.status})`);
  }

  if (!response.ok || body.status === 'error') {
    throw new ApiError(
      response.status,
      body.message ?? `Error del servidor (${response.status})`,
      response.status === 429 ? Number(response.headers.get('Retry-After') ?? 30) : undefined
    );
  }

  if (cache && body) {
    const ttl = ssrCacheTtlSec(response);
    if (ttl !== null) {
      try {
        await cache.put(
          cacheUrl,
          new Response(JSON.stringify(body), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': `public, max-age=${ttl}`,
            },
          }),
        );
      } catch {
        /* fail-open: la próxima petición vuelve a fetchear */
      }
    }
  }

  return body.data as T;
}

// Búsqueda unificada de líneas Y paradas de todas las redes (ranking en el server).
// Rate limit 60 req/min por IP en grupo propio → siempre con debounce en el cliente
export function unifiedSearch(q: string, opts?: { lines?: number; stops?: number; signal?: AbortSignal }): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (opts?.lines !== undefined) params.set('lines', String(opts.lines));
  if (opts?.stops !== undefined) params.set('stops', String(opts.stops));
  return request(`/search?${params}`, opts?.signal ? { signal: opts.signal } : undefined);
}

export function searchStopById(stopId: string): Promise<{ count: number; stops: Stop[] }> {
  return request(`/stops/search?stopId=${encodeURIComponent(stopId)}`);
}

// Líneas de transbordo de una parada (/connections/:source/:stopId): líneas de otras
// paradas físicas en un radio a pie, agrupadas por red. source desambigua códigos que
// existen en ambas familias (mismo criterio que /search)
export function getConnections(source: 'emt' | 'crtm', stopId: string): Promise<ConnectionsData> {
  return request(`/connections/${source}/${encodeURIComponent(stopId)}`);
}

export function getStopDetail(stopId: string): Promise<StopDetail> {
  return request(`/stops/detail/${encodeURIComponent(stopId)}`);
}

export function getArrivals(stopId: string, line?: string): Promise<{ stopId: string; line: string | null; count: number; arrivals: BusArrival[] }> {
  const query = line ? `?line=${encodeURIComponent(line)}` : '';
  return request(`/stops/arrivals/${encodeURIComponent(stopId)}${query}`);
}

export function getLines(): Promise<{ count: number; lines: Line[] }> {
  return request('/lines');
}

export function searchLinesByLabel(label: string): Promise<{ count: number; lines: Line[] }> {
  return request(`/lines/search?label=${encodeURIComponent(label)}`);
}

export function getLineTimetable(lineId: string): Promise<LineTimetable> {
  return request(`/lines/timetable/${encodeURIComponent(lineId)}`);
}

export function getLineRoute(label: string): Promise<LineRoute> {
  return request(`/lines/route/${encodeURIComponent(label)}`);
}

export function getLineIncidents(label: string): Promise<LineIncidents> {
  return request(`/lines/incidents/${encodeURIComponent(label)}`);
}

export function lineColor(line: Line | { color?: string }): string {
  return line.color ? `#${line.color}` : '#0072ce';
}

export function getCrtmLines(): Promise<CrtmLinesResponse> {
  return request('/crtm/lines');
}

export function searchCrtmStopById(stopId: string): Promise<CrtmStopSearchResponse> {
  return request(`/crtm/stops/search?stopId=${encodeURIComponent(stopId)}`);
}

// Tablón teórico del día COMPLETO (modo date del schedule): horizonte [hoy, hoy+14] en
// hora de Madrid, festivos por calendario GTFS; line= filtra por label. Cache-Control
// público 300/3600 → se puede pedir al tocar el toggle sin miedo al rate limit
export function getCrtmDaySchedule(stopCode: string, date: string, line?: string): Promise<CrtmDaySchedule> {
  const params = new URLSearchParams({ date });
  if (line) params.set('line', line);
  return request(`/crtm/stops/schedule/${encodeURIComponent(stopCode)}?${params.toString()}`);
}

// Tablón de llegadas RT de TODAS las paradas CRTM (/crtm/stops/arrivals): estaciones r_*
// con overlay GTFS-RT de Renfe; bus/ML/metro con el SAE del widget oficial del CRTM
// (degradado 200 a tablón teórico con realtime.available false — no es error)
export function getCrtmArrivals(stopCode: string, windowMin?: number, line?: string): Promise<CrtmStopArrivals> {
  const params = new URLSearchParams();
  if (windowMin !== undefined) params.set('window', String(windowMin));
  if (line) params.set('line', line);
  const query = params.toString();
  return request(`/crtm/stops/arrivals/${encodeURIComponent(stopCode)}${query ? `?${query}` : ''}`);
}

export function getCrtmLineDetail(id: string): Promise<CrtmLineDocsResponse<CrtmLineDetailDoc>> {
  return request(`/crtm/lines/detail/${encodeURIComponent(id)}`);
}

export function getCrtmLineTimetable(id: string): Promise<CrtmLineDocsResponse<CrtmTimetableDoc>> {
  return request(`/crtm/lines/timetable/${encodeURIComponent(id)}`);
}

// routeId EXACTO (los labels no se resuelven: duplicados entre redes)
export function getCrtmLineRoute(routeId: string): Promise<CrtmLineRouteDoc> {
  return request(`/crtm/lines/route/${encodeURIComponent(routeId)}`);
}

// Incidencias de Cercanías del widget oficial del CRTM: routeId EXACTO (igual que route).
// Solo se consulta para network cercanias (el feed no publica el resto de redes); en la
// ficha es fail-soft total — 503 del widget o cualquier error ocultan la sección
export function getCrtmLineIncidents(routeId: string): Promise<CrtmLineIncidents> {
  return request(`/crtm/lines/incidents/${encodeURIComponent(routeId)}`);
}

// Catálogo de URLs indexables (labels EMT + pares label/routeId CRTM + códigos de parada
// de ambas familias): alimenta los sitemaps dinámicos (src/lib/sitemap.ts)
export function getCatalog(): Promise<CatalogData> {
  return request('/catalog');
}
