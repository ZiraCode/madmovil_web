import type { APIRoute } from 'astro';
import { sitemapEndpoint } from '../lib/sitemap';

// SSR: prerenderizado congelaría el catálogo en el build y perdería Cache-Control/Content-Type
export const prerender = false;

export const GET: APIRoute = () =>
  sitemapEndpoint(
    (catalog) => catalog.emt.stops.map((stopId) => ({ path: `/parada/${encodeURIComponent(stopId)}` })),
    ['emt']
  );
