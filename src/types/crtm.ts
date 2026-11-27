export type CrtmNetwork = 'interurban' | 'urban' | 'ml' | 'metro' | 'cercanias';

// "Modo catálogo" (feed de Metro caducado en el CRTM): la línea, sus estaciones y su
// geometría se sirven, pero SIN horarios. Campos opcionales: si no vienen, todo funciona
// como siempre (cuando el CRTM republique el feed desaparecen solos del API).
export interface CrtmNoSchedule {
  calendarEnd: string; // 'YYYYMMDD'
  feedVersions: string[];
}

// Color de línea OPCIONAL (RRGGBB sin '#'): solo metro ligero lo publica; bus usa la paleta de red
export interface CrtmLineColors {
  color?: string;
  textColor?: string;
}

export interface CrtmLineSummary extends CrtmLineColors {
  label: string;
  routeId: string;
  name: string;
  network: CrtmNetwork;
  municipality: string;
  url: string;
  noSchedule?: boolean;
}

export interface CrtmStop {
  code: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  zone: string;
  // El pipeline del server no resuelve el municipio en todas las paradas (muniCoverage
  // ~0.98: la mitad de las estaciones de metro llegan a null) — SIEMPRE tolerar null
  municipality: string | null;
  lines: string[];
}

export interface CrtmNearbyStop extends CrtmStop {
  distanceM: number;
}

export interface CrtmDeparture {
  line: string;
  routeId: string;
  network: CrtmNetwork;
  headsign: string;
  dir: number;
  departureISO: string;
  dayOffset: 0 | 1;
  time: string;
}

export interface CrtmStopSchedule {
  stopCode: string;
  stop: {
    code: string;
    name: string;
    municipality: string | null;
    zone: string;
  };
  date: string;
  windowMin: number;
  count: number;
  departures: CrtmDeparture[];
  // Solo en estaciones de metro sin horarios (distinto de "sin salidas en la ventana")
  noScheduleData?: {
    networks: string[];
    calendarEnd: string;
    feedVersions: string[];
  };
}

// Modo fecha del schedule (/crtm/stops/schedule/:stopCode?date=YYYY-MM-DD): tablón teórico
// del día COMPLETO ordenado por hora efectiva. Horizonte [hoy, hoy+14] en hora de Madrid
// (festivos resueltos por el calendario GTFS). dayOffset es SIEMPRE 0 (la madrugada
// 00:00–06:00 llega del servicio del día anterior como hora de reloj real: no se calcula
// nada). NO trae windowMin (eso es el modo ventana). Techo: 1000 salidas por consulta →
// si count llega a 1000 avisar y filtrar por línea (&line=).
export interface CrtmDaySchedule {
  stopCode: string;
  stop: CrtmStopSchedule['stop'];
  date: string;
  count: number;
  departures: CrtmDeparture[];
  // Alguna salida usa la última generación conocida de un feed caducado/truncado →
  // avisar "horario teórico posiblemente obsoleto"
  calendarFallback?: boolean;
  noScheduleData?: CrtmStopSchedule['noScheduleData'];
}

export interface CrtmStopRef {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export interface CrtmDirectionDetail {
  id: number;
  headsign: string;
  stops: CrtmStopRef[];
}

export interface CrtmServiceSummary {
  id: string;
  days: number[] | string;
  from: string;
  to: string;
  exceptions: Record<string, number> | string;
}

export interface CrtmLineDetailDoc extends CrtmLineColors {
  label: string;
  routeId: string;
  name: string;
  network: CrtmNetwork;
  municipality: string;
  url: string;
  tripCount: number;
  directions: CrtmDirectionDetail[];
  services: CrtmServiceSummary[];
  noSchedule?: CrtmNoSchedule;
}

export interface CrtmTimetableService extends CrtmServiceSummary {
  serviceIndex: number;
  first: string;
  last: string;
  trips: number;
}

export interface CrtmDirectionTimetable {
  id: number;
  headsign: string;
  first: string;
  last: string;
  trips: number;
  services: CrtmTimetableService[];
}

export interface CrtmTimetableDoc {
  label: string;
  routeId: string;
  name: string;
  network: CrtmNetwork;
  municipality: string;
  directions: CrtmDirectionTimetable[];
  noSchedule?: CrtmNoSchedule;
}

export interface CrtmLinesResponse {
  count: number;
  lines: CrtmLineSummary[];
}

export interface CrtmStopSearchResponse {
  count: number;
  returned: number;
  stops: CrtmStop[];
}

export interface CrtmNearbyResponse {
  count: number;
  stops: CrtmNearbyStop[];
}

export interface CrtmLineDocsResponse<TDoc extends CrtmLineDetailDoc | CrtmTimetableDoc> {
  query: string;
  count: number;
  lines: TDoc[];
}

// Recorrido geométrico (/crtm/lines/route/:routeId): SIN paradas (detail ya las da).
// geometry es un MultiLineString con un tramo por hueco real del shape (>500 m);
// bounds es [W, S, E, N] para L.latLngBounds([[S, W], [N, E]]).
export interface CrtmDirectionRoute {
  id: number;
  headsign: string;
  shapeId: string;
  distanceM: number;
  pointCount: number;
  geometry: {
    type: 'MultiLineString';
    coordinates: [number, number][][];
  };
}

export interface CrtmLineRouteDoc extends CrtmLineColors {
  routeId: string;
  label: string;
  name: string;
  network: CrtmNetwork;
  municipality: string;
  toleranceM: number;
  bounds: [number, number, number, number];
  directions: CrtmDirectionRoute[];
}

// Incidencias de Cercanías (/crtm/lines/incidents/:routeId): el feed del widget oficial
// del CRTM SOLO publica la red cercanías (el resto de redes no se consultan). routeId del
// incidente null si la línea no está en los artefactos; stopCode null si la estación no
// resuelve a nuestro código r_* (se muestra solo el nombre, sin enlace). type: único
// valor conocido hoy 'AFF' (afectación).
export interface CrtmLineIncident {
  label: string;
  routeId: string | null;
  type: string;
  description: string;
  affectedStops: { name: string; stopCode: string | null }[];
}

export interface CrtmLineIncidents {
  query: string;
  label: string;
  routeId: string;
  network: CrtmNetwork;
  count: number;
  incidents: CrtmLineIncident[];
  attribution: string;
}

// Tablón RT de Cercanías y del widget del CRTM (/crtm/stops/arrivals/:stopCode, TODAS las
// paradas CRTM). En r_*: tablón teórico + overlay del GTFS-RT oficial de Renfe unido por
// tripId exacto — retrasos, cancelaciones, andén (vía), posición y número de tren,
// accesibilidad; los refuerzos (added) se inyectan desde el RT sin horario: dest/
// scheduledISO/time/dayOffset/dir llegan a null y solo estimatedISO/arrivesInMin van
// rellenos. En el resto de redes (bus interurbano/urbano, ML, metro): estimaciones del SAE
// vía el widget oficial del CRTM — network/lineName/vehicle por item, sin delay/plataforma
// (realtime POR ITEM = SAE de su línea: false = hora teórica). Los intercambiadores modo 10
// MEZCLAN redes (Pinar 10_1 sirve ML1 + L1 + L4): distinguir SIEMPRE por item.network, los
// labels están duplicados entre redes. Sin feed RT el server degrada a tablón teórico con
// realtime.available: false (no es error; scheduledISO = estimatedISO, dayOffset puede ser 1).
export interface CrtmArrivalItem {
  line: string | null;
  routeId: string | null;
  // Solo flujo widget (no r_*): red del item (en degradado siempre presente)
  network?: CrtmNetwork;
  lineName?: string | null;
  dest: string | null;
  dir: number | null;
  scheduledISO: string | null;
  estimatedISO: string;
  arrivesInMin: number | null;
  dayOffset: 0 | 1 | null;
  time: string | null;
  realtime: boolean;
  // Código de vehículo del SAE (flujos no r_*; puede no llegar)
  vehicle?: string;
  tripId?: string;
  canceled?: boolean;
  delaySec?: number;
  platform?: string;
  accessible?: boolean;
  trainId?: string;
  trainStatus?: string;
  trainPosition?: { latitude: number; longitude: number };
  stale?: boolean;
  added?: boolean;
}

export interface CrtmStopArrivals {
  stopCode: string;
  stop: {
    code: string;
    name: string;
    municipality: string | null;
    zone: string | null;
  };
  date: string;
  windowMin: number;
  count: number;
  departures: CrtmArrivalItem[];
  realtime: {
    available: boolean;
    // 'crtm-widget' en paradas no r_* (SAE del widget oficial); ausente en Cercanías
    source?: 'crtm-widget';
    feedTimestamp?: string;
  };
  attribution: string;
  noScheduleData?: CrtmStopSchedule['noScheduleData'];
}

export interface CrtmStatus {
  generatedAt: string;
  versions: Partial<Record<CrtmNetwork, {
    itemModified: number;
    zipBytes: number;
    feedVersions: string | string[];
    catalogOnly?: string;
  }>>;
  counts: {
    stopsKept: number;
    routes: Partial<Record<CrtmNetwork, number>>;
    lineDocs: Partial<Record<CrtmNetwork, number>>;
    trips: number;
    [key: string]: unknown;
  };
  shapes?: {
    bucket: string;
    count: number;
    totalBytes: number;
    maxBytes: number;
    maxRouteId: string;
  };
  attribution: string;
}
