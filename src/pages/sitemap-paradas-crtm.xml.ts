import type { APIRoute } from 'astro';
import { sitemapEndpoint } from '../lib/sitemap';

// SSR: prerenderizado congelaría el catálogo en el build y perdería Cache-Control/Content-Type
export const prerender = false;

export const GET: APIRoute = () =>
  sitemapEndpoint(
    // W4 (auditoría CPU 2026-11-27): SIN lastmod. El generatedAt del pipeline cambia a
    // diario y Googlebot leía "todo el catálogo modificado cada día" → recrawl masivo
    // diario de ~17k URLs. Igual que el sitemap de paradas EMT, que nunca llevó lastmod
    (catalog) =>
      catalog.crtm.stops.map((code) => ({
        path: `/parada/crtm/${encodeURIComponent(code)}`
      })),
    ['crtm']
  );
