import { paintQR, certificateUrl } from './qr';
import type { Signer } from './types';
import { durationLabel, longDate, rangeLong, dayShort, timeRange } from './format';

/** Medidas base del diseño (vista previa de 3a); se escala al exportar. */
const BW = 664;
const BH = 513;

export interface CertificateData {
  color: string;
  eventName: string;
  organizer: string;
  acronym: string;
  logoUrl: string | null;
  folio: string | null;
  personName: string;
  /** Texto con segmentos **en negritas**. */
  body: string;
  /** Encabezado; por defecto «Constancia de asistencia». */
  title?: string;
  list?: string[];
  /** Hasta 2 logos adicionales (esquina superior derecha). */
  extraLogos?: string[];
  /** Imagen de fondo a toda la hoja (carta horizontal). */
  background?: string | null;
  signers: Signer[];
  showVerification: boolean;
}

const FEMININE = new Set(['conferencia', 'ceremonia', 'exposición', 'comida', 'charla', 'clase', 'muestra']);

interface ActivityLike {
  type: string;
  name: string;
  speaker: string;
  day: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Sustituye los campos {nombre}, {actividad}, {tipo}, {fecha}, {duración}, {evento}, {ponente}, {fechas}, {rol}
 * y ajusta artículos/concordancia en español ("al taller" / "a la conferencia").
 */
export function renderTemplate(
  template: string,
  v: { person: string; activity?: ActivityLike | null; eventName: string; start: string; end: string; role?: string },
) {
  let t = template;
  const a = v.activity;
  const tipo = a ? a.type.toLowerCase() : '';
  const fem = FEMININE.has(tipo);
  if (a) {
    if (fem) {
      t = t.replace(/\bal \{tipo\}/g, 'a la {tipo}').replace(/\bimpartido\b/g, 'impartida').replace(/\brealizado\b/g, 'realizada');
    }
    if (!a.speaker) t = t.replace(/,?\s*impartid[oa] por \{ponente\}/g, '');
  }
  const map: Record<string, string> = {
    nombre: `**${v.person}**`,
    actividad: a ? `**${a.name}**` : '',
    tipo,
    fecha: a ? `**${longDate(a.day)}**` : '',
    'duración': a ? `**${durationLabel(a.starts_at, a.ends_at)}**` : '',
    duracion: a ? `**${durationLabel(a.starts_at, a.ends_at)}**` : '',
    evento: `**${v.eventName}**`,
    ponente: a?.speaker ?? '',
    fechas: `**${rangeLong(v.start, v.end)}**`,
    rol: v.role ? `**${v.role.toLowerCase()}**` : '',
  };
  return t.replace(/\{([a-záéíóúñ]+)\}/gi, (m, k: string) => map[k.toLowerCase()] ?? m);
}

export const activityLine = (a: ActivityLike) => `${a.type} · ${a.name} · ${dayShort(a.day)} · ${timeRange(a.starts_at, a.ends_at)}`;

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url))
    imgCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
    );
  return imgCache.get(url)!;
}

const F = (w: number, s: number) => `${w} ${s}px Figtree, system-ui, sans-serif`;
const INK = '#1b1f2b';
const MUTED = '#5a6070';

type Seg = { text: string; bold: boolean };
function segments(body: string): Seg[] {
  return body.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((s) =>
    s.startsWith('**') ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false });
}

/** Parte un texto con negritas en líneas que caben en `width`. */
function wrapRich(ctx: CanvasRenderingContext2D, body: string, size: number, width: number) {
  const words: Seg[] = [];
  for (const s of segments(body))
    for (const part of s.text.split(/(\s+)/)) if (part) words.push({ text: part, bold: s.bold });
  const lines: Seg[][] = [[]];
  let w = 0;
  for (const word of words) {
    ctx.font = F(word.bold ? 700 : 400, size);
    const ww = ctx.measureText(word.text).width;
    const isSpace = /^\s+$/.test(word.text);
    if (!isSpace && w + ww > width && lines[lines.length - 1].length) {
      lines.push([]);
      w = 0;
    }
    if (isSpace && w === 0) continue;
    lines[lines.length - 1].push(word);
    w += ww;
  }
  return lines;
}

/** Dibuja una imagen completa dentro de un recuadro, sin deformarla. Devuelve el ancho usado. */
function fitContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, maxW: number, maxH: number, align: 'left' | 'right') {
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, align === 'right' ? x + maxW - w : x, y + (maxH - h) / 2, w, h);
  return w;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Dibuja la constancia en un canvas (proporción carta horizontal 11 × 8.5). */
export async function drawCertificate(canvas: HTMLCanvasElement, d: CertificateData, scale = 2) {
  await document.fonts?.load(F(700, 44)).catch(() => undefined);
  const extras = (d.extraLogos ?? []).filter(Boolean).slice(0, 2);
  const [logo, bg, ...rest] = await Promise.all([
    loadImage(d.logoUrl), loadImage(d.background), ...extras.map(loadImage), ...d.signers.map((s) => loadImage(s.signature_url)),
  ]);
  const extraImgs = rest.slice(0, extras.length).filter((x): x is HTMLImageElement => !!x);
  const sigs = rest.slice(extras.length);
  canvas.width = BW * scale;
  canvas.height = BH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, BW, BH);
  if (bg) {
    // fondo a toda la hoja, recortado para cubrir sin deformarse
    const k = Math.max(BW / bg.width, BH / bg.height);
    ctx.drawImage(bg, (BW - bg.width * k) / 2, (BH - bg.height * k) / 2, bg.width * k, bg.height * k);
  } else {
    ctx.fillStyle = d.color;
    ctx.fillRect(0, 0, 14, BH);
  }
  ctx.textBaseline = 'alphabetic';

  // Encabezado: logo del evento completo (sin deformar) y, a la derecha, hasta 2 logos más
  const L = 48, R = BW - 48;
  const LOGO_H = 52;
  let textX = L + 64;
  if (logo) {
    const w = fitContain(ctx, logo, L, 40, 150, LOGO_H, 'left');
    textX = L + w + 12;
  } else {
    ctx.fillStyle = d.color;
    roundRect(ctx, L, 40, 52, 52, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = F(700, 15);
    ctx.fillText(d.acronym || '', L + 6, 40 + 46);
  }
  let right = R;
  for (const img of [...extraImgs].reverse()) {
    const w = fitContain(ctx, img, right - 130, 40, 130, LOGO_H, 'right');
    right -= w + 14;
  }
  const textMax = right - textX - 8;
  ctx.fillStyle = INK;
  ctx.font = F(700, 14);
  ctx.fillText(d.eventName, textX, 40 + 22, textMax);
  ctx.fillStyle = MUTED;
  ctx.font = F(400, 12);
  ctx.fillText(d.organizer, textX, 40 + 40, textMax);
  if (d.folio) {
    ctx.textAlign = 'right';
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#737989';
    // con logos adicionales el folio baja al pie para no encimarse
    ctx.fillText(`Folio ${d.folio}`, R, extraImgs.length ? BH - 18 : 40 + 12);
    ctx.textAlign = 'left';
  }

  // Cuerpo: se calcula su alto y se centra entre encabezado y firmas
  const bodySize = 15;
  const lineH = bodySize * 1.55;
  const textW = Math.min(620, R - L);
  let nameSize = 44;
  ctx.font = F(700, nameSize);
  while (nameSize > 24 && ctx.measureText(d.personName).width > R - L) {
    nameSize -= 2;
    ctx.font = F(700, nameSize);
  }
  const lines = wrapRich(ctx, d.body, bodySize, textW);
  const list = d.list ?? [];
  const listSize = list.length > 6 ? 11 : 12.5;
  const listH = list.length ? 8 + list.length * listSize * 1.5 : 0;
  const blockH = 13 + 10 + 14 + 10 + nameSize * 1.05 + 14 + lines.length * lineH + listH;
  const top = 92, bottom = BH - 40 - 64;
  let y = top + Math.max(12, (bottom - top - blockH) / 2);

  ctx.fillStyle = d.color;
  ctx.font = F(700, 13);
  ctx.letterSpacing = '1.8px';
  ctx.fillText((d.title ?? 'Constancia de asistencia').toUpperCase(), L, (y += 13));
  ctx.letterSpacing = '0px';
  ctx.fillStyle = MUTED;
  ctx.font = F(400, 14);
  ctx.fillText('Se otorga la presente a', L, (y += 10 + 14));
  ctx.fillStyle = INK;
  ctx.font = F(700, nameSize);
  ctx.fillText(d.personName, L, (y += 10 + nameSize));
  y += 4;
  for (const line of lines) {
    y += lineH;
    let x = L;
    for (const s of line) {
      ctx.font = F(s.bold ? 700 : 400, bodySize);
      ctx.fillText(s.text, x, y - (lineH - bodySize) / 2);
      x += ctx.measureText(s.text).width;
    }
  }
  if (list.length) {
    y += 8;
    ctx.font = F(400, listSize);
    for (const item of list) {
      y += listSize * 1.5;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(L + 3, y - listSize * 0.35, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(item, L + 12, y);
    }
  }

  // Firmas
  const sigTop = BH - 40 - 64;
  d.signers.slice(0, 3).forEach((s, i) => {
    const x = L + i * 220;
    const img = sigs[i];
    if (img) {
      const h = 34, w = Math.min(180, (img.width / img.height) * h);
      ctx.drawImage(img, x, sigTop, w, h);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, sigTop + 36);
    ctx.lineTo(x + 180, sigTop + 36);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = F(700, 12);
    ctx.fillText(s.name, x, sigTop + 54);
    ctx.fillStyle = MUTED;
    ctx.font = F(400, 11);
    ctx.fillText(s.title, x, sigTop + 69);
  });

  if (d.showVerification && d.folio) {
    const qx = R - 72, qy = BH - 40 - 72 - 14;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx, qy, 72, 72);
    paintQR(ctx, certificateUrl(d.folio), qx, qy, 72);
    ctx.fillStyle = '#737989';
    ctx.font = F(400, 10);
    ctx.textAlign = 'center';
    ctx.fillText('Verificar', qx + 36, qy + 72 + 12);
    ctx.textAlign = 'left';
  }
}

/** Genera un PDF (carta horizontal) con una constancia por página. */
export async function certificatesPdf(list: CertificateData[]) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const cv = document.createElement('canvas');
  for (let i = 0; i < list.length; i++) {
    await drawCertificate(cv, list[i], 3);
    if (i) pdf.addPage('letter', 'landscape');
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 792, 612);
  }
  return pdf;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Actividades que impartió una persona (su nombre aparece en el ponente/tallerista capturado en Programa). */
export function activitiesGivenBy<T extends ActivityLike>(name: string, activities: T[]): T[] {
  const n = norm(name);
  if (!n) return [];
  return activities.filter((a) => a.speaker && norm(a.speaker).includes(n));
}
