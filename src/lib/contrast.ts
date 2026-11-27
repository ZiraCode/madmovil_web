// Colores accesibles para chips de línea (EMT y CRTM): tinta cálida del sistema (#1c1814,
// la misma que el texto de la página) o blanco, por luminancia relativa WCAG (4.5:1).
// NUNCA negro puro: sobre los fondos claros (C1, C5, C10, C8a/b…) la tinta cumple de
// sobra, y en la banda media de luminancias (ML1 #3A7DDA, ML3, C2…) ni la tinta ni el
// blanco pasan sobre el color oficial, así que el fondo se desplaza lo MÍNIMO (pasos del
// 1%) hacia blanco (tinta) o hacia negro (blanco), eligiendo el cambio menor. Los
// textColor oficiales del API/fallbacks no se usan (blanco fijo que falla en claros).
const INK = '#1c1814';
const WHITE = '#ffffff';

function channels(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(hex: string, target: 0 | 255, t: number): string {
  const [r, g, b] = channels(hex);
  const f = (c: number): string => Math.round(c + (target - c) * t).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function accessibleChipColors(hex: string): { background: string; text: string } {
  const y = luminance(hex);
  const yInk = luminance(INK);
  if (ratio(1, y) >= 4.5) return { background: hex, text: WHITE };
  if (ratio(y, yInk) >= 4.5) return { background: hex, text: INK };
  for (let t = 0.01; t <= 0.25; t += 0.01) {
    const lighter = mix(hex, 255, t);
    if (ratio(luminance(lighter), yInk) >= 4.5) return { background: lighter, text: INK };
    const darker = mix(hex, 0, t);
    if (ratio(1, luminance(darker)) >= 4.5) return { background: darker, text: WHITE };
  }
  return { background: hex, text: INK };
}

// style inline de chip: fondo (original o ajustado) + tinta calculada
export function chipStyle(color: string): string {
  const { background, text } = accessibleChipColors(color);
  return `background:${background};color:${text}`;
}
