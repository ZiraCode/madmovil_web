import { defineMiddleware } from 'astro:middleware';
import { env as workerEnv } from 'cloudflare:workers';
import { API_BASE_URL } from './lib/config';
import { href, localeFromPath, stripLocalePrefix, t } from './lib/i18n';
import { setSsrApiKey } from './lib/ssr-key';

// Rate limiting del worker web (hallazgo 7 de la auditoría): 120 req/min por IP vía binding
// nativo WEB_RATE_LIMITER (wrangler.jsonc). Fail-open si falta el binding. El smoke del CI
// hace <=10 peticiones; una navegación humana agresiva no llega al límite.
// Comportamiento verificado en producción: el binding es permissive/eventually consistent
// (docs Cloudflare) — las ráfagas cortas (<~30s) pasan; el abuso sostenido empieza a recibir
// 429 cuando los contadores por isolate convergen (~15-60s). Vale como capa anti-crawling,
// no como límite instantáneo exacto.
// NOTA: bindings vía `cloudflare:workers` (Astro.locals.runtime.env se eliminó en Astro v6+)
const RATE_LIMIT_PERIOD_SEC = 60;

// Los scripts inline ejecutables que emite el build son SOLO 5 (Astro inlinea los pequeños
// y el resto va externo en /_astro/*, cubierto por 'self'): FOUC del tema (Layout is:inline),
// tema/locale/hoja "Más" (Layout, fusionado y minificado), registro del SW, el retry de
// ErrorState/OfflinePage y la decisión de la intro de la home (index.astro is:inline, lee
// localStorage ANTES del primer pintado para no mostrarla y ocultarla con favoritos). La
// CSP los autoriza POR HASH (sin 'unsafe-inline', hallazgo ZAP): si se toca alguno,
// regenerarlos con `node scripts/check-csp.mjs` (falla el CI si falta).
const INLINE_SCRIPT_HASHES = [
  "'sha256-yVjx52Fjxb4Mox4L3V7VbZAi7FEwuyp1eneZagMlYbU='",
  "'sha256-qTS00+0zG8+5cXy2aFhBGW2lNnwdd4hcPCx3jKw4GQw='",
  "'sha256-Yn2Jotsfmm7i47U+E14Xk6Op+XTBd+SxGesXU75ZTqo='",
  "'sha256-A3M8oQCNY+ZmfxkftNMpLeUK7TbchHmPaJu31vwcfe4='",
  "'sha256-IMJD+lIY5e4IIpRTt1PgNoYZWEwx+3D1Zc5zEZ5X7oo='",
];

function cspDirective(): string {
  const apiOrigin = new URL(API_BASE_URL).origin;
  return [
    "default-src 'self'",
    // challenges.cloudflare.com = Turnstile del vault de favoritos (F2): script del widget,
    // iframe del reto y sus telemetrías. connect-src lleva además el API propia
    `script-src 'self' ${INLINE_SCRIPT_HASHES.join(' ')} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
    // Public Sans es self-hosted (/fonts/*, mismo origen). NOTA: la regla /* de _headers
    // sirve esta CSP también sobre /sw.js y la CSP del script de un SW gobierna los
    // fetch() del PROPIO SW — si algún día el SW fetchea otros orígenes (p. ej. tiles
    // OSM), añadirlos a connect-src aquí y en _headers (bug real 2026-09-06)
    `connect-src 'self' ${apiOrigin} https://challenges.cloudflare.com`,
    "worker-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function applySecurityHeaders(headers: Headers): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (import.meta.env.PROD) {
    headers.set('Content-Security-Policy', cspDirective());
  }
  // Workers Cache (wrangler.jsonc cache.enabled) corre DELANTE del worker y decide por
  // las cabeceras de cada respuesta (RFC 9111). Las páginas caras ya llevan
  // public,max-age=60,s-maxage=3600 (W2, auditoría CPU 2026-11-27; 300 hasta entonces)
  // (+ no-transform aquí añadido); el resto no tiene
  // frescura explícita y por heurística RFC podría acabar cacheado (un 429, un 404 del
  // catch-all o la home cacheados serían un desastre) -> no-store explícito. El
  // no-transform además inhibe la inyección JSD de Cloudflare (doc CF: "Cloudflare does
  // not inject the JavaScript Detections script" con no-transform). Los assets del CDN
  // no pasan por aquí: sus reglas viven en _headers (y ahí NO vale /* porque las reglas
  // se ACUMULAN y uniría dos Cache-Control con coma, rompiendo el immutable de /fonts/*
  // y /_astro/*)
  const cc = headers.get('Cache-Control');
  if (!cc) headers.set('Cache-Control', 'no-store, no-transform');
  else if (!cc.includes('no-transform')) headers.set('Cache-Control', `${cc}, no-transform`);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  // i18n (Fase 8): ES sin prefijo, EN con /en. /en/… se reescribe INTERNAMENTE a la ruta sin
  // prefijo (un solo árbol de páginas) y el locale viaja en locals.locale. El guard por
  // locals cumple dos funciones: cortar bucles si el rewrite vuelve a pasar por el middleware
  // y que el rate limit cuente UNA vez por petición real del usuario, no por cada pasada.
  const locale = localeFromPath(url.pathname);
  const firstPass = context.locals.locale === undefined;
  context.locals.locale ??= locale;

  // Prerender (build y emulación en dev): ni redirect, ni rewrite (Astro lanza
  // ForbiddenRewrite al reescribir de SSR a una ruta prerenderizada — las páginas EN
  // prerenderizadas son rutas REALES que el routing casa solo), ni rate limit. Las
  // prerenderizadas en producción las sirve el CDN de Assets sin pasar por aquí.
  if (context.isPrerendered) {
    const prerendered = await next();
    applySecurityHeaders(prerendered.headers);
    return prerendered;
  }

  // Fase 11A: publica el secret API_SSR_KEY (wrangler secret, mismo valor que el
  // SSR_INTERNAL_KEY del server) en el holder de lib/ssr-key.ts, que consume request()
  // de api.ts para mandar X-SSR-Key en TODOS los fetch SSR al API (bypass del rate limit
  // de 60/min, W1 del server — el SSR salía de pocas IPs de colo y se limitaba a sí mismo:
  // 749 429 en 2 días). Aquí y no en api.ts porque este módulo es el único con acceso a
  // cloudflare:workers y api.ts también viaja en bundles de cliente. Va tras el guard de
  // prerender (en el build de estáticas no hay env) y ANTES de next(): las páginas hacen
  // sus fetch dentro de next(). Releído por request: si el secret rota (wrangler secret
  // put), el siguiente request ya usa el nuevo sin esperar a reciclar el isolate.
  // Fail-closed: sin secret, ssrApiKey() es undefined y no se manda header. No loguear.
  setSsrApiKey(workerEnv.API_SSR_KEY);

  // Rate limit ANTES del rewrite de /en y del 308 de /es: el rewrite corta esta pasada
  // del middleware y la segunda entra con firstPass=false, así que si el límite viviera
  // debajo las peticiones /en no se contarían jamás. Aquí cuenta UNA vez por petición
  // real y el 429 sale en el locale de la URL que lo recibió.
  if (firstPass) {
    const limiter = workerEnv.WEB_RATE_LIMITER;

    if (limiter) {
      const ip = context.request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await limiter.limit({ key: `web:${ip}` });
      if (!success) {
        const headers = new Headers({
          'Content-Type': 'text/html; charset=utf-8',
          'Retry-After': String(RATE_LIMIT_PERIOD_SEC),
        });
        applySecurityHeaders(headers);
        return new Response(
          `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t(locale, 'rateLimit.title')}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;text-align:center"><h1 style="font-size:1.25rem">${t(locale, 'rateLimit.heading')}</h1><p style="color:#57534e">${t(locale, 'rateLimit.body')}</p><a href="${href('/', locale)}" style="color:#8a4a2b">${t(locale, 'rateLimit.back')}</a></body></html>`,
          { status: 429, headers }
        );
      }
    }
  }

  // /es/… → /…: el locale por defecto vive SIN prefijo (la opción nativa de Astro
  // redirectToDefaultLocale solo vale con prefixDefaultLocale: true). Así no hay URLs
  // duplicadas ni 404 seco para quien teclee el prefijo
  if (firstPass && (url.pathname === '/es' || url.pathname.startsWith('/es/'))) {
    const stripped = url.pathname === '/es' ? '/' : url.pathname.slice(3);
    return context.redirect(stripped + url.search, 308);
  }

  if (firstPass && locale === 'en') {
    return context.rewrite(stripLocalePrefix(url.pathname) + url.search);
  }

  const response = await next();
  applySecurityHeaders(response.headers);
  return response;
});
