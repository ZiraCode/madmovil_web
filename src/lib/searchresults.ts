// Renderer de resultados de la búsqueda unificada (GET /search). Se usa desde DOS sitios
// con el MISMO marcado: el dropdown client-side del widget (searchwidget.ts) y la sección
// SSR de /?q=… (fallback sin JS del formulario). En modo `interactive` las filas añaden
// role="option"/id/aria-selected para la navegación por teclado del combobox.
//
// Navegación (labels DUPLICADOS entre redes — "1" es EMT + urbana + interurbana + metro):
// - Línea EMT → /linea/{label}: el label es único DENTRO de la EMT y es la URL canónica
//   de toda la web. OJO: /linea/{lineId} NO vale — el lineId de la línea "1" es "001"
//   y "001" es el label de OTRA línea real (Atocha–Moncloa): la vista resuelve por label
//   exacto y aterrizaría en la equivocada.
// - Línea CRTM → /linea/crtm/{routeId} (SIEMPRE routeId, labels duplicados entre
//   municipios y con la EMT).
// - Parada EMT → /parada/{stopId}; parada CRTM → /parada/crtm/{code} (la propia página
//   elige tablón RT para las estaciones r_*).

import { escapeHtml } from './cards';
import { chipFallbackColors, displayStopName, lineColorChipStyle, networkLabel, trimMunicipality } from './crtm';
import { crtmLineColor } from './crtmlinecolors';
import { href, t, type Locale } from './i18n';
import type { SearchLineResult, SearchNetwork, SearchResponse, SearchStopResult } from '../types/search';

export interface UnifiedSearchData {
  lines: SearchLineResult[];
  linesTotal: number;
  stops: SearchStopResult[];
  stopsTotal: number;
  degraded: Array<'emt' | 'crtm'>;
}

export function toUnifiedSearchData(res: SearchResponse): UnifiedSearchData {
  return {
    lines: res.lines.results,
    linesTotal: res.lines.count,
    stops: res.stops.results,
    stopsTotal: res.stops.count,
    degraded: res.degraded ?? [],
  };
}

export interface RenderSearchOptions {
  /** true en el dropdown (role=option + ids para aria-activedescendant) */
  interactive?: boolean;
}

// ---------------------------------------------------------------------------
// Badges de red
// ---------------------------------------------------------------------------

const BADGE_BASE = 'rounded-full px-1.5 py-px text-[10px] font-bold leading-[1.5]';
const BADGE_TONE: Record<SearchNetwork | 'bus', string> = {
  emt: 'border border-line bg-surface-2 text-ink-2',
  bus: 'border border-line bg-surface-2 text-ink-2',
  interurban: 'bg-crtm-inter-soft text-crtm-inter-ink',
  urban: 'bg-crtm-urban-soft text-crtm-urban-ink',
  ml: 'bg-crtm-ml-soft text-crtm-ml-ink',
  metro: 'bg-crtm-metro-soft text-crtm-metro-ink',
  cercanias: 'bg-crtm-cercanias-soft text-crtm-cercanias-ink',
};

function networkBadgeHtml(locale: Locale, network: SearchNetwork | 'bus'): string {
  const label =
    network === 'emt'
      ? t(locale, 'home.network.emt')
      : network === 'bus'
        ? t(locale, 'home.network.bus')
        : networkLabel(locale, network);
  return `<span class="${BADGE_BASE} ${BADGE_TONE[network]}">${escapeHtml(label)}</span>`;
}

/** Red "principal" de una parada multi-red: mezcla interurbano+urbano → badge genérico Bus */
function primaryStopNetwork(networks: SearchNetwork[]): SearchNetwork | 'bus' {
  if (networks.includes('interurban') && networks.includes('urban')) return 'bus';
  const priority: SearchNetwork[] = ['cercanias', 'metro', 'ml', 'emt', 'interurban', 'urban'];
  return priority.find((n) => networks.includes(n)) ?? 'bus';
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

const ROW = 'flex items-center gap-3 border-t border-line py-2.5 pl-3 pr-3 transition first:border-t-0 hover:bg-surface-2 active:bg-surface-2 focus-ring';
const CHEVRON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="size-4 shrink-0 text-ink-3" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
const LINE_CHIP = 'grid h-9 min-w-[44px] shrink-0 place-items-center overflow-hidden rounded-lg px-1.5 text-[13px] font-bold tabular-nums';
const STOP_TILE = 'grid h-9 w-11 shrink-0 place-items-center overflow-hidden rounded-lg text-[13px] font-bold tabular-nums';

function optionAttrs(interactive: boolean, i: number, ariaLabel: string): string {
  return interactive ? ` role="option" id="us-opt-${i}" aria-selected="false" aria-label="${escapeHtml(ariaLabel)}"` : '';
}

function lineTarget(line: SearchLineResult): string {
  return line.source === 'emt' ? `/linea/${encodeURIComponent(line.label)}` : `/linea/crtm/${encodeURIComponent(line.id)}`;
}

/** Chip de línea: color del resultado si viene; si no, paleta propia (EMT via linecolors, CRTM por red/oficial) */
function lineChipHtml(line: SearchLineResult): string {
  const label = escapeHtml(line.label);
  if (line.color) {
    const bg = `#${line.color}`;
    return `<span class="${LINE_CHIP}" style="${lineColorChipStyle(bg)}">${label}</span>`;
  }
  if (line.source === 'emt') {
    // data-line + linecolors.ts: se pinta en cliente con caché localStorage
    return `<span class="${LINE_CHIP} bg-ink text-surface" data-line="${label}">${label}</span>`;
  }
  const fallback = chipFallbackColors(line.label, line.network);
  if (fallback) {
    return `<span class="${LINE_CHIP}" style="${lineColorChipStyle(fallback.color)}">${label}</span>`;
  }
  return `<span class="crtm-badge ${LINE_CHIP}" data-network="${escapeHtml(line.network)}">${label}</span>`;
}

function lineResultHtml(locale: Locale, line: SearchLineResult, i: number, interactive: boolean): string {
  const badge = networkBadgeHtml(locale, line.network);
  const noSchedule = line.noSchedule
    ? `<span class="rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-bold text-warn-ink">${escapeHtml(t(locale, 'crtm.noScheduleTitle'))}</span>`
    : '';
  return `<a href="${href(lineTarget(line), locale)}" class="${ROW}${interactive ? ' cursor-pointer aria-selected:bg-surface-2' : ''}"${optionAttrs(interactive, i, `${t(locale, 'line.ref', { label: line.label })} · ${line.name}`)}>
${lineChipHtml(line)}
<span class="min-w-0 flex-1">
<span class="block truncate text-sm font-semibold text-ink text-pretty">${escapeHtml(displayStopName(line.name))}</span>
<span class="mt-1 flex flex-wrap items-center gap-1.5">${badge}${noSchedule}</span>
</span>
${CHEVRON}
</a>`;
}

function stopTarget(stop: SearchStopResult): string {
  return stop.source === 'crtm' ? `/parada/crtm/${encodeURIComponent(stop.id)}` : `/parada/${encodeURIComponent(stop.id)}`;
}

function stopTileHtml(stop: SearchStopResult): string {
  const codeLabel = stop.source === 'crtm' && stop.id.startsWith('r_') ? stop.id.slice(2) : stop.id;
  const code = escapeHtml(codeLabel);
  if (stop.source === 'emt') {
    return `<span class="${STOP_TILE} bg-surface-2 text-ink-2">${code}</span>`;
  }
  const net = primaryStopNetwork(stop.networks);
  // net aquí solo puede ser una red CRTM (emt se capturó arriba, bus → tono inter como antes)
  const tone = net === 'bus' ? 'bg-crtm-inter-soft text-crtm-inter-ink' : BADGE_TONE[net];
  return `<span class="${STOP_TILE} ${tone}">${code}</span>`;
}

function miniChipsHtml(stop: SearchStopResult): string {
  const max = 4;
  const chips = stop.lines.slice(0, max).map((label) => {
    const escaped = escapeHtml(label);
    if (stop.source === 'emt') {
      return `<span class="rounded bg-ink px-1.5 py-px text-[10.5px] font-bold text-surface" data-line="${escaped}">${escaped}</span>`;
    }
    // metro SOLO si TODAS las redes de la parada son metro (labels colisionan con urbanos);
    // bus homogéneo (todas interurban O todas urban) → color de esa red en SSR sin caché;
    // el resto, color por label de la caché y data-crtm-line para el repaint del buscador
    const allMetro = stop.networks.length > 0 && stop.networks.every((n) => n === 'metro');
    const busNet = stop.networks.length > 0 && stop.networks.every((n) => n === 'interurban' || n === 'urban') && new Set(stop.networks).size === 1 ? stop.networks[0] : null;
    const known = crtmLineColor(label) ?? chipFallbackColors(label, allMetro ? 'metro' : busNet);
    if (known) {
      return `<span class="rounded px-1.5 py-px text-[10.5px] font-bold" style="background:${known.color};color:${known.textColor}">${escaped}</span>`;
    }
    return `<span class="rounded bg-ink px-1.5 py-px text-[10.5px] font-bold text-surface" data-crtm-line="${escaped}">${escaped}</span>`;
  });
  const extra = stop.lines.length > max ? `<span class="text-[11px] font-semibold text-ink-3">+${stop.lines.length - max}</span>` : '';
  return chips + extra;
}

function stopResultHtml(locale: Locale, stop: SearchStopResult, i: number, interactive: boolean): string {
  const isCrtm = stop.source === 'crtm';
  const municipality = isCrtm ? trimMunicipality(stop.municipality) : '';
  const badge = networkBadgeHtml(locale, primaryStopNetwork(stop.networks));
  const ref = t(locale, isCrtm && stop.id.startsWith('r_') ? 'stop.stationRef' : 'stop.ref', { id: stop.id });
  return `<a href="${href(stopTarget(stop), locale)}" class="${ROW}${interactive ? ' cursor-pointer aria-selected:bg-surface-2' : ''}"${optionAttrs(interactive, i, `${ref} · ${stop.name}`)}>
${stopTileHtml(stop)}
<span class="min-w-0 flex-1">
<span class="block truncate text-sm font-semibold text-ink text-pretty">${escapeHtml(isCrtm ? displayStopName(stop.name) : stop.name)}</span>
<span class="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">${badge}${municipality ? `<span class="text-[11px] font-semibold text-ink-2">${escapeHtml(municipality)}</span>` : ''}${miniChipsHtml(stop)}</span>
</span>
${CHEVRON}
</a>`;
}

// ---------------------------------------------------------------------------
// Secciones
// ---------------------------------------------------------------------------

function groupHtml(headingId: string, heading: string, cardInner: string, interactive: boolean): string {
  const header = interactive
    ? `<p id="${headingId}" class="mb-1.5 px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">${escapeHtml(heading)}</p>`
    : `<p class="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">${escapeHtml(heading)}</p>`;
  const card = `<div class="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">${cardInner}</div>`;
  return interactive ? `<div role="group" aria-labelledby="${headingId}">${header}${card}</div>` : `${header}${card}`;
}

export function renderSearchResultsHtml(locale: Locale, query: string, data: UnifiedSearchData, opts: RenderSearchOptions = {}): string {
  const interactive = opts.interactive === true;
  const parts: string[] = [];

  if (data.lines.length > 0) {
    parts.push(
      groupHtml(
        'us-gh-lines',
        t(locale, 'home.linesGroup'),
        data.lines.map((l, i) => lineResultHtml(locale, l, i, interactive)).join(''),
        interactive
      )
    );
  }

  if (data.stops.length > 0) {
    parts.push(
      groupHtml(
        'us-gh-stops',
        t(locale, 'home.stopsGroup'),
        data.stops.map((s, i) => stopResultHtml(locale, s, data.lines.length + i, interactive)).join(''),
        interactive
      )
    );
  }

  if (parts.length === 0) {
    parts.push(
      `<div class="rounded-xl border border-line bg-surface px-6 py-8 text-center shadow-xs"><p class="font-semibold text-ink">${escapeHtml(t(locale, 'home.noResults', { query }))}</p><p class="mt-1 text-sm text-ink-3">${escapeHtml(t(locale, 'home.noResultsBody'))}</p></div>`
    );
  } else {
    const truncated = data.linesTotal > data.lines.length || data.stopsTotal > data.stops.length;
    if (truncated) {
      parts.push(`<p class="mt-2 px-1 text-[11px] font-medium text-ink-3">${escapeHtml(t(locale, 'home.refineSearch'))}</p>`);
    }
  }

  if (data.degraded.length > 0) {
    const sources = data.degraded.map((s) => (s === 'emt' ? 'EMT' : 'CRTM')).join(locale === 'en' ? ' and ' : ' y ');
    parts.push(
      `<p class="mt-2 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-[12px] font-medium text-warn-ink" role="status">${escapeHtml(t(locale, 'home.degraded', { sources }))}</p>`
    );
  }

  return parts.join('\n');
}
