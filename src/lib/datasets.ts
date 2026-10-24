import type { Dataset } from './export';
import { clockTime, dmy, durationLabel, profileLabel, timeRange } from './format';
import { payStatus } from './people';
import type { Activity, Attendance, Certificate, Enrollment, Package, Payment, Person, PersonBalance } from './types';

export interface ExportSource {
  people: Person[];
  packages: Package[];
  balances: Map<string, PersonBalance>;
  payments: Payment[];
  activities: Activity[];
  enrollments: Enrollment[];
  attendance: Attendance[];
  certificates: Certificate[];
}

const pkgName = (packages: Package[], id: string | null) => packages.find((p) => p.id === id)?.name ?? '';

export function participantsDataset(s: Pick<ExportSource, 'people' | 'packages' | 'balances'>, role = 'Todos'): Dataset {
  const list = role === 'Todos' ? s.people : s.people.filter((p) => p.role === role);
  return {
    title: 'Participantes',
    head: ['Nombre', 'Correo', 'Rol', 'Perfil', 'Carrera', 'Semestre', 'Paquete', 'Total', 'Pagado', 'Saldo', 'Liquidó', 'Origen'],
    rows: list.map((p) => {
      const paid = s.balances.get(p.id)?.paid ?? 0;
      const has = !!p.package_id;
      return [
        p.full_name, p.email ?? '', p.role, p.profile ?? '', p.career ?? '', p.semester ?? '', pkgName(s.packages, p.package_id),
        has ? p.amount_due : '', has ? paid : '', has ? Math.max(p.amount_due - paid, 0) : '', p.settled_on ? dmy(p.settled_on) : '',
        p.source === 'public' ? 'Formulario público' : 'Administración',
      ];
    }),
  };
}

export function paymentsDataset(s: Pick<ExportSource, 'people' | 'packages' | 'balances' | 'payments'>): Dataset {
  const list = s.people.filter((p) => p.package_id);
  return {
    title: 'Pagos y abonos',
    head: ['Nombre', 'Correo', 'Perfil', 'Paquete', 'Total', 'Pagado', 'Saldo', 'Abonos', 'Detalle de abonos', 'Último abono', 'Liquidó', 'Estado'],
    rows: list.map((p) => {
      const b = s.balances.get(p.id);
      const mine = s.payments.filter((x) => x.person_id === p.id);
      return [
        p.full_name, p.email ?? '', profileLabel(p), pkgName(s.packages, p.package_id), p.amount_due, b?.paid ?? 0,
        Math.max(p.amount_due - (b?.paid ?? 0), 0), mine.length,
        mine.map((x) => `${dmy(x.paid_on)} ${x.method} $${x.amount}${x.received_by_name ? ` (${x.received_by_name})` : ''}`).join('; '),
        b?.last_paid_on ? dmy(b.last_paid_on) : '', p.settled_on ? dmy(p.settled_on) : '', payStatus(p, b),
      ];
    }),
  };
}

export function attendanceRows(
  activity: Activity,
  people: Map<string, Person>,
  enrollments: Enrollment[],
  attendance: Attendance[],
) {
  const enr = enrollments.filter((e) => e.activity_id === activity.id);
  const att = new Map(attendance.filter((a) => a.activity_id === activity.id).map((a) => [a.person_id, a]));
  const ids = [...new Set([...enr.map((e) => e.person_id), ...att.keys()])];
  return ids
    .map((id) => {
      const person = people.get(id);
      if (!person) return null;
      const e = enr.find((x) => x.person_id === id);
      const a = att.get(id);
      const enrolled = e?.status === 'enrolled';
      const status = a ? (enrolled ? 'Asistió' : 'Sin inscripción') : e?.status === 'waitlist' ? 'Lista de espera' : 'Falta';
      const via = a ? (a.method === 'qr' ? `QR · ${clockTime(a.created_at)}` : `Manual · ${a.marked_by_name || '—'}`) : '—';
      return { person, enrollment: e, attendance: a, enrolled, status: status as 'Asistió' | 'Sin inscripción' | 'Falta' | 'Lista de espera', via };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((x, y) => Number(!!y.attendance) - Number(!!x.attendance) || x.person.full_name.localeCompare(y.person.full_name));
}

export function attendanceDataset(s: Pick<ExportSource, 'people' | 'activities' | 'enrollments' | 'attendance'>, only?: Activity): Dataset {
  const people = new Map(s.people.map((p) => [p.id, p]));
  const rows = (only ? [only] : s.activities).flatMap((a) =>
    attendanceRows(a, people, s.enrollments, s.attendance).map((r) => [
      r.person.full_name, r.person.email ?? '', profileLabel(r.person), a.name, a.type, dmy(a.day), timeRange(a.starts_at, a.ends_at),
      r.enrollment ? (r.enrollment.status === 'waitlist' ? 'Lista de espera' : 'Sí') : 'No', r.status, r.via,
    ]),
  );
  return {
    title: only ? `Asistencia ${only.name}` : 'Asistencia',
    head: ['Nombre', 'Correo', 'Perfil', 'Actividad', 'Tipo', 'Fecha', 'Horario', 'Inscrito', 'Estado', 'Registro'],
    rows,
  };
}

export function certificatesDataset(s: Pick<ExportSource, 'people' | 'activities' | 'certificates'>): Dataset {
  const people = new Map(s.people.map((p) => [p.id, p]));
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  return {
    title: 'Constancias',
    head: ['Nombre', 'Correo', 'Actividad', 'Fecha', 'Duración', 'Folio', 'Estado', 'Enviada'],
    rows: [...s.certificates]
      .sort((a, b) => a.folio.localeCompare(b.folio))
      .map((c) => {
        const p = people.get(c.person_id);
        const a = c.activity_id ? acts.get(c.activity_id) : null;
        return [
          p?.full_name ?? '', p?.email ?? '',
          c.kind === 'role' ? `Participación como ${p?.role.toLowerCase() ?? ''}` : a ? a.name : 'General (todas sus actividades)', a ? dmy(a.day) : '',
          a ? durationLabel(a.starts_at, a.ends_at) : '', c.folio, c.status === 'sent' ? 'Enviada' : 'Lista',
          c.sent_at ? dmy(c.sent_at) : '',
        ];
      }),
  };
}
