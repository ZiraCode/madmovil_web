// Presentación de tiempos de salida CRTM (Fase 8A: antes había 3 copias de la normalización
// HH:MM ≥24:00 —crtm.ts, el viejo DeparturesBoard, FavoriteStops— y 3 del rótulo "en N
// min"/"ha salido"/"ahora"/"madrugada"). Locale-aware desde el día 1: el texto viaja por t().
import { t, type Locale } from './i18n';

/** "24:15" → "00:15" (GTFS acumula la madrugada del mismo servicio). Passthrough si no casa */
export function normalizeGtfsTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return time;
  const h = Number(match[1]);
  if (h < 24) return `${String(h).padStart(2, '0')}:${match[2]}`;
  return `${String(h - 24).padStart(2, '0')}:${match[2]}`;
}

/** HH:MM GTFS legible: normaliza ≥24:00 y marca la madrugada ("24:15" → "00:15 (madrugada)") */
export function gtfsTimeLabel(locale: Locale, gtfs: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(gtfs.trim());
  if (!match) return gtfs;
  const h = Number(match[1]);
  if (h < 24) return `${String(h).padStart(2, '0')}:${match[2]}`;
  return `${normalizeGtfsTime(gtfs)} ${t(locale, 'time.gtfsEarlyMorningSuffix')}`;
}

/**
 * Rótulo secundario de una salida programada: "en N min" / "ahora" / "ha salido". Con
 * dayOffset=1 (madrugada de mañana, servicio de HOY) el tiempo aún no es comparable y se
 * etiqueta como madrugada — la recalculación periódica de los boards SALTa esas filas.
 */
export function departureEtaLabel(locale: Locale, iso: string, dayOffset?: 0 | 1): string {
  if (dayOffset === 1) return t(locale, 'time.earlyMorning');
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (min < 0) return t(locale, 'eta.departed');
  if (min === 0) return t(locale, 'eta.now');
  return t(locale, 'eta.inMin', { min });
}

/** HH:MM de un ISO en hora de Madrid (los tablones van en la hora del servicio) */
export function isoTimeLabel(locale: Locale, iso: string): string {
  return new Date(iso).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid',
  });
}
