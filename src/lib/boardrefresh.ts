// Esqueleto de refresco compartido de los tablones (ArrivalsBoard EMT y
// CrtmArrivalsBoard CRTM): auto-refresh pausado con la pestaña oculta (refetch al
// volver), botón manual y tick de reloj. Reglas:
// - UN solo refresh en vuelo: el nuevo aborta al anterior (el signal llega al fetch del
//   board, así una respuesta tardía no puede pisar los datos de una más fresca).
// - Con document.hidden se pausan AMBOS intervalos (refresh y tick): antes el tick
//   seguía recalculando y escribiendo en el DOM con la pestaña oculta.

export interface BoardRefreshOptions {
  refresh: (signal: AbortSignal) => Promise<void>;
  refreshButton?: HTMLElement | null;
  refreshMs: number;
  tick: () => void;
  tickMs: number;
  // Refresco inmediato al arrancar: lo pide el board CRTM cuando su SSR salió degradado,
  // porque ese HTML puede llevar hasta 5 min cacheado en edge con la señal available
  // false de un snapshot del server que ya se recuperó
  refreshOnStart?: boolean;
}

export function startBoardRefresh({ refresh, refreshButton, refreshMs, tick, tickMs, refreshOnStart }: BoardRefreshOptions): void {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let inFlight: AbortController | undefined;

  function runRefresh(): void {
    inFlight?.abort();
    inFlight = new AbortController();
    void refresh(inFlight.signal);
  }

  function startAutoRefresh(): void {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!document.hidden) runRefresh();
    }, refreshMs);
  }

  function startTick(): void {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      if (!document.hidden) tick();
    }, tickMs);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    } else {
      runRefresh();
      startAutoRefresh();
      startTick();
    }
  });

  refreshButton?.addEventListener('click', () => runRefresh());

  tick();
  startTick();
  startAutoRefresh();
  if (refreshOnStart) runRefresh();
}
