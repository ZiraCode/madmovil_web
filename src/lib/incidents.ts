import { t, type Locale } from './i18n';
import type { LineIncident } from '../types/api';

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü',
  iexcl: '¡',
  iquest: '¿',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  euro: '€',
};

export function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const n = parseInt(hex, 16);
      return n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function incidentStatus(incident: LineIncident, now = Date.now()): 'active' | 'upcoming' {
  if (!incident.startsAt) return 'active';
  const start = new Date(incident.startsAt).getTime();
  return Number.isNaN(start) || start <= now ? 'active' : 'upcoming';
}

export function formatIncidentDate(iso: string | null, locale: Locale): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    ...(sameYear ? {} : { year: 'numeric' }),
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export function formatFeedDate(rfc822: string, locale: Locale): string | null {
  const date = new Date(rfc822);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

export function incidentDateRange(incident: LineIncident, locale: Locale): string {
  const start = formatIncidentDate(incident.startsAt, locale);
  const end = formatIncidentDate(incident.endsAt, locale);
  if (start && end) return `${start} – ${end}`;
  if (start) return t(locale, 'incident.from', { date: start });
  if (end) return t(locale, 'incident.until', { date: end });
  return t(locale, 'incident.noDates');
}

export function cleanCauseText(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^\s*\d+\s*[-–—]\s*/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}
