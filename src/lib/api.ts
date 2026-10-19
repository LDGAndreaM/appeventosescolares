import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, selectAll } from './supabase';
import type {
  Activity, ActivityStats, Attendance, Certificate, CertificateSettings, Enrollment, EventAdmin, EventDay, EventRow,
  Package, Payment, Person, PersonBalance, Profile, PublicEvent,
} from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const num = <T extends object>(row: T, keys: (keyof T)[]) => {
  for (const k of keys) (row as Record<string, unknown>)[k as string] = Number(row[k] ?? 0);
  return row;
};

// ── Claves de caché ───────────────────────────────────────────────────────────
export const qk = {
  myEvents: ['my-events'] as const,
  event: (id: string) => ['event', id] as const,
  part: (id: string, part: string) => ['event', id, part] as const,
};

/**
 * Invalida datos de un evento tras un cambio. Cada parte también cubre sus variantes
 * (p. ej. 'payments' incluye 'payments-<persona>'); sin partes invalida todo el evento.
 */
export function useInvalidateEvent(eventId: string) {
  const qc = useQueryClient();
  return (...parts: string[]) =>
    parts.length
      ? qc.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === 'event' && q.queryKey[1] === eventId &&
            parts.some((p) => String(q.queryKey[2] ?? '').startsWith(p)),
        })
      : qc.invalidateQueries({ queryKey: qk.event(eventId) });
}

// ── Perfil ────────────────────────────────────────────────────────────────────
export async function fetchProfile(id: string) {
  return check<Profile>(await supabase.from('profiles').select('*').eq('id', id).single());
}

// ── Mis eventos ───────────────────────────────────────────────────────────────
export interface MyEvent extends EventRow {
  my_role: 'creator' | 'admin';
  people_count: number;
  activities_count: number;
}

export function useMyEvents(userId: string | undefined) {
  return useQuery({
    queryKey: qk.myEvents,
    enabled: !!userId,
    queryFn: async () => {
      type Row = Pick<EventAdmin, 'role' | 'permission'> & {
        event: EventRow & { people: { count: number }[]; activities: { count: number }[] };
      };
      const res = await supabase
        .from('event_admins')
        .select('role, permission, event:events(*, people(count), activities(count))')
        .eq('user_id', userId!);
      const rows = check(res) as unknown as Row[];
      return rows
        .filter((r) => r.event)
        .map((r) => ({
          ...r.event,
          my_role: r.role,
          people_count: r.event.people[0]?.count ?? 0,
          activities_count: r.event.activities[0]?.count ?? 0,
        }))
        .sort((a, b) => b.start_date.localeCompare(a.start_date)) as MyEvent[];
    },
  });
}

// ── Evento ────────────────────────────────────────────────────────────────────
export function useEvent(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'info'),
    queryFn: async () => check<EventRow>(await supabase.from('events').select('*').eq('id', eventId).single()),
  });
}

export function useMyAccess(eventId: string, userId: string | undefined) {
  return useQuery({
    queryKey: qk.part(eventId, 'access'),
    enabled: !!userId,
    queryFn: async () =>
      check<EventAdmin | null>(
        await supabase.from('event_admins').select('*').eq('event_id', eventId).eq('user_id', userId!).maybeSingle(),
      ),
  });
}

export function useEventDays(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'days'),
    queryFn: async () =>
      check<EventDay[]>(await supabase.from('event_days').select('*').eq('event_id', eventId).order('day')),
  });
}

export function useAdmins(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'admins'),
    queryFn: async () =>
      check<EventAdmin[]>(
        await supabase
          .from('event_admins')
          .select('*, profile:profiles!event_admins_user_id_fkey(full_name, email)')
          .eq('event_id', eventId)
          .order('created_at'),
      ),
  });
}

export function usePackages(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'packages'),
    queryFn: async () =>
      check<Package[]>(
        await supabase.from('packages').select('*').eq('event_id', eventId).order('sort_order').order('price'),
      ).map((p) => num(p, ['price'])),
  });
}

export function useActivities(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'activities'),
    queryFn: async () =>
      check<Activity[]>(
        await supabase
          .from('activities')
          .select('*, activity_packages(package_id)')
          .eq('event_id', eventId)
          .order('day')
          .order('starts_at')
          .order('name'),
      ),
  });
}

export function useActivityStats(eventId: string, refetchInterval?: number) {
  return useQuery({
    queryKey: qk.part(eventId, 'activity-stats'),
    refetchInterval,
    queryFn: async () => {
      const rows = check<ActivityStats[]>(await supabase.from('activity_stats').select('*').eq('event_id', eventId));
      return new Map(rows.map((r) => [r.activity_id, r]));
    },
  });
}

export function usePeople(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'people'),
    queryFn: async () =>
      (
        await selectAll<Person>((a, b) =>
          supabase.from('people').select('*').eq('event_id', eventId).order('full_name').range(a, b),
        )
      ).map((p) => num(p, ['amount_due'])),
  });
}

export function usePerson(eventId: string, personId: string | undefined) {
  return useQuery({
    queryKey: qk.part(eventId, `person-${personId}`),
    enabled: !!personId,
    queryFn: async () =>
      num(check<Person>(await supabase.from('people').select('*').eq('id', personId!).single()), ['amount_due']),
  });
}

export function useBalances(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'balances'),
    queryFn: async () => {
      const rows = await selectAll<PersonBalance>((a, b) =>
        supabase.from('person_balances').select('*').eq('event_id', eventId).range(a, b),
      );
      return new Map(rows.map((r) => [r.person_id, num(r, ['paid'])]));
    },
  });
}

/** Abonos del evento; con `personId` solo los de esa persona (null = persona aún sin guardar). */
export function usePayments(eventId: string, personId?: string | null) {
  return useQuery({
    queryKey: qk.part(eventId, personId ? `payments-${personId}` : 'payments'),
    enabled: personId !== null,
    queryFn: async () =>
      (
        await selectAll<Payment>((a, b) => {
          let q = supabase.from('payments').select('*').eq('event_id', eventId);
          if (personId) q = q.eq('person_id', personId);
          return q.order('paid_on').order('created_at').range(a, b);
        })
      ).map((p) => num(p, ['amount'])),
  });
}

export function useEnrollments(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'enrollments'),
    queryFn: async () =>
      selectAll<Enrollment>((a, b) =>
        supabase.from('enrollments').select('*').eq('event_id', eventId).range(a, b),
      ),
  });
}

export function useAttendance(eventId: string, refetchInterval?: number) {
  return useQuery({
    queryKey: qk.part(eventId, 'attendance'),
    refetchInterval,
    queryFn: async () =>
      selectAll<Attendance>((a, b) =>
        supabase.from('attendance').select('*').eq('event_id', eventId).order('created_at').range(a, b),
      ),
  });
}

export function useCertSettings(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'cert-settings'),
    queryFn: async () => {
      const row = check<CertificateSettings | null>(
        await supabase.from('certificate_settings').select('*').eq('event_id', eventId).maybeSingle(),
      );
      return row;
    },
  });
}

export function useCertificates(eventId: string) {
  return useQuery({
    queryKey: qk.part(eventId, 'certificates'),
    queryFn: async () =>
      selectAll<Certificate>((a, b) =>
        supabase.from('certificates').select('*').eq('event_id', eventId).range(a, b),
      ),
  });
}

// ── Público ───────────────────────────────────────────────────────────────────
export function usePublicEvent(slug: string) {
  return useQuery({
    queryKey: ['public-event', slug],
    queryFn: async () => {
      const ev = check<PublicEvent | null>(await supabase.rpc('get_public_event', { p_slug: slug }));
      if (ev) ev.packages = ev.packages.map((p) => num(p, ['price']));
      return ev;
    },
  });
}

// ── Mutaciones comunes ───────────────────────────────────────────────────────
export async function mutate<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  return check<T>(await p);
}

/** Sube un archivo al bucket del evento y devuelve su URL pública. */
export async function uploadEventAsset(eventId: string, path: string, file: File) {
  const full = `${eventId}/${path}`;
  const { error } = await supabase.storage.from('event-assets').upload(full, file, { upsert: true, cacheControl: '60' });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('event-assets').getPublicUrl(full);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Invoca una Edge Function devolviendo el cuerpo JSON incluso en errores HTTP. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; message?: string } | null = null;
    try {
      payload = ctx ? await ctx.json() : null;
    } catch {
      /* sin cuerpo */
    }
    throw new Error(payload?.error || payload?.message || error.message);
  }
  return data as T;
}
