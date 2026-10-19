import type { CSSProperties } from 'react';
import type { Person, PersonBalance } from './types';

export type PayStatus = 'Liquidado' | 'Abonado' | 'Pendiente' | '—';

export function payStatus(p: Person, b?: PersonBalance): PayStatus {
  if (!p.package_id || p.amount_due <= 0) return '—';
  const paid = b?.paid ?? 0;
  if (paid >= p.amount_due) return 'Liquidado';
  return paid > 0 ? 'Abonado' : 'Pendiente';
}

export const PAY_STYLE: Record<PayStatus, CSSProperties> = {
  Liquidado: { background: 'var(--ev)', color: '#fff', borderColor: 'var(--ev)' },
  Abonado: { background: 'var(--ev-100)', color: 'var(--ev-800)', borderColor: 'var(--ev)' },
  Pendiente: { background: '#fff', color: 'var(--color-accent-700)', borderColor: 'var(--color-accent-700)' },
  '—': { background: 'transparent', color: 'var(--color-neutral-600)', borderColor: 'transparent' },
};

export const ATT_STYLE = {
  Asistió: 'tag-ok',
  Falta: 'tag-muted',
  'Sin inscripción': 'tag-warn',
  'Lista de espera': 'tag-ev',
} as const;
export type AttStatus = keyof typeof ATT_STYLE;

export const CAREERS = [
  'Lic. en Diseño Gráfico',
  'Arquitectura',
  'Diseño Industrial',
  'Ingeniería en Software',
  'Ingeniería Civil',
  'Ingeniería Industrial',
  'Administración',
  'Contaduría Pública',
  'Psicología',
  'Ciencias de la Educación',
  'Derecho',
  'Medicina Veterinaria',
];
