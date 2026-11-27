import type { APIRoute } from 'astro';
import { sitemapEndpoint } from '../lib/sitemap';

// SSR: prerenderizado congelaría el catálogo en el build y perdería Cache-Control/Content-Type
export const prerender = false;

export const GET: APIRoute = () =>
  sitemapEndpoint(
    (catalog) => [
      // Label EMT: único dentro de la red (NUNCA lineId: el lineId de la "1" es "001"
      // y "001" es el label de OTRA línea)
      ...catalog.emt.lines.map((label) => ({ path: `/linea/${encodeURIComponent(label)}` })),
      // CRTM por routeId: los labels están duplicados entre redes ('1' urbana ≠ M1 ≠ EMT).
      // W4 (auditoría CPU 2026-11-27): sin lastmod, igual que las líneas EMT y las paradas
      // CRTM (el generatedAt diario era un falso signal de "cambiado" para Googlebot)
      ...catalog.crtm.lines.map((line) => ({
        path: `/linea/crtm/${encodeURIComponent(line.routeId)}`
      }))
    ],
    ['emt', 'crtm']
  );
