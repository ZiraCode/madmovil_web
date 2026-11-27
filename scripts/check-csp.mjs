// Verifica los hashes de la CSP (script-src) contra los scripts inline reales del build.
// La CSP de src/middleware.ts y public/_headers autoriza los 4 scripts inline ejecutables
// POR HASH (sin 'unsafe-inline'); si un cambio en Layout/ErrorState/OfflinePage altera su
// contenido, el hash cambia y el navegador BLOQUEARÍA el script en producción.
//
// Uso:
//   npm run build && node scripts/check-csp.mjs
//   node scripts/check-csp.mjs http://localhost:4321/ http://localhost:4321/parada/62 ...
//     (URLs http(s) se fetchean de un preview/dev vivo — cubre páginas SSR que no
//      dejan HTML en dist/client; sin URLs, solo escanea las prerenderizadas)
//
// Falla (exit 1) si algún script inline del build no está declarado en AMBOS ficheros,
// si un hash declarado no corresponde a ningún script del build, o si el escaneo no
// encuentra ningún script inline (build ausente o vacío).

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_BLOCK = /type="(application\/(ld\+)?json|importmap|speculationrules)"/;
const SCRIPT_RX = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;

function hashInlineScripts(html, source, found) {
  for (const match of html.matchAll(SCRIPT_RX)) {
    if (DATA_BLOCK.test(match[1])) continue;
    const hash = `'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`;
    if (!found.has(hash)) found.set(hash, { source, head: match[2].replace(/\s+/g, ' ').trim().slice(0, 80) });
  }
}

function walkHtml(dir, found) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walkHtml(path, found);
    else if (entry.endsWith('.html')) hashInlineScripts(readFileSync(path, 'utf8'), path, found);
  }
}

const found = new Map();
const urls = [];
for (const arg of process.argv.slice(2)) {
  if (/^https?:\/\//.test(arg)) urls.push(arg);
}

walkHtml(join(ROOT, 'dist', 'client'), found);
for (const url of urls) {
  const res = await fetch(url);
  hashInlineScripts(await res.text(), `${url} (${res.status})`, found);
}

const middleware = readFileSync(join(ROOT, 'src', 'middleware.ts'), 'utf8');
const headersFile = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');

let failed = false;
console.log(`Scripts inline ejecutables encontrados: ${found.size}`);
for (const [hash, info] of found) {
  const inMiddleware = middleware.includes(hash);
  const inHeaders = headersFile.includes(hash);
  const status = inMiddleware && inHeaders ? 'OK ' : 'FALTA';
  if (!inMiddleware || !inHeaders) failed = true;
  console.log(`  ${status} ${hash}  (${info.source})`);
  console.log(`        ${info.head}`);
}

for (const file of [
  [middleware, 'src/middleware.ts'],
  [headersFile, 'public/_headers'],
]) {
  for (const declared of file[0].match(/'sha256-[^']+'/g) ?? []) {
    if (!found.has(declared)) {
      console.log(`FALTA: hash declarado sin script en el build (${file[1]}): ${declared}`);
      failed = true;
    }
  }
}

if (found.size === 0) {
  console.log('FALTA: el escaneo no encontró ningún script inline (¿build ausente o sin HTML?)');
  failed = true;
}

if (urls.length === 0) {
  console.log('Nota: sin URLs, solo se comprueban las páginas prerenderizadas; para cubrir SSR: node scripts/check-csp.mjs http://localhost:4321/ ...');
}

process.exit(failed ? 1 : 0);
