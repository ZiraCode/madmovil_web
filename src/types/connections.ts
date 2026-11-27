// Contrato de GET /connections/:source/:stopId (2026-10-12, madmovil_server): líneas de
// transbordo de una parada = líneas de OTRAS paradas físicas en un radio a pie, agrupadas
// por red. :source desambigua códigos numéricos que existen en ambas familias (mismo
// criterio que /search). Las líneas de la PROPIA parada no aparecen (la ficha ya las
// muestra): no hay que filtrar nada client-side.

import type { CrtmLineColors, CrtmNetwork } from './crtm';
import type { SearchSource } from './search';

/** Mismo vocabulario que los resultados de /search */
export type ConnectionsNetwork = 'emt' | CrtmNetwork;

export interface ConnectionsLine extends CrtmLineColors {
  source: SearchSource;
  network: ConnectionsNetwork;
  label: string;
  /** lineId EMT o routeId CRTM; null = sin enlace posible (el chip se pinta igual) */
  id: string | null;
  name: string | null;
  noSchedule?: boolean;
}

export interface ConnectionsGroup {
  network: ConnectionsNetwork;
  /** distancia a la parada más cercana de esa red (grupos ordenados por esto, asc) */
  distanceM: number;
  /** en orden natural de label */
  lines: ConnectionsLine[];
}

export interface ConnectionsNearbyStop {
  source: SearchSource;
  id: string;
  name: string;
  municipality: string | null;
  distanceM: number;
  networks: ConnectionsNetwork[];
  lines: string[];
}

export interface ConnectionsData {
  query: { source: SearchSource; stopId: string; name: string | null; networks: ConnectionsNetwork[] };
  radiusM: number;
  /** desglose físico opcional (no se pinta en v1) */
  stops?: ConnectionsNearbyStop[] | null;
  transfers: {
    /** total de líneas de transbordo; 0 = sección oculta (parada aislada, no error) */
    count: number;
    groups: ConnectionsGroup[];
  };
  /** familia de artefactos caída en el server: respuesta parcial, no error */
  degraded?: SearchSource[];
}
