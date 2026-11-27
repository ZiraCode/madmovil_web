import { getCatalog } from './api';
import { escapeHtml as xmlEscape } from './cards';
import type { CatalogData } from '../types/api';

const SITE = 'https://www.madmovil.es';
// Límite de Google: 50.000 <url> por fichero; cada página genera 2 entradas (es + en)
const MAX_PAGES = 24000;

export interface SitemapPage {
  /** Path público sin prefijo de locale y sin trailing slash ('/parada/62') */
  path: string;
}

export type CatalogFamily = 'emt' | 'crtm';

function urlEntries(page: SitemapPage): string {
  const es = `${SITE}${page.path}`;
  const en = `${SITE}/en${page.path}`;
  const block = (loc: string) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="${xmlEscape(es)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(es)}"/>
  </url>`;
  // Una entrada <url> por idioma con el mismo set de alternates (formato de Google;
  // el Layout de cada ficha publica los mismos hreflang en el HTML)
  return `${block(es)}\n${block(en)}`;
}

function unavailable(): Response {
  // No publicar un sitemap vacío/recortado: Google retiraría URLs indexadas.
  // 503 + Retry-After: reintento posterior, el índice existente no se toca
  return new Response('Sitemap no disponible ahora mismo (catálogo del API degradado)', {
    status: 503,
    headers: { 'Retry-After': '3600' }
  });
}

/**
 * Endpoint de sitemap servido desde el catálogo del API (GET /catalog). Si la familia
 * que alimenta el sitemap viene degradada → 503 (nunca un fichero con menos URLs).
 * Cache-Control 1h/24h: el CDN (cache.enabled) absorbe a los crawlers.
 */
export async function sitemapEndpoint(
  build: (catalog: CatalogData) => SitemapPage[],
  require: CatalogFamily[]
): Promise<Response> {
  let catalog: CatalogData;
  try {
    catalog = await getCatalog();
  } catch {
    return unavailable();
  }
  if (require.some((family) => catalog.degraded?.includes(family))) {
    return unavailable();
  }

  const pages = build(catalog).slice(0, MAX_PAGES);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(urlEntries).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
}
