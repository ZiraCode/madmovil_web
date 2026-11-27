// Auditoría de contraste (axe-core, regla color-contrast) contra un servidor dev o prod.
// Uso: node scripts/axe-a11y.mjs /ruta1 /ruta2…        (contra http://localhost:4321)
//      BASE=https://www.madmovil.es node scripts/axe-a11y.mjs / /lineas
//      WIN=390,844 node scripts/axe-a11y.mjs /         (viewport móvil)
//
// Cómo funciona: arranca Edge headless con --remote-debugging-port y lo maneja por CDP
// (sin deps: WebSocket nativo de Node). Por página: espera URL+readyState+marcadores de
// contenido, inyecta el fuente de axe-core vía Runtime.evaluate (la evaluación por CDP NO
// está sujeta a la CSP, así que sirve también contra producción), fuerza .light/.dark en
// <html>, asienta las transiciones con getAnimations().finish() (en headless no avanzan
// solas: sin frames de render los colores quedan a medio transicionar y las medidas salen
// basura) y ejecuta axe.run dos veces. Imprime un digest y guarda el detalle en
// %TEMP%/opencode/axe-results.json.
//
// Filas de salidas CANCELADAS (li.opacity-60 del board CRTM de r_*): atenuación
// deliberada de contenido inactivo (AGENTS: "Cancelado danger atenuando la fila"). axe
// compone la opacidad del ancestro sobre fg y bg, así que esas filas clavan bajo 4.5:1
// aunque sus pares de tokens pasen a plena opacidad (verificado: fg ink 0.6·+0.4·blanco
// ≈ #7b7773). Se EXCLUYEN del color-contrast (context exclude de axe) y se cuentan aparte
// en la salida (excl N) — la exclusión es visible, nunca silenciosa. opacity-60 no se usa
// en ningún otro componente del sitio.
//
// OJO: si el dev server apunta a un API caída, las páginas salen en fail-soft y solo se
// audita el chrome — arrancar con PUBLIC_API_BASE_URL=https://api.madmovil.es o auditar
// prod con BASE. No usar --virtual-time-budget + window.open: Edge se cuelga sin dump.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const BASE = process.env.BASE ?? 'http://localhost:4321';
const WIN = process.env.WIN ?? '1280,900';
const OUT = path.join(os.tmpdir(), 'opencode', 'axe-results.json');
const AXE_URL = 'https://cdn.jsdelivr.net/npm/axe-core@4/axe.min.js';

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('uso: node scripts/axe-a11y.mjs /ruta1 /ruta2… (env: BASE, WIN)');
  process.exit(1);
}
if (!fs.existsSync(EDGE)) {
  console.error(`ERROR: no encuentro Edge en ${EDGE} — ajusta EDGE en el script`);
  process.exit(1);
}

const AXE_SRC = await (await fetch(AXE_URL)).text();
if (!AXE_SRC.includes('axe')) {
  console.error('ERROR: axe-core no descargó (¿sin red?)');
  process.exit(1);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const EXPR = `
(async () => {
  const flush = () => document.getAnimations({ subtree: true }).forEach(a => { try { a.finish(); } catch (e) {} });
  window.eval(${JSON.stringify(AXE_SRC)});
  if (!window.axe) throw new Error('axe no inyectado');
  const opts = { runOnly: { type: 'rule', values: ['color-contrast'] } };
  const extract = (r) => r.violations.flatMap(v => v.nodes.map(n => {
    const d = (n.any[0] && n.any[0].data) || {};
    return { t: n.target.join(' > '), h: n.html.slice(0, 160), fg: d.fgColor, bg: d.bgColor, r: d.contrastRatio, e: d.expectedContrastRatio, fs: d.fontSize, fw: d.fontWeight };
  }));
  const html = document.documentElement;
  // Contexto axe: sin las filas canceladas atenuadas (ver cabecera) — contadas aparte
  const ctx = { exclude: ['.opacity-60'] };
  const excluded = document.querySelectorAll('.opacity-60').length;
  html.classList.remove('dark'); html.classList.add('light');
  flush(); await new Promise(r => setTimeout(r, 300)); flush();
  const rl = await window.axe.run(ctx, opts);
  html.classList.remove('light'); html.classList.add('dark');
  flush(); await new Promise(r => setTimeout(r, 300)); flush();
  const rd = await window.axe.run(ctx, opts);
  return JSON.stringify({
    excluded,
    light: { count: rl.violations.length, nodes: extract(rl), incomplete: rl.incomplete.length },
    dark: { count: rd.violations.length, nodes: extract(rd), incomplete: rd.incomplete.length }
  });
})()
`;

const profile = path.join(os.tmpdir(), 'opencode', 'edge-profile-a11y');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
  `--window-size=${WIN}`, `--user-data-dir=${profile}`, '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

let ready = false;
for (let i = 0; i < 40; i++) {
  try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ready = true; break; } catch { await sleep(500); }
}
if (!ready) { console.error('ERROR: devtools de Edge no disponible'); proc.kill(); process.exit(1); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const cdp = await Cdp.connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const results = [];
for (const t of targets) {
  const url = BASE + t;
  try {
    await cdp.send('Page.navigate', { url });
    const urlOk = `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`;
    let nav = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const r = await cdp.send('Runtime.evaluate', { expression: urlOk, returnByValue: true });
      if (r.result.value) { nav = true; break; }
      await sleep(300);
    }
    if (!nav) throw new Error('timeout de carga (¿redirect a trailing slash? pásala con la barra final)');
    const isParada = t.includes('/parada');
    const marker = isParada ? " && !!document.querySelector('[data-line][style]')" : '';
    const markerExpr = `!!(document.querySelector('main') && document.querySelector('main').textContent.trim().length > 200${marker})`;
    let ok = false;
    for (let i = 0; i < (isParada ? 60 : 20); i++) {
      const r = await cdp.send('Runtime.evaluate', { expression: markerExpr, returnByValue: true });
      if (r.result.value) { ok = true; break; }
      await sleep(500);
    }
    if (!ok) console.warn(`  warn: marcador no alcanzado en ${t} (sigo igualmente)`);
    const r = await cdp.send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + String(r.exceptionDetails.exception?.description || '').slice(0, 200));
    const parsed = JSON.parse(r.result.value);
    results.push({ target: t, ...parsed });
    const excl = parsed.excluded ? `, excl ${parsed.excluded} filas canceladas` : '';
    console.log(`${t}: light=${parsed.light.count} (inc ${parsed.light.incomplete}) dark=${parsed.dark.count} (inc ${parsed.dark.incomplete})${excl}`);
    for (const n of [...parsed.light.nodes, ...parsed.dark.nodes]) {
      console.log(`   ${n.fg} sobre ${n.bg} ${n.r}:1 (req ${n.e}) · ${n.h.slice(0, 90)}`);
    }
  } catch (e) {
    results.push({ target: t, error: String(e.message || e) });
    console.log(`${t}: ERROR ${e.message}`);
  }
  await sleep(1500);
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 2), 'utf8');
const bad = results.filter((r) => !r.error && (r.light.count || r.dark.count)).length;
const errs = results.filter((r) => r.error).length;
console.log(`\n${results.length} páginas · ${bad} con violaciones · ${errs} con error · detalle en ${OUT}`);
try { await cdp.send('Browser.close'); } catch {}
setTimeout(() => proc.kill(), 1500);
process.exit(bad || errs ? 1 : 0);
