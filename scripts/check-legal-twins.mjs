// Guarda de deriva de las páginas legales ES/EN (REVIEW-CLAUDE-WEB B-5): las gemelas
// EN son traducciones documentales íntegras mantenidas a mano; nada avisaría si un
// apartado añadido en ES se queda sin su par EN (o al revés).
//
// Para cada par compara la estructura: numero de <h2>/<h3>/<li> y la secuencia de
// numeracion de los <h2> ("1. Titular…" / "1. Website owner" -> "1,2,…"). No valida
// la traduccion: detecta el caso real (annadir/quitar un apartado en un solo idioma).
//
// Uso:
//   node scripts/check-legal-twins.mjs
//
// Falla (exit 1) si alguna metrica difiere entre el par ES y el par EN.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['aviso-legal', 'privacidad', 'cookies', 'accesibilidad'];

function structure(file) {
  const src = readFileSync(file, 'utf8');
  const h2 = [...src.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1]);
  const count = (tag) => (src.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
  return {
    h2: h2.length,
    h3: count('h3'),
    li: count('li'),
    h2Numbers: h2.map((text) => text.trim().match(/^(\d+)/)?.[1] ?? '-').join(','),
  };
}

let failed = false;
for (const page of PAGES) {
  const es = structure(join(ROOT, 'src', 'pages', `${page}.astro`));
  const en = structure(join(ROOT, 'src', 'pages', 'en', `${page}.astro`));
  for (const key of ['h2', 'h3', 'li', 'h2Numbers']) {
    if (es[key] !== en[key]) {
      failed = true;
      console.log(`FALTA paridad en ${page}: ${key} ES=${JSON.stringify(es[key])} EN=${JSON.stringify(en[key])}`);
    }
  }
  console.log(`OK  ${page}: h2=${es.h2} h3=${es.h3} li=${es.li} (${es.h2Numbers})`);
}

if (failed) {
  console.log('Las paginas legales ES/EN han divergido estructuralmente: revisa la gemela.');
  process.exit(1);
}
