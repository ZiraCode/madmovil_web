export interface ApiResponse<T> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  timestamp: string;
}

export interface Stop {
  stopId: string;
  name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  lines: string[];
}

export interface NearbyStop extends Stop {
  distanceM: number;
}

export interface BusArrival {
  line: string;
  destination: string;
  estimateArriveSec: number;
  arrivesInMin: number | null;
  distanceM: number;
  busId: number | null;
  busPosition: { latitude: number; longitude: number } | null;
}

export interface Line {
  lineId: string;
  label: string;
  nameA: string;
  nameB: string;
  group?: string;
  color?: string;
}

export interface StopLineInfo {
  line: string;
  label: string;
  direction: string;
  maxFreq: string;
  minFreq: string;
  headerA: string;
  headerB: string;
  startTime: string;
  stopTime: string;
  dayType: string;
}

export interface StopDetail {
  stopId: string;
  name: string;
  postalAddress: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  pmv: string;
  lines: StopLineInfo[];
}

export interface DirectionInfo {
  StartTime: string;
  StopTime: string;
  MinimunFrequency: string;
  MaximumFrequency: string;
  FrequencyText: string;
}

export interface LineTimetable {
  lineId: string;
  dayTypes: string[];
  schedules: {
    laboral?: DirectionInfo[];
    sabado?: DirectionInfo[];
    festivo?: DirectionInfo[];
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

export interface LineRoute {
  label: string;
  lineId: string;
  nameA: string;
  nameB: string;
  itinerary: {
    toA: GeoJSONFeatureCollection;
    toB: GeoJSONFeatureCollection;
  };
  stops: {
    toA: GeoJSONFeatureCollection;
    toB: GeoJSONFeatureCollection;
  };
}

export interface LineIncident {
  id: string;
  title: string;
  description: string;
  lines: string[];
  cause: string | null;
  effect: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  documentUrl: string | null;
}

export interface LineIncidents {
  label: string;
  count: number;
  lastBuildDate: string;
  incidents: LineIncident[];
}

export interface Favorite {
  id: string;
  stopId: string;
  alias: string | null;
  lines: string[];
  createdAt: string;
}

export interface CatalogCrtmLineRef {
  label: string;
  routeId: string;
}

// Contrato de GET /catalog: identificadores de las fichas indexables (los sitemaps
// dinámicos se generan a partir de aquí). crtm.generatedAt = fecha del pipeline; la web
// NO la consume desde W4 (auditoría CPU 2026-11-27: como lastmod diario era un falso
// signal de "cambiado" que disparaba el recrawl del catálogo entero), pero viaja en la
// respuesta y el campo queda como espejo del contrato del server
export interface CatalogData {
  emt: { lines: string[]; stops: string[] };
  crtm: { lines: CatalogCrtmLineRef[]; stops: string[]; generatedAt: string | null };
  degraded?: Array<'emt' | 'crtm'>;
}
