import qrcode from 'qrcode-generator';
import { publicUrl } from './supabase';

export const checkinUrl = (code: string) => `${publicUrl}/a/${code}`;
export const certificateUrl = (folio: string) => `${publicUrl}/c/${folio}`;
export const registerUrl = (slug: string) => `${publicUrl}/r/${slug}`;

const INK = '#1b1f2b';

/** Dibuja la matriz QR de `text` en un contexto 2D. */
export function paintQR(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = INK) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const m = size / n;
  ctx.fillStyle = color;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (q.isDark(r, c)) ctx.fillRect(Math.floor(x + c * m), Math.floor(y + r * m), Math.ceil(m), Math.ceil(m));
}

/** Ref de callback que dibuja el QR en cuanto el canvas se monta (o cambia el texto). */
export const qrCanvasRef = (text: string) => (canvas: HTMLCanvasElement | null) => {
  if (canvas) drawQRCanvas(canvas, text);
};

export function drawQRCanvas(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintQR(ctx, text, 0, 0, canvas.width);
}

const font = (w: number, s: number) => `${w} ${s}px Figtree, system-ui, sans-serif`;

/** Ajusta el tamaño de fuente para que el texto quepa en `max` px. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number) {
  let s = size;
  ctx.font = font(weight, s);
  while (s > 24 && ctx.measureText(text).width > max) {
    s -= 4;
    ctx.font = font(weight, s);
  }
}

/** Cartel imprimible (1200×1600) con el QR de asistencia de una actividad. */
export async function downloadQRPoster(opts: {
  color: string;
  eventName: string;
  type: string;
  name: string;
  meta: string;
  code: string;
  format: 'png' | 'jpeg';
  fileName: string;
}) {
  await document.fonts?.load(font(700, 92)).catch(() => undefined);
  const W = 1200, H = 1600;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = opts.color;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, 420, [0, 0, 64, 64]);
  ctx.fill();
  ctx.fillStyle = '#fff';
  fitText(ctx, `${opts.eventName} · ${opts.type}`, 600, 34, W - 180);
  ctx.fillText(`${opts.eventName} · ${opts.type}`, 90, 120);
  fitText(ctx, opts.name, 700, 92, W - 180);
  ctx.fillText(opts.name, 90, 240);
  fitText(ctx, opts.meta, 500, 38, W - 180);
  ctx.fillText(opts.meta, 90, 320);
  paintQR(ctx, checkinUrl(opts.code), 200, 520, 800);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = '600 44px ui-monospace, Menlo, monospace';
  ctx.fillText(opts.code, W / 2, 1420);
  ctx.font = font(500, 36);
  ctx.fillStyle = '#5a6070';
  ctx.fillText('Escanea para registrar tu asistencia · Aforo', W / 2, 1490);
  const a = document.createElement('a');
  a.download = `${opts.fileName}.${opts.format === 'jpeg' ? 'jpg' : 'png'}`;
  a.href = cv.toDataURL('image/' + opts.format, 0.95);
  a.click();
}
