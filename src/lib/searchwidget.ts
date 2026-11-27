// Widget de la búsqueda unificada (home): combobox con dropdown de resultados.
// - Debounce 300 ms (queries de 1 char son válidas: "1", "C1") y AbortController para
//   cancelar la petición obsoleta en cuanto cambia el texto
// - Navegación por teclado (flechas + Enter), Escape cierra, aria-activedescendant
// - Estados: cargando, sin resultados, degraded y error/rate limit (el 429 respeta el
//   Retry-After con cooldown local que además bloquea nuevos fetches hasta que expire)
// - Rate limit 60 req/min del endpoint: NADA de fetch por tecla sin debounce
// El marcado lo genera lib/searchresults.ts (el mismo que usa el fallback SSR de /?q=).

import { ApiError, unifiedSearch } from './api';
import { escapeHtml } from './cards';
import { paintAndFetchCrtmLineColors } from './crtmlinecolors';
import { t, type Locale } from './i18n';
import { paintAndFetchLineColors } from './linecolors';
import { renderSearchResultsHtml, toUnifiedSearchData } from './searchresults';

const DEBOUNCE_MS = 300;
export const MAX_QUERY_LEN = 60;
const LINES = 5;
const STOPS = 8;

const SPINNER =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4 shrink-0 animate-spin" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"></circle><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path></svg>';

export function initUnifiedSearch(root: HTMLElement, locale: Locale): void {
  const input = root.querySelector<HTMLInputElement>('input[name="q"]');
  const panel = root.querySelector<HTMLElement>('[data-us-panel]');
  const body = root.querySelector<HTMLElement>('[data-us-body]');
  const form = root.querySelector<HTMLFormElement>('form');
  if (!input || !panel || !body || !form) return;

  let options: HTMLAnchorElement[] = [];
  let active = -1;
  let controller: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let cooldownUntil = 0;

  const isOpen = (): boolean => !panel.classList.contains('hidden');

  const clearActive = (): void => {
    if (active >= 0 && options[active]) options[active].setAttribute('aria-selected', 'false');
    active = -1;
    input.removeAttribute('aria-activedescendant');
  };

  const open = (): void => {
    panel.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  };

  const close = (): void => {
    panel.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    clearActive();
  };

  const render = (html: string): void => {
    body.innerHTML = html;
    options = Array.from(body.querySelectorAll('a[role="option"]'));
    clearActive();
  };

  const renderLoading = (): void => {
    render(`<div class="flex items-center gap-2.5 px-3 py-4 text-sm font-medium text-ink-3">${SPINNER}${escapeHtml(t(locale, 'home.searching'))}</div>`);
  };

  const renderNote = (message: string): void => {
    render(
      `<div class="m-1 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 text-[13px] font-medium text-warn-ink" role="status">${escapeHtml(message)}</div>`
    );
  };

  const renderTooLong = (): void => {
    render(
      `<div class="px-4 py-5 text-center"><p class="text-sm font-semibold text-ink">${escapeHtml(t(locale, 'home.queryTooLong'))}</p><p class="mt-1 text-xs text-ink-3">${escapeHtml(t(locale, 'home.queryTooLongBody'))}</p></div>`
    );
  };

  const scheduleRetry = (q: string, ms: number): void => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (isOpen() && input.value.trim() === q) void search(q);
    }, ms);
  };

  const search = async (q: string): Promise<void> => {
    // Cooldown tras un 429: no martilleamos el endpoint mientras expira Retry-After
    const waiting = cooldownUntil - Date.now();
    if (waiting > 0) {
      const sec = Math.ceil(waiting / 1000);
      renderNote(t(locale, 'home.rateLimited', { sec }));
      scheduleRetry(q, waiting);
      return;
    }
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    renderLoading();
    try {
      const res = await unifiedSearch(q, { lines: LINES, stops: STOPS, signal });
      if (signal.aborted) return;
      render(renderSearchResultsHtml(locale, q, toUnifiedSearchData(res), { interactive: true }));
      void paintAndFetchLineColors(body);
      void paintAndFetchCrtmLineColors(body);
    } catch (err) {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      if (err instanceof ApiError && err.status === 429) {
        const wait = Math.min(Math.max(err.retryAfterSec ?? 30, 3), 90);
        cooldownUntil = Date.now() + wait * 1000;
        renderNote(t(locale, 'home.rateLimited', { sec: wait }));
        scheduleRetry(q, wait * 1000);
      } else {
        renderNote(t(locale, 'home.searchError'));
      }
    }
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    controller?.abort();
    if (!q) {
      close();
      return;
    }
    open();
    if (q.length > MAX_QUERY_LEN) {
      renderTooLong();
      return;
    }
    renderLoading();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void search(q);
    }, DEBOUNCE_MS);
  });

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && isOpen() && options.length > 0) {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      let idx = active + delta;
      if (idx >= options.length) idx = 0;
      if (idx < 0) idx = options.length - 1;
      clearActive();
      active = idx;
      const el = options[idx];
      el.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', el.id);
      el.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && isOpen() && options.length > 0) {
      e.preventDefault();
      const target = options[Math.max(active, 0)];
      if (target) window.location.assign(target.getAttribute('href') ?? '/');
    } else if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation();
      close();
    }
  });

  form.addEventListener('submit', (e) => {
    // Con dropdown abierto la navegación ya está aquí (Enter/clic); si está cerrado con
    // texto, el GET deja que el server renderice los resultados (?q=), como sin JS
    if (isOpen() && options.length > 0) {
      e.preventDefault();
      const target = options[Math.max(active, 0)];
      if (target) window.location.assign(target.getAttribute('href') ?? '/');
    } else if (!input.value.trim()) {
      e.preventDefault();
    }
  });

  // Clic fuera del bloque de búsqueda cierra el dropdown
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && e.target instanceof Node && !root.contains(e.target)) close();
  });

  // El foco que sale del bloque (Tab) también cierra
  root.addEventListener('focusout', (e) => {
    if (isOpen() && (!(e.relatedTarget instanceof Node) || !root.contains(e.relatedTarget))) close();
  });
}
