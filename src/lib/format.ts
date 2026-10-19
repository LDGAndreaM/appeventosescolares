import type { Person } from './types';

export const money = (n: number | string | null | undefined) =>
  '$' + Number(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const monthName = (m: number) => MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1);

/** 'YYYY-MM-DD' → Date local a mediodía (evita saltos por zona horaria). */
export const parseDay = (d: string) => new Date(d.slice(0, 10) + 'T12:00:00');

export const toISODay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISODay(new Date());

export function addDays(d: string, n: number) {
  const x = parseDay(d);
  x.setDate(x.getDate() + n);
  return toISODay(x);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= n && i < 60; i++) out.push(addDays(start, i));
  return out;
}

/** "Mar 27" */
export const dayShort = (d: string) => `${DAYS_SHORT[parseDay(d).getDay()]} ${parseDay(d).getDate()}`;
/** "Martes 27" */
export const dayLong = (d: string) => `${DAYS[parseDay(d).getDay()]} ${parseDay(d).getDate()}`;
export const weekdayName = (d: string) => DAYS[parseDay(d).getDay()];
export const weekdayShort = (d: string) => DAYS_SHORT[parseDay(d).getDay()];
export const dayNum = (d: string) => String(parseDay(d).getDate());
/** "27/10/2026" */
export const dmy = (d: string | null | undefined) => {
  if (!d) return '—';
  const x = parseDay(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};
/** "27 de octubre de 2026" */
export const longDate = (d: string) => {
  const x = parseDay(d);
  return `${x.getDate()} de ${MONTHS[x.getMonth()]} de ${x.getFullYear()}`;
};
/** "27 oct 2026" */
export const shortDate = (d: string) => {
  const x = parseDay(d);
  return `${x.getDate()} ${MONTHS_SHORT[x.getMonth()]} ${x.getFullYear()}`;
};

/** "27–30 oct 2026" · "30 oct – 2 nov 2026" · "14 mar 2026" */
export function rangeShort(a: string, b: string) {
  const x = parseDay(a), y = parseDay(b);
  if (a === b) return shortDate(a);
  if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear())
    return `${x.getDate()}–${y.getDate()} ${MONTHS_SHORT[y.getMonth()]} ${y.getFullYear()}`;
  return `${x.getDate()} ${MONTHS_SHORT[x.getMonth()]} – ${y.getDate()} ${MONTHS_SHORT[y.getMonth()]} ${y.getFullYear()}`;
}
/** "27–30 de octubre 2026" */
export function rangeLong(a: string, b: string) {
  const x = parseDay(a), y = parseDay(b);
  if (a === b) return longDate(a);
  if (x.getMonth() === y.getMonth())
    return `${x.getDate()}–${y.getDate()} de ${MONTHS[y.getMonth()]} ${y.getFullYear()}`;
  return `${x.getDate()} de ${MONTHS[x.getMonth()]} – ${y.getDate()} de ${MONTHS[y.getMonth()]} ${y.getFullYear()}`;
}
/** "27 oct" (sin año) */
export const dayMonth = (d: string) => `${parseDay(d).getDate()} ${MONTHS_SHORT[parseDay(d).getMonth()]}`;

/** 'HH:MM:SS' → 'HH:MM' */
export const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');
export const timeRange = (a: string, b: string) => `${hm(a)}–${hm(b)}`;
/** 'HH:MM' → horas decimales */
export const hours = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
};

export function durationLabel(a: string, b: string) {
  const mins = Math.round((hours(b) - hours(a)) * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  if (!h) return `${m} minutos`;
  const hs = h === 1 ? '1 hora' : `${h} horas`;
  return m ? `${hs} ${m} minutos` : hs;
}

export function dateTimeShort(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = (x: Date, y: Date) => x.toDateString() === y.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `Hoy, ${time}`;
  if (sameDay(d, yest)) return `Ayer, ${time}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${time}`;
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

const CAREER_SHORT: Record<string, string> = {
  'Lic. en Diseño Gráfico': 'LDG',
  'Licenciatura en Diseño Gráfico': 'LDG',
  'Diseño Gráfico': 'LDG',
};
export const careerShort = (c: string | null) => (c ? CAREER_SHORT[c] ?? c : '');

/** "Estudiante · LDG · 5º" */
export function profileLabel(p: Pick<Person, 'profile' | 'career' | 'semester'>, withProfile = true) {
  if (!p.profile) return '—';
  if (p.profile !== 'Estudiante') return p.profile;
  const parts = [careerShort(p.career), p.semester ? `${p.semester}º` : ''].filter(Boolean);
  return [withProfile ? 'Estudiante' : '', ...parts].filter(Boolean).join(' · ') || 'Estudiante';
}

export const initials = (name: string) =>
  name.split(/\s+/).filter((w) => w && w[0] === w[0].toUpperCase()).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

export function slugify(s: string) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export const firstName = (n: string) => n.replace(/^(Dr|Dra|Mtro|Mtra|Lic|Ing)\.?\s+/i, '').split(' ')[0];
