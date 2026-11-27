// Máquina de estado compartida de los chips de línea favoritos (FavoriteLines EMT y
// FavoriteCrtmLines CRTM): estado current/interactive/busy, re-render al llegar el
// CustomEvent 'favorite:state' de FavoriteButton (con chequeo propio inicial porque el
// evento puede dispararse antes de que este módulo registre el listener) y click
// delegado que reemplaza el CONJUNTO completo de lines en localStorage. Cada componente
// aporta SOLO su chipHtml (EMT: color vía linecolors; CRTM: color por red/oficial) y el
// afterRender que necesite (EMT repinta colores tras cada render, que reconstruye el DOM).

import { getFavorite, updateFavorite } from './favorites';
import { clientLocale, t } from './i18n';

export interface FavoriteLineChipState {
  active: boolean;
  interactive: boolean;
}

export interface FavoriteLineChipsOptions {
  container: HTMLElement;
  feedback: HTMLElement | null;
  labels: string[];
  chipHtml: (label: string, state: FavoriteLineChipState) => string;
  /** Repintado tras cada render (el innerHTML reconstruye los chips) */
  afterRender?: (container: HTMLElement) => void;
  /** Identidad del botón: los chips EMT llevan data-label y los CRTM data-line */
  buttonAttr?: 'data-label' | 'data-line';
}

export function initFavoriteLineChips({ container, feedback, labels, chipHtml, afterRender, buttonAttr = 'data-label' }: FavoriteLineChipsOptions): void {
  const locale = clientLocale();
  const stopId = container.dataset.stopId ?? '';
  const selector = buttonAttr === 'data-line' ? 'button[data-line]' : 'button[data-label]';
  const datasetKey = buttonAttr === 'data-line' ? 'line' : 'label';

  let current: string[] = [];
  let interactive = false;
  let busy = false;

  function renderChips(): void {
    container.innerHTML = labels.map((label) => chipHtml(label, { active: current.includes(label), interactive })).join('');
    afterRender?.(container);
  }

  async function applyState(active: boolean): Promise<void> {
    interactive = active;
    current = active ? ((await getFavorite(stopId))?.lines ?? []) : [];
    renderChips();
  }

  let touched = false;
  window.addEventListener('favorite:state', (e) => {
    const detail = (e as CustomEvent<{ stopId: string; active: boolean }>).detail;
    if (detail.stopId !== stopId) return;
    touched = true;
    void applyState(detail.active);
  });

  void getFavorite(stopId).then((fav) => {
    if (!touched) void applyState(!!fav);
  });

  container.addEventListener('click', async (ev) => {
    if (!interactive || busy) return;
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(selector);
    if (!btn) return;
    const label = btn.dataset[datasetKey] ?? '';
    const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
    busy = true;
    try {
      await updateFavorite(stopId, { lines: next });
      current = next;
      renderChips();
      if (feedback) feedback.textContent = current.includes(label) ? t(locale, 'favLine.pinned', { label }) : t(locale, 'favLine.unpinned', { label });
    } catch (e) {
      if (feedback) feedback.textContent = e instanceof Error ? e.message : t(locale, 'favLine.updateError');
    } finally {
      busy = false;
    }
  });
}
