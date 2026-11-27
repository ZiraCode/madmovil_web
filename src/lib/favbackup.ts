// Copia de seguridad de favoritos (F1): export por archivo, QR (si el JSON cabe) y enlace
// con fragment #import= (nunca viaja al server), import por archivo/QR/enlace con confirm
// previo del plan (nuevas/sustituidas/sin cambios). El feedback (#backup-feedback, con
// auto-ocultado) vive aquí y lo reusa también el panel de sincronización (SyncPanel.astro).

import { applyImport, exportFavoritesJson, parseImportedFavorites, planImport } from './favorites';
import { base64urlToBytes, bytesToBase64url, bytesToUtf8, utf8ToBytes } from './encoding';
import { qrSvg } from './qr';
import { qrScanSupported, startQrScan, stopScan } from './qrscan';
import { clientLocale, href, t, tN } from './i18n';

const locale = clientLocale();

const QR_JSON_MAX_BYTES = 1200;

const backupFeedback = document.getElementById('backup-feedback')!;
// El feedback vive dentro del <details> colapsable de backup y esta función la reusa
// SyncPanel: hay que ABRIRLO para que el mensaje (y su live region role=status) se
// vean y se anuncien, venga de un botón de backup, del panel de sync o de un hash
const feedbackDetails = backupFeedback.closest('details');
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

export function showBackupFeedback(message: string, tone: 'info' | 'error' = 'info'): void {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (feedbackDetails) feedbackDetails.open = true;
  backupFeedback.textContent = message;
  backupFeedback.classList.toggle('text-danger-ink', tone === 'error');
  backupFeedback.classList.toggle('text-ink-2', tone !== 'error');
  backupFeedback.classList.remove('hidden');
  feedbackTimer = setTimeout(() => backupFeedback.classList.add('hidden'), 6000);
}

export interface FavBackupDeps {
  /** Nº de favoritos actuales (los exports avisan si la lista está vacía) */
  favCount(): number;
  /** Recargar la lista tras un import (la página re-renderiza con el merge aplicado) */
  reloadList(): Promise<void>;
}

// El enlace lleva el JSON en un fragment: nunca viaja al server ni queda en logs
export function importUrl(json: string): string {
  return `${location.origin}${href('/favoritos', locale)}#import=${bytesToBase64url(utf8ToBytes(json))}`;
}

// Acepta JSON directo o un payload base64url (enlace/QR)
export function payloadToRawJson(payload: string): string {
  const s = payload.trim();
  if (s.startsWith('{') || s.startsWith('[')) return s;
  try {
    return bytesToUtf8(base64urlToBytes(s));
  } catch {
    return s;
  }
}

export async function runImport(raw: string, deps: FavBackupDeps): Promise<void> {
  const incoming = parseImportedFavorites(payloadToRawJson(raw));
  const plan = planImport(incoming);
  const summary = [
    tN(locale, plan.added.length, 'backup.newFav'),
    tN(locale, plan.replaced.length, 'backup.replacedFav'),
    tN(locale, plan.unchanged.length, 'backup.unchangedFav'),
  ].join(' · ');
  if (!window.confirm(`${summary}\n\n${t(locale, 'backup.importQuestion')}`)) return;
  applyImport(plan);
  showBackupFeedback(t(locale, 'backup.importedMsg', { summary }));
  await deps.reloadList();
}

// Enlace de importación: #import= al cargar → importar y limpiar el hash (history.replaceState)
export function consumeImportHash(deps: FavBackupDeps): void {
  const hash = location.hash;
  if (!hash.toLowerCase().startsWith('#import=')) return;
  // El hash se limpia SIEMPRE (también con el payload roto): un enlace truncado no debe
  // dejar la página colgada ni conservar el fragmento inválido
  history.replaceState(null, '', location.pathname + location.search);
  let payload: string;
  try {
    payload = decodeURIComponent(hash.slice('#import='.length));
  } catch {
    showBackupFeedback(t(locale, 'backup.importError'), 'error');
    return;
  }
  void runImport(payload, deps).catch((e: unknown) => showBackupFeedback(e instanceof Error ? e.message : t(locale, 'backup.importError'), 'error'));
}

function importFailMessage(e: unknown): string {
  return e instanceof Error ? e.message : t(locale, 'backup.importError');
}

export function initFavoriteBackup(deps: FavBackupDeps): void {
  const exportBtn = document.getElementById('backup-export') as HTMLButtonElement;
  const qrBtn = document.getElementById('backup-qr') as HTMLButtonElement;
  const linkBtn = document.getElementById('backup-link') as HTMLButtonElement;
  const importBtn = document.getElementById('backup-import') as HTMLButtonElement;
  const scanBtn = document.getElementById('backup-scan') as HTMLButtonElement;
  const fileInput = document.getElementById('backup-file') as HTMLInputElement;
  const qrDialog = document.getElementById('backup-qr-dialog') as HTMLDialogElement;
  const qrHolder = document.getElementById('backup-qr-holder')!;
  const scanDialog = document.getElementById('backup-scan-dialog') as HTMLDialogElement;
  const scanVideo = document.getElementById('backup-scan-video') as HTMLVideoElement;

  exportBtn.addEventListener('click', () => {
    if (deps.favCount() === 0) {
      showBackupFeedback(t(locale, 'backup.empty'));
      return;
    }
    const blob = new Blob([exportFavoritesJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'madmovil-favoritos.json';
    // En el documento y revocación diferida: el click síncrono + revoke inmediato han
    // roto descargas en WebKit/Firefox (appendChild: el append del Element de
    // HTMLRewriter (worker-configuration.d.ts) oculta el ParentNode.append del DOM)
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  qrBtn.addEventListener('click', () => {
    if (deps.favCount() === 0) {
      showBackupFeedback(t(locale, 'backup.empty'));
      return;
    }
    const json = exportFavoritesJson();
    const bytes = utf8ToBytes(json).length;
    if (bytes > QR_JSON_MAX_BYTES) {
      showBackupFeedback(t(locale, 'backup.qrTooBig', { n: bytes, max: QR_JSON_MAX_BYTES }));
      return;
    }
    try {
      qrHolder.innerHTML = qrSvg(importUrl(json));
      qrDialog.showModal();
    } catch {
      showBackupFeedback(t(locale, 'backup.qrTooBig', { n: bytes, max: QR_JSON_MAX_BYTES }), 'error');
    }
  });

  linkBtn.addEventListener('click', async () => {
    if (deps.favCount() === 0) {
      showBackupFeedback(t(locale, 'backup.empty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(importUrl(exportFavoritesJson()));
      showBackupFeedback(t(locale, 'backup.linkCopied'));
    } catch {
      showBackupFeedback(t(locale, 'backup.linkCopyError'), 'error');
    }
  });

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      await runImport(await file.text(), deps);
    } catch (e) {
      showBackupFeedback(importFailMessage(e), 'error');
    }
  });

  // Escaneo con BarcodeDetector (Chrome/Edge/Android; Firefox/Safari sin soporte → botón oculto)
  if (!qrScanSupported()) scanBtn.classList.add('hidden');

  scanBtn.addEventListener('click', () => {
    void startQrScan(
      scanVideo,
      scanDialog,
      (rawValue) => {
        const payload = rawValue.includes('#import=') ? rawValue.slice(rawValue.indexOf('#import=') + '#import='.length) : rawValue;
        void runImport(payload, deps).catch((e: unknown) => showBackupFeedback(importFailMessage(e), 'error'));
      },
      () => showBackupFeedback(t(locale, 'backup.scanError'), 'error')
    );
  });

  scanDialog.addEventListener('close', stopScan);

  document.querySelectorAll<HTMLButtonElement>('[data-dialog-close]').forEach((btn) => btn.addEventListener('click', () => btn.closest('dialog')?.close()));
}
