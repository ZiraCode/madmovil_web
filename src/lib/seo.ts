// JSON-LD (schema.org) para las fichas indexables: los crawlers y los buscadores
// con IA lo consumen para resultados enriquecidos. Los bloques NO son ejecutables
// (type="application/ld+json"), así que la CSP por hashes no les aplica.
import { href, type Locale } from './i18n';
import { jsonForIsland } from './islands';

const SITE = 'https://www.madmovil.es';

/** URL pública de la página actual en su locale (Astro.url va sin /en tras el rewrite) */
export function pageUrl(path: string, locale: Locale): string {
  return `${SITE}${href(path.replace(/\/+$/, '') || '/', locale)}`;
}

/** JSON-LD stringificado seguro para incrustar en un <script> (mismo escapado que los islands) */
export function jsonLdHtml(obj: unknown): string {
  return jsonForIsland(obj);
}

export function websiteJsonLd(locale: Locale): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Madrid Movilidad',
    url: pageUrl('/', locale),
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${pageUrl('/', locale)}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function busStopJsonLd(opts: {
  name: string;
  url: string;
  lat: number;
  lon: number;
  municipality: string | null;
}): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'BusStop',
    name: opts.name,
    url: opts.url,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: opts.lat,
      longitude: opts.lon,
    },
    ...(opts.municipality
      ? {
          address: {
            '@type': 'PostalAddress',
            addressLocality: opts.municipality,
            addressRegion: 'Comunidad de Madrid',
            addressCountry: 'ES',
          },
        }
      : {}),
  };
}

export function busRouteJsonLd(opts: {
  name: string;
  url: string;
  provider: string;
}): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'BusRoute',
    name: opts.name,
    url: opts.url,
    provider: {
      '@type': 'Organization',
      name: opts.provider,
    },
  };
}
