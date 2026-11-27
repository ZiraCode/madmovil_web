// Defensa en profundidad (auditoría, hallazgo 9): las URLs de terceros que llegan de feeds
// (route_url del GTFS CRTM, documentUrl de incidencias EMT) solo se pintan como href si
// son http(s). El pipeline CRTM ya filtra route_url en origen desde 2026-08-25; esto cubre
// además el feed de incidencias EMT, que pasa sin filtro por el server.
export function safeExternalUrl(url: string | null | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
