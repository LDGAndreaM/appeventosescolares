import type { CSSProperties } from 'react';

/** Paletas sugeridas para eventos: [nombre, principal, oscuro, claro] */
export const PALETTES: [string, string, string, string][] = [
  ['Cobalto', '#3047c8', '#1b2470', '#e3e6fa'],
  ['Bermellón', '#ec3013', '#7c1405', '#ffe0d9'],
  ['Bosque', '#1f7a52', '#0f3d29', '#dcefe5'],
  ['Ocre', '#b97a0e', '#5c3d07', '#f6ead2'],
  ['Ciruela', '#7a2f8f', '#3d1748', '#efdff3'],
  ['Grafito', '#2d2b2b', '#605d5d', '#eae7e7'],
];

export const DEFAULT_EVENT_COLOR = '#3047c8';

/** ¿Es un color claro? (luminancia relativa) — decide si el texto encima va oscuro. */
export function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45;
}

/** Oscurece un color mezclándolo con negro (para usar un acento claro como texto sobre blanco). */
export function darken(hex: string, amount: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (c: number) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** Color de acento legible como texto sobre fondo blanco. */
export const accentText = (hex: string) => (isLight(hex) ? darken(hex, 0.45) : hex);

/**
 * Variables CSS para teñir un bloque con los colores del evento (ver .ev-scope en app.css).
 * El secundario es el acento (talleres, barras de progreso, detalles); si no hay, se usa el principal.
 */
export const evStyle = (color: string | null | undefined, color2?: string | null): CSSProperties => {
  const ev = color || DEFAULT_EVENT_COLOR;
  const ev2 = color2 && /^#[0-9a-f]{6}$/i.test(color2) ? color2 : ev;
  return { '--ev': ev, '--ev2': ev2, '--ev2-ink': isLight(ev2) ? '#1b1f2b' : '#fff', '--ev2-text': accentText(ev2) } as CSSProperties;
};

export interface TypeStyle {
  bg: string;
  fg: string;
  bd: string;
}

const OUTLINE: TypeStyle = { bg: '#fff', fg: 'var(--color-text)', bd: 'var(--color-text)' };

/** Colores por tipo de actividad (mismos que en el diseño). */
export function typeStyle(type: string): TypeStyle {
  switch (type) {
    case 'Conferencia':
      return { bg: 'var(--ev)', fg: '#fff', bd: 'var(--ev)' };
    case 'Taller':
      return { bg: 'var(--ev2-100)', fg: 'var(--ev2-800)', bd: 'var(--ev2)' };
    case 'Comida':
      return { bg: 'var(--color-neutral-200)', fg: 'var(--color-text)', bd: 'var(--color-neutral-500)' };
    case 'Concierto':
      return { bg: 'var(--color-text)', fg: '#fff', bd: 'var(--color-text)' };
    default:
      return OUTLINE;
  }
}

export const ACTIVITY_TYPES = ['Taller', 'Conferencia', 'Concierto', 'Comida', 'Ceremonia'] as const;

/** Etiqueta del responsable según el tipo de actividad. */
export const speakerLabel = (type: string) =>
  type === 'Taller' ? 'Tallerista' : type === 'Conferencia' ? 'Conferencista' : 'Responsable';
