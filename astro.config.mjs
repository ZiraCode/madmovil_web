// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
const SITE = 'https://www.madmovil.es';

export default defineConfig({
  site: SITE,
  adapter: cloudflare(),
  integrations: [
    // Sitemap (Fase 8E). La integración NO lee el bloque i18n de arriba: se le pasa aparte y
    // empareja ES/en por prefijo de URL (es sin prefijo, /en/…). OJO: solo genera alternates
    // hreflang cuando AMBAS URLs existen como entradas — las gemelas EN de las páginas SSR
    // (/, /lineas, /mapa, /favoritos, /incidencias) no son rutas (el middleware las
    // reescribe), así que se inyectan con customPages; sin eso solo las 4 legales tendrían
    // alternates. Se excluyen 404 y offline (y gemelas /en): páginas de error/fallback, no
    // contenido. Las URLs salen con trailing slash (formato directory de Astro): verificadas
    // 200 en producción (el routing SSR casa /lineas y /lineas/), y el canonical de cada
    // página consolida la variante. Las paradas/líneas SSR bajo demanda no son enumerables.
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es', en: 'en' } },
      customPages: [
        `${SITE}/en/`,
        `${SITE}/en/lineas/`,
        `${SITE}/en/mapa/`,
        `${SITE}/en/favoritos/`,
        `${SITE}/en/incidencias/`,
      ],
      filter: (page) => !/(^|\/)(404|offline)\/?$/.test(new URL(page).pathname),
    }),
  ],
  // i18n (Fase 8): ES por defecto SIN prefijo (URLs ya indexadas intactas) y EN en /en.
  // Las páginas viven en UN solo árbol: el middleware de src/middleware.ts reescribe /en/…
  // a la ruta interna antes del routing, y el locale viaja en locals.locale. La config de
  // Astro aporta además la redirección /es/… → /… (evita URLs duplicadas del default).
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss()]
  }
});