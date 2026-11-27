// Escaneo de QR con BarcodeDetector (Chrome/Edge/Android; en Firefox/Safari no existe →
// el botón se oculta). El stream se para al detectar código, al cerrar el diálogo (evento
// 'close' que engancha el llamador) y nunca queda abierto si el usuario navega con el
// diálogo abierto (el cierre dispara stopScan). Sin dependencias de UI: el llamador pasa
// el <video>, el <dialog> y los callbacks (cámara denegada / código leído).

type DetectedCode = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<DetectedCode[]> };
const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;

export function qrScanSupported(): boolean {
  return Boolean(BarcodeDetectorCtor && navigator.mediaDevices?.getUserMedia);
}

let scanStream: MediaStream | undefined;
let scanTimer: ReturnType<typeof setInterval> | undefined;

export function stopScan(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = undefined;
  }
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = undefined;
}

// Abre la cámara trasera, muestra el diálogo y detecta en bucle (350 ms). onPayload recibe
// el rawValue TAL CUAL del QR (la extracción del fragment #import= la hace el llamador);
// al detectar, este módulo ya ha parado el escaneo y cerrado el diálogo.
export async function startQrScan(
  video: HTMLVideoElement,
  dialog: HTMLDialogElement,
  onPayload: (rawValue: string) => void,
  onCameraError: () => void
): Promise<void> {
  if (!BarcodeDetectorCtor) return;
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    onCameraError();
    return;
  }
  video.srcObject = scanStream;
  try {
    await video.play();
  } catch {
    /* muted+playsinline: el play no debería fallar, seguimos por si acaso */
  }
  dialog.showModal();
  const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
  scanTimer = setInterval(async () => {
    try {
      const raw = (await detector.detect(video))[0]?.rawValue;
      if (raw) {
        stopScan();
        dialog.close();
        onPayload(raw);
      }
    } catch {
      /* frame aún no listo */
    }
  }, 350);
}
