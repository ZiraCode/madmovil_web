// Vault de sincronización de favoritos: copia cifrada E2E en el backend, autorizada por
// posesión de un código secreto de 24 chars (base32 Crockford, 120 bits).
//   código →decode→ master 15 B →HKDF-SHA256→ authToken (base64url, Bearer) + clave AES-GCM-256
// El server jamás ve el código ni los favoritos en claro (solo el blob opaco). Contrato:
// POST /api/favorites/vault {payload,nonce,turnstileToken} (409 si existe) · GET (200|404) ·
// PUT (solo si existe) · DELETE — payload/nonce base64, payload ≤12 KB.
// Todo Web Crypto nativo, cero dependencias.
import { API_BASE_URL } from './config';
import { base64ToBytes, bytesToBase64, bytesToBase64url, bytesToUtf8, utf8ToBytes } from './encoding';
import { applyImport, exportFavoritesJson, getLocalFavorites, parseFavoritesDoc, planImport, sameFavorites } from './favorites';

// —— Código secreto (base32 Crockford: sin I, L, O, U) ——————————————————————————

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SECRET_RE = new RegExp(`^[${CROCKFORD_ALPHABET}]{24}$`);

/** 15 bytes aleatorios → 24 chars base32 Crockford (120 bits, sin padding) */
function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let value = 0;
  let bits = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD_ALPHABET[(value >>> bits) & 31];
    }
  }
  return out;
}

export function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join('-') ?? secret;
}

/** Normalización al INTRODUCIR un código: mayúsculas, sin espacios/guiones, ambiguos de
 *  Crockford fuera (O→0, I/L→1). Devuelve los 24 chars canónicos o null si no es válido. */
export function normalizeSecret(input: string): string | null {
  const clean = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return SECRET_RE.test(clean) ? clean : null;
}

function decodeSecret(secret: string): Uint8Array {
  const out = new Uint8Array(15);
  let value = 0;
  let bits = 0;
  let pos = 0;
  for (const ch of secret) {
    const idx = CROCKFORD_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid-secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (value >>> bits) & 0xff;
    }
  }
  return out;
}

// —— Derivación y cifrado —————————————————————————————————————————————————————

export interface VaultKeys {
  authToken: string;
  encKey: CryptoKey;
}

async function deriveVaultKeys(secret: string): Promise<VaultKeys> {
  const master = await crypto.subtle.importKey('raw', decodeSecret(secret) as unknown as BufferSource, 'HKDF', false, ['deriveBits']);
  const params = (info: Uint8Array) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: info as unknown as BufferSource });
  const auth = new Uint8Array(await crypto.subtle.deriveBits(params(utf8ToBytes('madmovil:favorites:v1:auth')), master, 256));
  const enc = await crypto.subtle.deriveBits(params(utf8ToBytes('madmovil:favorites:v1:enc')), master, 256);
  const encKey = await crypto.subtle.importKey('raw', enc, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { authToken: bytesToBase64url(auth), encKey };
}

/** AES-GCM con IV aleatorio de 96 bits por actualización (nunca reutilizar nonce) */
async function encryptVault(encKey: CryptoKey, json: string): Promise<{ payload: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as BufferSource }, encKey, utf8ToBytes(json) as unknown as BufferSource);
  return { payload: bytesToBase64(new Uint8Array(cipher)), nonce: bytesToBase64(iv) };
}

async function decryptVault(encKey: CryptoKey, payload: string, nonce: string): Promise<string> {
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(nonce) as unknown as BufferSource },
    encKey,
    base64ToBytes(payload) as unknown as BufferSource
  );
  return bytesToUtf8(new Uint8Array(clear));
}

// —— Cliente del API ———————————————————————————————————————————————————————————

export type VaultErrorCode = 'network' | 'not-found' | 'exists' | 'corrupt' | 'too-big' | 'forbidden' | 'error';

const MAX_PAYLOAD_B64_CHARS = 12 * 1024;
/** 12 KB de base64 ≈ 9,2 KB de ciphertext ≈ 9,2 KB de claro (tag GCM incluido) */
const MAX_CLEAR_BYTES = 9000;

async function vaultFetch(authToken: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/favorites/vault`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
}

async function readMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: string };
    return body?.message;
  } catch {
    return undefined;
  }
}

export type VaultGetResult =
  | { ok: true; payload: string; nonce: string; updatedAt: string }
  | { ok: false; error: { code: VaultErrorCode; message?: string } };

async function getVault(authToken: string): Promise<VaultGetResult> {
  let res: Response;
  try {
    res = await vaultFetch(authToken, 'GET');
  } catch {
    return { ok: false, error: { code: 'network' } };
  }
  if (res.status === 404) return { ok: false, error: { code: 'not-found' } };
  if (!res.ok) return { ok: false, error: { code: 'error', message: await readMessage(res) } };
  const body = (await res.json()) as { data?: { payload?: string; nonce?: string; updatedAt?: string } };
  if (typeof body.data?.payload !== 'string' || typeof body.data?.nonce !== 'string') {
    return { ok: false, error: { code: 'error' } };
  }
  return { ok: true, payload: body.data.payload, nonce: body.data.nonce, updatedAt: body.data.updatedAt ?? '' };
}

export type VaultWriteResult = { ok: true } | { ok: false; error: { code: VaultErrorCode; message?: string } };

async function createVault(
  authToken: string,
  payload: string,
  nonce: string,
  turnstileToken: string
): Promise<VaultWriteResult> {
  let res: Response;
  try {
    res = await vaultFetch(authToken, 'POST', { payload, nonce, turnstileToken });
  } catch {
    return { ok: false, error: { code: 'network' } };
  }
  if (res.status === 201) return { ok: true };
  const message = await readMessage(res);
  if (res.status === 409) return { ok: false, error: { code: 'exists', message } };
  if (res.status === 403) return { ok: false, error: { code: 'forbidden', message } };
  if (res.status === 413) return { ok: false, error: { code: 'too-big', message } };
  return { ok: false, error: { code: 'error', message } };
}

async function putVault(authToken: string, payload: string, nonce: string): Promise<VaultWriteResult> {
  let res: Response;
  try {
    res = await vaultFetch(authToken, 'PUT', { payload, nonce });
  } catch {
    return { ok: false, error: { code: 'network' } };
  }
  if (res.ok) return { ok: true };
  const message = await readMessage(res);
  if (res.status === 404) return { ok: false, error: { code: 'not-found', message } };
  if (res.status === 413) return { ok: false, error: { code: 'too-big', message } };
  return { ok: false, error: { code: 'error', message } };
}

async function deleteVault(authToken: string): Promise<VaultWriteResult> {
  let res: Response;
  try {
    res = await vaultFetch(authToken, 'DELETE');
  } catch {
    return { ok: false, error: { code: 'network' } };
  }
  if (res.ok) return { ok: true };
  const message = await readMessage(res);
  if (res.status === 404) return { ok: false, error: { code: 'not-found', message } };
  return { ok: false, error: { code: 'error', message } };
}

// —— Turnstile (solo la CREACIÓN lleva reto anti-bot) ————————————————————————

export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId?: string): void;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | undefined;

/** Inyecta challenges.cloudflare.com/turnstile/v0/api.js una vez (render explícito) */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileLoader ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else {
        // Igual que onerror: sin reset, el rechazo queda memoizado y "Crear código" no
        // puede reintentar sin recargar la página
        turnstileLoader = undefined;
        reject(new Error('turnstile-missing-global'));
      }
    };
    script.onerror = () => {
      turnstileLoader = undefined;
      reject(new Error('turnstile-load-error'));
    };
    document.head.appendChild(script);
  });
  return turnstileLoader;
}

// —— Estado local del master ———————————————————————————————————————————————————
// localStorage SOLO si el usuario activa "recordar en este dispositivo"; si no,
// sessionStorage (vive mientras la pestaña). Borrar datos del navegador sin el código
// anotado = perder el vault (avisado en la UI).

const STORE_KEY = 'madmovil:vault';
const SESSION_KEY = 'madmovil:vault-session';
const STATUS_KEY = 'madmovil:vault-status';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Código activo en este navegador (recordado o de sesión) */
export function activeCode(): string | null {
  const raw = safeGet(STORE_KEY) ?? safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: string };
    return typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

export function storeCode(code: string, remember: boolean): void {
  try {
    if (remember) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.setItem(STORE_KEY, JSON.stringify({ code }));
    } else {
      localStorage.removeItem(STORE_KEY);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code }));
    }
  } catch {
    /* storage bloqueado: el engine en memoria sigue funcionando esta visita */
  }
}

function forgetCode(): void {
  try {
    localStorage.removeItem(STORE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STATUS_KEY);
  } catch {
    /* noop */
  }
}

// —— Estado visible de la sincronización ————————————————————————————————————————

export interface VaultStatus {
  state: 'ok' | 'syncing' | 'error';
  lastSyncAt: string | null;
  error?: VaultErrorCode;
  message?: string;
}

export function readVaultStatus(): VaultStatus | null {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? 'null') as VaultStatus | null;
  } catch {
    return null;
  }
}

function writeVaultStatus(status: VaultStatus | null): void {
  try {
    if (status) localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    else localStorage.removeItem(STATUS_KEY);
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent('vault:status', { detail: status }));
}

function statusWith(prev: VaultStatus | null, patch: Partial<VaultStatus>): VaultStatus {
  return { lastSyncAt: prev?.lastSyncAt ?? null, ...patch } as VaultStatus;
}

// —— Motor de sincronización ————————————————————————————————————————————————————
// pull al abrir (GET → decrypt → merge por savedAt → PUT del resultado) y push al
// modificar (debounce ~3 s, evento 'favorites:changed' de favorites.ts).

let engine: VaultKeys | null = null;
let listenersAttached = false;
let suppressPush = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<unknown> = Promise.resolve();

function enqueue(op: () => Promise<unknown>): Promise<unknown> {
  chain = chain.then(op, op);
  return chain;
}

function attachListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('favorites:changed', () => {
    if (suppressPush || !engine) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void enqueue(() => pushNow()), 3000);
  });
}

/** Arranque site-wide (script del Layout): pull al abrir si hay código activo */
export function initVaultSync(): void {
  const code = activeCode();
  if (!code) return;
  attachListeners();
  void (async () => {
    try {
      engine = await deriveVaultKeys(code);
    } catch {
      return;
    }
    await enqueue(() => pull());
  })();
}

async function pull(): Promise<void> {
  if (!engine) return;
  const prev = readVaultStatus();
  writeVaultStatus(statusWith(prev, { state: 'syncing' }));
  const remote = await getVault(engine.authToken);
  if (!remote.ok) {
    writeVaultStatus(statusWith(prev, { state: 'error', error: remote.error.code, message: remote.error.message }));
    return;
  }
  let favorites: ReturnType<typeof parseFavoritesDoc>;
  try {
    favorites = parseFavoritesDoc(await decryptVault(engine.encKey, remote.payload, remote.nonce), { allowEmpty: true });
  } catch {
    writeVaultStatus(statusWith(prev, { state: 'error', error: 'corrupt' }));
    return;
  }
  const plan = planImport(favorites);
  if (plan.added.length > 0 || plan.replaced.length > 0) {
    suppressPush = true;
    try {
      applyImport(plan);
    } finally {
      suppressPush = false;
    }
  }
  // El PUT del pull solo si el remoto NO refleja ya los favoritos locales: el payload
  // lleva exportedAt (nuevo en cada export), así que sin esto cada carga de página
  // pagaba un PUT + un cifrado AES-GCM aunque nada hubiese cambiado
  if (sameFavorites(getLocalFavorites(), favorites)) {
    writeVaultStatus({ state: 'ok', lastSyncAt: new Date().toISOString() });
    return;
  }
  await pushNow();
}

async function pushNow(): Promise<boolean> {
  if (!engine) return false;
  const json = exportFavoritesJson();
  if (utf8ToBytes(json).length > MAX_CLEAR_BYTES) {
    writeVaultStatus({ state: 'error', lastSyncAt: readVaultStatus()?.lastSyncAt ?? null, error: 'too-big' });
    return false;
  }
  const enc = await encryptVault(engine.encKey, json);
  if (enc.payload.length > MAX_PAYLOAD_B64_CHARS) {
    writeVaultStatus({ state: 'error', lastSyncAt: readVaultStatus()?.lastSyncAt ?? null, error: 'too-big' });
    return false;
  }
  const res = await putVault(engine.authToken, enc.payload, enc.nonce);
  if (res.ok) {
    writeVaultStatus({ state: 'ok', lastSyncAt: new Date().toISOString() });
    return true;
  }
  writeVaultStatus({ state: 'error', lastSyncAt: readVaultStatus()?.lastSyncAt ?? null, error: res.error.code, message: res.error.message });
  return false;
}

/** "Sincronizar ahora": pull manual (merge + PUT) */
export function syncNow(): void {
  if (!engine) return;
  void enqueue(() => pull());
}

/** Activar un código existente en este dispositivo (introducido a mano o vía #sync=):
 *  GET → decrypt → merge → PUT → guardar master. Devuelve el resultado para la UI. */
export async function activateVault(code: string, remember: boolean): Promise<VaultErrorCode | 'ok'> {
  let keys: VaultKeys;
  try {
    keys = await deriveVaultKeys(code);
  } catch {
    return 'corrupt';
  }
  const remote = await getVault(keys.authToken);
  if (!remote.ok) return remote.error.code;
  let favorites: ReturnType<typeof parseFavoritesDoc>;
  try {
    favorites = parseFavoritesDoc(await decryptVault(keys.encKey, remote.payload, remote.nonce), { allowEmpty: true });
  } catch {
    return 'corrupt';
  }
  storeCode(code, remember);
  engine = keys;
  attachListeners();
  const plan = planImport(favorites);
  if (plan.added.length > 0 || plan.replaced.length > 0) {
    suppressPush = true;
    try {
      applyImport(plan);
    } finally {
      suppressPush = false;
    }
  }
  const pushed = await pushNow();
  if (!pushed) {
    const error = readVaultStatus()?.error;
    if (error === 'too-big' || error === 'not-found') return error;
  }
  return 'ok';
}

export type CreateResult = { ok: true; secret: string } | { ok: false; outcome: Exclude<VaultErrorCode, 'corrupt'>; message?: string };

/** Crear vault nuevo: genera código, deriva, cifra los favoritos actuales y hace POST
 *  (con el token de Turnstile). Guarda el master (recordar=true; la UI puede degradarlo
 *  a sesión con storeCode(code,false)). El código se devuelve para mostrarlo UNA vez. */
export async function createVaultWithTurnstile(turnstileToken: string): Promise<CreateResult> {
  const secret = generateSecret();
  // WebCrypto puede lanzar (contexto no seguro, navegador viejo): sin esto la promesa
  // se rechaza desde el callback de Turnstile y el botón queda en "Creando…" para siempre
  let keys: VaultKeys;
  let enc: { payload: string; nonce: string };
  try {
    keys = await deriveVaultKeys(secret);
    const json = exportFavoritesJson();
    if (utf8ToBytes(json).length > MAX_CLEAR_BYTES) return { ok: false, outcome: 'too-big' };
    enc = await encryptVault(keys.encKey, json);
  } catch {
    return { ok: false, outcome: 'error' };
  }
  const res = await createVault(keys.authToken, enc.payload, enc.nonce, turnstileToken);
  if (!res.ok) {
    const outcome = res.error.code === 'corrupt' ? 'error' : res.error.code;
    return { ok: false, outcome, message: res.error.message };
  }
  storeCode(secret, true);
  engine = keys;
  attachListeners();
  writeVaultStatus({ state: 'ok', lastSyncAt: new Date().toISOString() });
  return { ok: true, secret };
}

/** Desactivar en este dispositivo (la copia remota sigue en la nube) */
export function deactivateVault(): void {
  engine = null;
  clearTimeout(pushTimer);
  forgetCode();
  writeVaultStatus(null);
}

/** Borrar la copia remota (DELETE) y desactivar */
export async function deleteRemoteVault(): Promise<VaultWriteResult> {
  let keys = engine;
  if (!keys) {
    const code = activeCode();
    if (!code) return { ok: false, error: { code: 'not-found' } };
    keys = await deriveVaultKeys(code);
  }
  const res = await deleteVault(keys.authToken);
  if (res.ok) deactivateVault();
  return res;
}
