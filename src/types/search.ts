// Contrato de GET /search (búsqueda unificada de líneas y paradas de todas las redes,
// commit d0afaa2 de madmovil_server — sección "Búsqueda unificada" de su AGENTS.md).
// El ranking lo hace el server (línea exacta > prefijo > nombre; código > nombre >
// dirección > municipio): el cliente solo pinta en el orden que llega.

import type { CrtmLineColors, CrtmNetwork } from './crtm';

export type SearchSource = 'emt' | 'crtm';
/** 'emt' solo en resultados de línea; las paradas lo llevan en networks[] */
export type SearchNetwork = 'emt' | CrtmNetwork;

export interface SearchLineResult extends CrtmLineColors {
  type: 'line';
  source: SearchSource;
  network: SearchNetwork;
  label: string;
  /** lineId EMT (source emt) o routeId CRTM (source crtm) — ids DUPLICADOS entre redes */
  id: string;
  name: string;
  /** Red en modo catálogo (feed caducado): pinta el aviso "sin horarios oficiales" */
  noSchedule?: boolean;
  match: string;
}

export interface SearchStopResult {
  type: 'stop';
  source: SearchSource;
  /** stopId EMT o código CRTM (r_* = estación de Cercanías) */
  id: string;
  name: string;
  municipality: string | null;
  /** labels para mini-chips */
  lines: string[];
  networks: SearchNetwork[];
  match: string;
}

export interface SearchResultsGroup<T> {
  /** total pre-límite */
  count: number;
  returned: number;
  results: T[];
}

export interface SearchResponse {
  query: string;
  lines: SearchResultsGroup<SearchLineResult>;
  stops: SearchResultsGroup<SearchStopResult>;
  /** Familia de datos que falló en el server: la búsqueda degrada, no aborta */
  degraded?: SearchSource[];
}
