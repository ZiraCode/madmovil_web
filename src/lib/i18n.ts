// Núcleo de i18n (Fase 8A): locales ES (defecto, sin prefijo) y EN (prefijo /en).
// Sin dependencias: diccionarios TS tipados en src/i18n/{es,en}.ts y este módulo, que sirve
// IGUAL a frontmatter SSR, a scripts de cliente (Vite los bundlea como cualquier módulo de
// src/lib) y a módulos lib que generan texto de UI (cards, departures…).
// El locale activo llega por:
//   - SSR: Astro.locals.locale (lo fija src/middleware.ts a partir del prefijo /en)
//   - Cliente: clientLocale() leyendo <html lang> (lo escribe el Layout)

import es, { type Messages } from '../i18n/es';
import en from '../i18n/en';

export type Locale = 'es' | 'en';
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALES: readonly Locale[] = ['es', 'en'];

export type MessageKey = keyof Messages;
export type TranslateParams = Record<string, string | number>;

const DICTS: Record<Locale, Messages> = { es, en };

export function t(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  let text: string = DICTS[locale][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

// t() ligado a un locale: `const tr = translator(locale)` al inicio del frontmatter/script
export function translator(locale: Locale): (key: MessageKey, params?: TranslateParams) => string {
  return (key, params) => t(locale, key, params);
}

// Plural por convención de claves: `clave` (singular) + `${clave}_plural`. ES y EN comparten
// regla (singular solo con n === 1); si falta la clave plural cae al singular.
export function tN(locale: Locale, n: number, key: MessageKey, params?: TranslateParams): string {
  if (n !== 1) {
    const pluralKey = `${key}_plural` as MessageKey;
    if (pluralKey in DICTS[locale] || pluralKey in DICTS[DEFAULT_LOCALE]) {
      return t(locale, pluralKey, { n, ...params });
    }
  }
  return t(locale, key, { n, ...params });
}

// —— URLs con prefijo de locale ————————————————————————————————————————————
// Regla: ES sin prefijo (URLs ya indexadas intactas), EN con /en. Las páginas viven en un
// solo árbol; el middleware reescribe /en/... a la ruta interna antes del routing.

export function localeFromPath(pathname: string): Locale {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'es';
}

/** Ruta pública → interna: quita el prefijo /en si lo lleva */
export function stripLocalePrefix(pathname: string): string {
  if (pathname === '/en') return '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3) || '/';
  return pathname;
}

/** Ruta interna → URL pública: antepone /en en inglés. `path` debe empezar por / */
export function href(path: string, locale: Locale): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return locale === 'en' ? (p === '/' ? '/en' : `/en${p}`) : p;
}

/** Locale activo en scripts de cliente (el Layout lo escribe en <html lang>) */
export function clientLocale(): Locale {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'es';
}
