/// <reference types="astro/client" />

declare global {
  namespace App {
    interface Locals {
      /** Locale de la petición: lo fija src/middleware.ts a partir del prefijo /en (ES sin prefijo) */
      locale: import('./lib/i18n').Locale;
    }
  }

  // API_SSR_KEY (Fase 11A) es un wrangler SECRET: no vive en wrangler.jsonc, así que
  // `wrangler types` no lo genera — se declara a mano, opcional (fail-closed sin él).
  interface Env {
    API_SSR_KEY?: string;
  }

  namespace Cloudflare {
    interface Env {
      API_SSR_KEY?: string;
    }
  }
}

export {};
