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

/** Variables CSS para teñir un bloque con el color del evento (ver .ev-scope en app.css). */
export const evStyle = (color: string | null | undefined): CSSProperties =>
  ({ '--ev': color || DEFAULT_EVENT_COLOR }) as CSSProperties;

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
      return { bg: 'var(--ev-100)', fg: 'var(--ev-800)', bd: 'var(--ev)' };
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
