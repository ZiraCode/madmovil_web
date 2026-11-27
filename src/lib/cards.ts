// Piezas compartidas de las cards de parada (usadas desde SSR y desde scripts client-side):
// - stopHeaderHtml(): cabecera nombre + "Parada X" + dirección. "Parada X" comparte la línea
//   baseline del nombre y baja sola a la línea siguiente si no cabe (flex-wrap): nunca se corta.
// - ETA_ROW / ETA_ROW_GROUP: filas con dato a la derecha (arrivals, frecuencias). El bloque
//   izquierdo lleva basis-full → en pantallas < sm el dato derecho baja SIEMPRE a línea propia
//   (alineado a la derecha con ml-auto); en sm+ toda la fila es una sola línea.
// - stopRefLabel / viewStopLinkHtml: popups de mapa de parada (EMT y CRTM). Antes de la Fase
//   8 había 4 copias de "Parada X" + "Ver buses/salidas"; ahora traducen y anteponen el
//   prefijo /en del locale en los enlaces.

import { href, t, type Locale } from './i18n';

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "Parada 62" / "Stop 62" — referencia corta a una parada en popups y etiquetas */
export function stopRefLabel(locale: Locale, id: string | number): string {
  return t(locale, 'stop.ref', { id });
}

/**
 * Enlace "Ver buses" (EMT) o "Ver salidas" (CRTM) de un popup de mapa: HTML completo, con el
 * href ya prefijado por locale. `code`/`stopId` se escapan y encodean como segmento de URL.
 */
export function viewStopLinkHtml(locale: Locale, kind: 'emt' | 'crtm', id: string | number): string {
  const path = kind === 'emt' ? `/parada/${encodeURIComponent(String(id))}` : `/parada/crtm/${encodeURIComponent(String(id))}`;
  const label = t(locale, kind === 'emt' ? 'stop.viewBuses' : 'stop.viewDepartures');
  return `<a href="${href(path, locale)}" class="font-semibold text-brand-ink underline">${escapeHtml(label)}</a>`;
}

export interface StopHeader {
  name: string;
  stopId: string;
  address?: string | null;
  tag?: string;
  /** Locale del "Parada X" (Fase 8C); por defecto ES para llamadas que no lo traigan */
  locale?: Locale;
  /** Estación de Cercanías (r_*): la referencia dice "Estación 18000" en vez de "Parada r_18000" */
  station?: boolean;
  /**
   * Composición apilada: el nombre se queda con su línea entera y "Parada X", el tag y la
   * dirección bajan JUNTOS a la siguiente. Es para rejillas de tarjetas (la home): ahí las
   * cabeceras van hombro con hombro y la versión de una línea mide 58 px o 78 según lo largo
   * que sea el nombre, con lo que la tarjeta del nombre largo arranca sus datos 20 px
   * por debajo de las vecinas y se lee como un escalón. Apilada, TODAS miden lo mismo.
   */
  stacked?: boolean;
}

export function stopHeaderHtml({ name, stopId, address, tag, locale = 'es', station, stacked }: StopHeader): string {
  const stopRef = escapeHtml(t(locale, station ? 'stop.stationRef' : 'stop.ref', { id: stopId }));
  // leading-none en la pastilla: sin él su caja mide 3 px más que la línea de texto que la
  // acompaña y la cabecera de una parada CRTM sale más alta que la de una EMT
  const tagHtml = tag
    ? `<span class="shrink-0 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink-2">${escapeHtml(tag)}</span>`
    : '';
  if (stacked) {
    return `<span class="block min-w-0 truncate text-sm font-semibold text-ink">${escapeHtml(name)}</span>
<span class="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
<span class="shrink-0 font-semibold text-brand-ink">${stopRef}</span>
${tagHtml}
${address ? `<span class="min-w-0 truncate">· ${escapeHtml(address)}</span>` : ''}
</span>`;
  }
  return `<span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
<span class="min-w-0 truncate text-sm font-semibold text-ink">${escapeHtml(name)}</span>
<span class="shrink-0 text-xs font-semibold text-brand-ink">${stopRef}</span>
${tagHtml}
</span>${address ? `<span class="mt-0.5 block truncate text-xs text-ink-3">${escapeHtml(address)}</span>` : ''}`;
}

// Estrella de favorito. Es el MISMO trazo que el icono "Favoritos" de la navegación
// (navLinks en Layout.astro): antes había un glifo de texto ☆/★ en el botón de la parada
// y en los chips de línea, que no casaba con ningún otro icono de la app. `filled` = ya
// guardado. Devuelve string porque los chips se pintan desde scripts client-side.
const STAR_PATH =
  'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.562.562 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.562.562 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.562.562 0 0 0 .475-.345L11.48 3.5Z';

// A 12px (chips) el contorno necesita trazo 2 o las puntas se pierden; de 18px para arriba
// se usa 1.5, que es el trazo del resto de iconos de la app
export function starSvgHtml(filled: boolean, cls = 'size-3', strokeWidth = 2): string {
  const paint = filled
    ? 'fill="currentColor"'
    : `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linejoin="round"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="${cls} shrink-0" ${paint} aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
}

export const ETA_ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1.5';

export const ETA_ROW_GROUP = 'flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto';

// Tablones de llegadas (ArrivalsBoard EMT y CrtmArrivalsBoard CRTM): la lista contenedora
// compartida y la fila del board CRTM (ETA_ROW + su padding). El GROUP del board CRTM era
// byte-idéntico a ETA_ROW_GROUP, así que se reutiliza directamente.
export const LIST_CLASS = 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-xs';
export const ROW_CLASS = `${ETA_ROW} px-3 py-2.5`;
