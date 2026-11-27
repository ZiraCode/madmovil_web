// QR mínimo para export de favoritos y códigos de sincronización (F1/F2).
// qrcode-generator (MIT) genera el SVG; este wrapper registra stringToBytes UTF-8
// (el default trunca a Latin-1) y devuelve un SVG escalable blanco/negro.
import qrcode from 'qrcode-generator';
import { utf8ToBytes } from './encoding';

qrcode.stringToBytes = (s: string): number[] => Array.from(utf8ToBytes(s));

export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
}
