import { t, type Locale } from './i18n';
import { accessibleChipColors } from './contrast';
import { escapeHtml } from './cards';
import type { CrtmLineColors, CrtmNetwork } from '../types/crtm';

// Día corto lunes–domingo por locale (labels de daysLabel)
const DAY_SHORT: Record<Locale, readonly string[]> = {
  es: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

// Colores oficiales del metro ligero (RRGGBB). El API los publica en los items de línea
// (color/textColor opcionales), pero no en todos los contextos (p. ej. salidas o favoritos):
// este mapa sirve de fallback para pintar chips ML1–ML4 con su color en cualquier sitio.
const ML_LINE_COLORS: Record<string, { color: string; textColor: string }> = {
  ML1: { color: '#3A7DDA', textColor: '#FFFFFF' },
  ML2: { color: '#A60084', textColor: '#FFFFFF' },
  ML3: { color: '#ED1C24', textColor: '#FFFFFF' },
  ML4: { color: '#7DB713', textColor: '#FFFFFF' },
};

export function mlLineColors(label: string): { color: string; textColor: string } | null {
  const c = ML_LINE_COLORS[label];
  return c ? { color: c.color, textColor: accessibleChipColors(c.color).text } : null;
}

// Colores oficiales del metro (RRGGBB), del feed del CRTM: fallback para pintar chips de
// línea en contextos SIN el color del API (p. ej. filas de favoritos con solo el label).
// PELIGRO de colisión: los labels ('1', '10'…) chocan con urbanos de otros municipios,
// así que este mapa SOLO se consulta cuando el contexto es sabidamente metro (red conocida
// o estación con noScheduleData), nunca como fallback genérico por label.
const METRO_LINE_COLORS: Record<string, { color: string; textColor: string }> = {
  '1': { color: '#2DBEF0', textColor: '#FFFFFF' },
  '2': { color: '#ED1C24', textColor: '#FFFFFF' },
  '4': { color: '#B65518', textColor: '#FFFFFF' },
  '5': { color: '#8FD400', textColor: '#FFFFFF' },
  '6': { color: '#98989B', textColor: '#FFFFFF' },
  '7': { color: '#EE7518', textColor: '#FFFFFF' },
  '8': { color: '#EC82B1', textColor: '#FFFFFF' },
  '9': { color: '#A60084', textColor: '#FFFFFF' },
  '10': { color: '#005AA9', textColor: '#FFFFFF' },
  '11': { color: '#009B3A', textColor: '#FFFFFF' },
  '12': { color: '#A49800', textColor: '#FFFFFF' },
  R: { color: '#FFFFFF', textColor: '#005AA9' },
};

export function metroLineColors(label: string): { color: string; textColor: string } | null {
  const c = METRO_LINE_COLORS[label];
  return c ? { color: c.color, textColor: accessibleChipColors(c.color).text } : null;
}

// Colores oficiales de Cercanías Renfe (RRGGBB), del feed del NAP que sirve el CRTM:
// igual que el metro ligero, el API los publica en lines/detail/route pero NO en las
// salidas ni en los favoritos — este mapa sirve de fallback en esos contextos.
// Labels C1–C10 ÚNICOS en toda la red (bus numérico o N*, metro '1'–'12'/'R', ml 'ML*'):
// seguro como fallback por label en cualquier contexto.
const CERCANIAS_LINE_COLORS: Record<string, { color: string; textColor: string }> = {
  C1: { color: '#75B6E0', textColor: '#FFFFFF' },
  C2: { color: '#00943D', textColor: '#FFFFFF' },
  C3: { color: '#952585', textColor: '#FFFFFF' },
  C4: { color: '#2C2A86', textColor: '#FFFFFF' },
  C4a: { color: '#2C2A86', textColor: '#FFFFFF' },
  C4b: { color: '#2C2A86', textColor: '#FFFFFF' },
  C5: { color: '#FECB00', textColor: '#FFFFFF' },
  C7: { color: '#E5202A', textColor: '#FFFFFF' },
  C8a: { color: '#868584', textColor: '#FFFFFF' },
  C8b: { color: '#868584', textColor: '#FFFFFF' },
  C9: { color: '#915419', textColor: '#FFFFFF' },
  C10: { color: '#BCCF00', textColor: '#FFFFFF' },
};

export function cercaniasLineColors(label: string): { color: string; textColor: string } | null {
  const c = CERCANIAS_LINE_COLORS[label];
  return c ? { color: c.color, textColor: accessibleChipColors(c.color).text } : null;
}

// Estación de Cercanías Renfe (códigos r_*): el prefijo no colisiona con ningún otro
// (10_ ml, 4_ metro, numérico bus) — detección limpia compartida por mapa, página de
// estación y cards de favoritos
export function isCercaniasStop(code: string): boolean {
  return code.startsWith('r_');
}

// route_color del feed de bus: UNIFORME por red (las 108 urbanas → #E60003, las 324
// interurbanas → #8EBF42) — no distingue línea, pero es el color publicado para ELLAS
// y los chips de LÍNEA lo llevan SIEMPRE (regla de la casa: color de línea cuando
// existe, tono de red SOLO en los badges de RED —nombres— y como fallback). Si el CRTM
// algún día publica colores por línea, item.color llega antes que este mapa
const BUS_LINE_COLORS: Record<string, string> = { urban: '#E60003', interurban: '#8EBF42' };

// Color de fallback para chips de LÍNEA en contextos SIN el color del API (board de
// salidas, cards de favoritos, popups de mapa): ml y cercanías siempre (labels únicos);
// metro SOLO si el contexto es sabidamente metro (los labels '1'–'12' colisionan con
// los urbanos de otros municipios); bus por red (uniforme del feed)
export function chipFallbackColors(label: string, network?: string | null): { color: string; textColor: string } | null {
  const known = mlLineColors(label) ?? cercaniasLineColors(label) ?? (network === 'metro' ? metroLineColors(label) : null);
  if (known) {
    const c = accessibleChipColors(known.color);
    return { color: c.background, textColor: c.text };
  }
  const bus = network ? BUS_LINE_COLORS[network] : undefined;
  if (bus) {
    const c = accessibleChipColors(bus);
    return { color: c.background, textColor: c.text };
  }
  return null;
}

// Los fondos casi blancos (Ramal R) se fundirían con la tarjeta: aro interior sutil
// NO es luminancia WCAG (contrast.ts): heurística de "fondo casi blanco" para decidir el aro — no unificar
function isNearWhiteChip(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 230;
}

// El color del texto y, en la banda media de luminancias, un MÍNIMO ajuste del fondo los
// calcula SIEMPRE la luminancia WCAG (contrast.ts): los textColor oficiales del feed
// (blanco fijo) fallan sobre colores claros como C5, C10, ML4 o M12
export function lineColorChipStyle(color: string): string {
  const { background, text } = accessibleChipColors(color);
  const base = `background:${background};color:${text}`;
  return isNearWhiteChip(background) ? `${base};box-shadow:inset 0 0 0 1px rgba(15,23,42,0.25)` : base;
}

// Color de un item de línea CRTM: el del API si llega (ml, metro y cercanías), si no el
// oficial conocido de ML1–ML4 o C1–C10 (labels únicos). Bus → null (paleta de red por
// data-network, nunca linecolors.ts)
export function crtmLineItemColors(item: CrtmLineColors & { label: string }): { color: string; textColor: string } | null {
  if (item.color) {
    const c = accessibleChipColors(`#${item.color}`);
    return { color: c.background, textColor: c.text };
  }
  return mlLineColors(item.label) ?? cercaniasLineColors(item.label);
}

export function crtmLineItemStyle(item: CrtmLineColors & { label: string }): string | undefined {
  const colors = crtmLineItemColors(item);
  return colors ? lineColorChipStyle(colors.color) : undefined;
}

// GTFS 'YYYYMMDD' → 'DD/MM/YYYY' (calendarEnd del modo catálogo); cadenas raras van tal cual
export function gtfsDateLabel(gtfs: string): string {
  if (!/^\d{8}$/.test(gtfs)) return gtfs;
  return `${gtfs.slice(6, 8)}/${gtfs.slice(4, 6)}/${gtfs.slice(0, 4)}`;
}

function parseDays(days: number[] | string): boolean[] {
  const bits = typeof days === 'string' ? days.trim().split(/\s+/).map((v) => v === '1') : days.map((v) => Boolean(v));
  return DAY_SHORT.es.map((_, i) => bits[i] ?? false);
}

export function daysLabel(locale: Locale, days: number[] | string): string {
  const bits = parseDays(days);
  const names = DAY_SHORT[locale];
  if (!bits.some(Boolean)) return '—';
  if (bits.every(Boolean)) return t(locale, 'crtm.daily');
  if (bits.every((b, i) => b === i < 5)) return t(locale, 'crtm.weekdaysShort');
  if (bits.every((b, i) => b === i >= 5)) return t(locale, 'crtm.weekend');
  const first = bits.indexOf(true);
  const last = bits.lastIndexOf(true);
  const contiguous = bits.slice(first, last + 1).every(Boolean);
  if (contiguous) return first === last ? names[first] : `${names[first]}–${names[last]}`;
  return bits.map((b, i) => (b ? names[i] : null)).filter((d) => d !== null).join(', ');
}

// gtfsTimeLabel vive ahora en src/lib/departures.ts (locale-aware, Fase 8A)

// Los nombres de parada CRTM llegan del API EN MAYÚSCULAS ("CTRA.BARRIO DE LA FORTUNA-AV.AVIACION")
// mientras que los de la EMT llegan en caja mixta ("Granja San Ildefonso-Batres"): puestos uno al
// lado del otro —una card de favoritos, un resultado de búsqueda, un popup del mapa— el CRTM grita.
// Esto es SOLO presentación: el dato crudo se sigue cacheando y enviando tal cual, así que la
// función se aplica al pintar, nunca al guardar.
//
// Reglas, sacadas de mirar 701 nombres reales del API:
//   - Si ya trae alguna minúscula se devuelve intacto (los nombres de LÍNEA CRTM vienen en caja
//     mixta, "MADRID (Plaza de Castilla) - ALCOBENDAS", y no hay que tocarlos). Esto también hace
//     la función idempotente: pasarla dos veces da lo mismo.
//   - Espacio tras punto/º/ª pegados a la siguiente palabra ("CTRA.BARRIO" → "Ctra. Barrio",
//     "CºHUERTAS" → "Cº Huertas"): en mayúsculas no cantaba, en caja mixta sí.
//   - Palabras con dígito, siglas conocidas y números romanos se quedan como están: A6, M607,
//     N-II, IFEMA, SIGLO XXI, ISABEL II.
//   - Preposiciones siempre en minúscula salvo al principio ("Avda. de America"); los artículos
//     también, PERO se capitalizan tras punto o guion, que ahí suelen abrir nombre propio
//     ("EST.LA GARENA" → "Est. La Garena", "URB.EL GUIJO" → "Urb. El Guijo").
// Lo que NO puede hacer: devolver las tildes que el API no manda ("COLONIA JARDIN" → "Colonia
// Jardin", no "Jardín"). Para eso haría falta un diccionario de nombres, no una regla.
const NAME_PREP = new Set(['de', 'del', 'en', 'con', 'a', 'al', 'y', 'e', 'o', 'u', 'por', 'para', 'sin', 'sobre', 'tras']);
const NAME_ARTICLE = new Set(['la', 'las', 'los', 'el', 'lo', 'un', 'una']);
const NAME_KEEP = new Set(['ML', 'EMT', 'CRTM', 'RENFE', 'IFEMA', 'UAM', 'UCM', 'URJC', 'UPM', 'UNED', 'CSIC', 'IES', 'CEIP', 'ITV', 'INTA', 'AVE', 'CEU', 'ONCE']);
const NAME_UNITS: Record<string, string> = { KM: 'km' };
const ROMAN = /^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

export function displayStopName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (/\p{Ll}/u.test(clean)) return clean;
  const spaced = clean.replace(/([.ºª])(?=\p{Lu})/gu, '$1 ');
  return spaced.replace(/[\p{L}\p{N}]+/gu, (word, offset: number, full: string) => {
    if (/\d/.test(word)) return word;
    if (NAME_KEEP.has(word) || ROMAN.test(word)) return word;
    if (NAME_UNITS[word]) return NAME_UNITS[word];
    const lower = word.toLowerCase();
    const before = full.slice(0, offset).replace(/\s+$/, '');
    const start = before === '';
    const afterBreak = /[.\-/(&º]/.test(before.slice(-1));
    if (!start && NAME_PREP.has(lower)) return lower;
    if (!start && !afterBreak && NAME_ARTICLE.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

// Llegan con espacios residuales y, en parte de las paradas del CRTM, a NULL (el pipeline
// del server no resuelve el municipio de ~la mitad de las estaciones de metro): siempre ''
export function trimMunicipality(municipality: string | null | undefined): string {
  return (municipality ?? '').replace(/\s+/g, ' ').trim();
}

export function networkLabel(locale: Locale, network: CrtmNetwork): string {
  if (network === 'interurban') return t(locale, 'crtm.network.interurban');
  if (network === 'ml') return t(locale, 'crtm.network.ml');
  if (network === 'metro') return t(locale, 'crtm.network.metro');
  if (network === 'cercanias') return t(locale, 'crtm.network.cercanias');
  return t(locale, 'crtm.network.urban');
}

// Aviso "modo catálogo" en HTML (mismo marcado que NoScheduleNotice.astro) para scripts
// client-side: el board RT lo inyecta cuando el fetch trae noScheduleData en caliente y el
// horario por fecha cuando la parada es de red sin horarios oficiales. opts.note añade una
// línea final (p. ej. crtm.noScheduleStopNote); opts.id para poder retirarlo luego
export function noScheduleNoticeHtml(
  locale: Locale,
  ns: { calendarEnd?: string; feedVersions?: string[] } | undefined,
  opts: { id?: string; note?: string } = {}
): string {
  const date = ns?.calendarEnd ? gtfsDateLabel(ns.calendarEnd) : null;
  const version = ns?.feedVersions?.length ? ns.feedVersions.map((v) => `v${v}`).join(', ') : null;
  const body = date && version ? t(locale, 'crtm.noScheduleBody', { date, version }) : date ? t(locale, 'crtm.noScheduleBodyNoVersion', { date }) : t(locale, 'crtm.noScheduleGeneric');
  const idAttr = opts.id ? ` id="${opts.id}"` : '';
  const title = escapeHtml(t(locale, 'crtm.noScheduleTitle'));
  return `
    <aside${idAttr} class="flex items-start gap-3 rounded-xl border border-warn bg-warn-soft px-4 py-3 text-sm font-medium text-warn-ink" role="note" aria-label="${title}">
      <span class="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-warn text-[11px] font-bold text-page" aria-hidden="true">!</span>
      <span class="min-w-0">
        <span class="block font-semibold">${title}</span>
        <span class="mt-0.5 block text-[13px] leading-relaxed">${escapeHtml(body)}${opts.note ? `<span class="mt-0.5 block">${escapeHtml(opts.note)}</span>` : ''}</span>
      </span>
    </aside>`;
}
