import { hours } from './format';

interface Slot {
  id: string;
  day: string;
  starts_at: string;
  ends_at: string;
  name: string;
}

export const overlaps = (a: Slot, b: Slot) => a.day === b.day && a.starts_at < b.ends_at && a.ends_at > b.starts_at;

export const sortSlots = <T extends Slot>(list: T[]) =>
  [...list].sort((a, b) => a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at) || a.name.localeCompare(b.name));

/** Cuántas actividades (incluida ésta) ocurren al mismo tiempo que `a`. */
export const simultaneous = <T extends Slot>(a: T, all: T[]) => all.filter((b) => overlaps(a, b));

/** Agrupa actividades que se cruzan entre sí (de forma transitiva) dentro de un mismo día. */
export function clusters<T extends Slot>(list: T[]): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let currentEnd = '';
  let currentDay = '';
  for (const a of sortSlots(list)) {
    if (current.length && a.day === currentDay && a.starts_at < currentEnd) {
      current.push(a);
      if (a.ends_at > currentEnd) currentEnd = a.ends_at;
    } else {
      if (current.length) out.push(current);
      current = [a];
      currentEnd = a.ends_at;
      currentDay = a.day;
    }
  }
  if (current.length) out.push(current);
  return out;
}

export interface Placed<T> {
  item: T;
  lane: number;
  lanes: number;
  top: number;
  height: number;
}

/** Posiciona actividades en carriles para las vistas de calendario (día / semana). */
export function layoutDay<T extends Slot>(list: T[], startHour: number, hourHeight: number): Placed<T>[] {
  const placed: Placed<T>[] = [];
  for (const group of clusters(list)) {
    const laneEnds: string[] = [];
    const rows = group.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.starts_at);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.ends_at);
      } else laneEnds[lane] = item.ends_at;
      return { item, lane };
    });
    for (const r of rows)
      placed.push({
        ...r,
        lanes: laneEnds.length,
        top: (hours(r.item.starts_at) - startHour) * hourHeight,
        height: (hours(r.item.ends_at) - hours(r.item.starts_at)) * hourHeight - 3,
      });
  }
  return placed;
}

/** Rango de horas visible para un conjunto de actividades. */
export function hourRange(list: Slot[], fallback: [number, number] = [8, 22]): [number, number] {
  if (!list.length) return fallback;
  const min = Math.min(...list.map((a) => Math.floor(hours(a.starts_at))));
  const max = Math.max(...list.map((a) => Math.ceil(hours(a.ends_at))));
  return [Math.min(min, fallback[0]), Math.max(max, fallback[0] + 8)];
}

/**
 * Bloques de elección para un paquete: actividades que se cruzan forman un bloque
 * donde se elige una; las que no se cruzan se asignan solas.
 */
export function packageBlocks<T extends Slot>(list: T[]) {
  const groups = clusters(list);
  return {
    choices: groups.filter((g) => g.length > 1),
    automatic: groups.filter((g) => g.length === 1).map((g) => g[0]),
  };
}
