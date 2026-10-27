import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useBalances, useInvalidateEvent, usePackages, usePeople } from '../../lib/api';
import { money, profileLabel, shortDate } from '../../lib/format';
import { PAY_STYLE, payStatus, type PayStatus } from '../../lib/people';
import { participantsDataset } from '../../lib/datasets';
import { downloadDataset } from '../../lib/export';
import { ROLES, type Person } from '../../lib/types';
import { Loading, useToast } from '../../components/ui';
import ImportPeopleModal from '../../components/ImportPeopleModal';
import './event.css';

type SortKey = 'name' | 'role' | 'profile' | 'package' | 'total' | 'saldo' | 'kit' | 'status';
const COLUMNS: [SortKey, string][] = [
  ['name', 'Nombre y correo'], ['role', 'Rol'], ['profile', 'Perfil'], ['package', 'Paquete'], ['total', 'Total'], ['saldo', 'Saldo'], ['kit', 'Kit'], ['status', 'Estado'],
];
/** Orden de los estados de pago al ordenar por «Estado» (ascendente). */
const STATUS_ORDER: Record<Exclude<PayStatus, '—'>, number> = { Pendiente: 0, Abonado: 1, Liquidado: 2 };
const STATUS_FILTERS: { value: string; label: string; status: PayStatus }[] = [
  { value: 'Pendiente', label: 'Pendiente', status: 'Pendiente' },
  { value: 'Abonado', label: 'Abonado', status: 'Abonado' },
  { value: 'Liquidado', label: 'Liquidado', status: 'Liquidado' },
  { value: 'sin', label: 'Sin paquete', status: '—' },
];

export default function People() {
  const { event } = useEventCtx();
  const people = usePeople(event.id);
  const packages = usePackages(event.id);
  const balances = useBalances(event.id);
  const [role, setRole] = useState('Todos');
  const [q, setQ] = useState('');
  const [semester, setSemester] = useState('');
  const [status, setStatus] = useState('');
  const [search] = useSearchParams();
  // «Ver pendientes / entregados» desde Resumen llega con ?kit=
  const [kit, setKit] = useState<'' | 'entregado' | 'pendiente'>(() => {
    const k = search.get('kit');
    return k === 'entregado' || k === 'pendiente' ? k : '';
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [importing, setImporting] = useState(false);
  const activities = useActivities(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();

  if (!people.data || !packages.data || !balances.data) return <Loading />;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = norm(q.trim());
  const statusOf = (p: Person) => payStatus(p, balances.data!.get(p.id));
  const saldoOf = (p: Person) => (p.package_id ? Math.max(p.amount_due - (balances.data!.get(p.id)?.paid ?? 0), 0) : -1);
  const pkgOf = (p: Person) => packages.data!.find((x) => x.id === p.package_id)?.name ?? '';
  const statusWanted = STATUS_FILTERS.find((x) => x.value === status)?.status;
  const byRole = people.data.filter((p) => role === 'Todos' || p.role === role);
  /** Valor de la columna para ordenar; null (sin paquete) siempre queda al final. */
  const value = (p: Person): string | number | null => {
    switch (sort.key) {
      case 'name': return p.full_name;
      case 'role': return p.role;
      case 'profile': return profileLabel(p);
      case 'package': return pkgOf(p) || null;
      case 'total': return p.package_id ? p.amount_due : null;
      case 'saldo': return p.package_id ? saldoOf(p) : null;
      // pendientes primero; los entregados, del más antiguo al más reciente
      case 'kit': return p.kit_delivered_on ?? '';
      case 'status': {
        const st = statusOf(p);
        return st === '—' ? null : STATUS_ORDER[st];
      }
    }
  };
  const compare = (a: Person, b: Person) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }) : x === null ? 1 : -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' });
    return c * sort.dir || a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' });
  };
  const list = byRole
    .filter(
      (p) =>
        (!semester || String(p.semester) === semester) &&
        (!statusWanted || statusOf(p) === statusWanted) &&
        (!kit || (kit === 'entregado') === !!p.kit_delivered_on) &&
        (!term || norm(p.full_name).includes(term) || (p.email ?? '').includes(term)),
    )
    .sort(compare);
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  // semestres de los estudiantes registrados, con cuántos hay en cada uno (respetando el rol elegido)
  const semesters = [...new Set(people.data.filter((p) => p.semester).map((p) => p.semester!))].sort((a, b) => a - b)
    .map((s) => [s, people.data!.filter((p) => p.semester === s && (role === 'Todos' || p.role === role)).length] as const);
  const chips = [['Todos', people.data.length] as const, ...ROLES.map((r) => [r, people.data!.filter((p) => p.role === r).length] as const)];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{people.data.length.toLocaleString('es-MX')} personas registradas</div>
          <h2>Participantes</h2>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => downloadDataset(participantsDataset({ people: list, packages: packages.data!, balances: balances.data! }), 'csv', `${event.code_prefix}-participantes`)}>
            Exportar CSV
          </button>
          <button className="btn btn-secondary" onClick={() => setImporting(true)}>Importar CSV</button>
          <Link to="nuevo" className="btn btn-primary" style={{ minWidth: 160 }}>+ Agregar persona</Link>
        </div>
      </div>
      <div className="toolbar">
        <div className="chips">
          {chips.map(([label, n]) => (
            <button key={label} type="button" className={'pill' + (role === label ? ' on' : '')} style={role === label ? { fontWeight: 800 } : { borderColor: 'var(--color-neutral-400)' }} onClick={() => setRole(label)}>
              <span>{label}</span>
              <span className="n">{n}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
        {semesters.length > 0 && (
          <select className="input search" style={{ width: 'auto' }} value={semester} onChange={(e) => setSemester(e.target.value)} aria-label="Semestre">
            <option value="">Todos los semestres</option>
            {semesters.map(([s, n]) => <option key={s} value={s}>{s}º semestre ({n})</option>)}
          </select>
        )}
        <select className="input search" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado de pago">
          <option value="">Todos los estados</option>
          {STATUS_FILTERS.map((x) => <option key={x.value} value={x.value}>{x.label} ({byRole.filter((p) => statusOf(p) === x.status).length})</option>)}
        </select>
        <select className="input search" style={{ width: 'auto' }} value={kit} onChange={(e) => setKit(e.target.value as typeof kit)} aria-label="Kit de bienvenida">
          <option value="">Kit: todos</option>
          <option value="entregado">Kit entregado ({byRole.filter((p) => p.kit_delivered_on).length})</option>
          <option value="pendiente">Kit pendiente ({byRole.filter((p) => !p.kit_delivered_on).length})</option>
        </select>
        <input className="input search" placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        </div>
      </div>
      <div className="thead people-grid">
        {COLUMNS.map(([key, label]) => (
          <button key={key} type="button" className={'th-sort' + (sort.key === key ? ' on' : '')} onClick={() => sortBy(key)}
            title="Ordenar" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
            {label}
            <span className="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
          </button>
        ))}
      </div>
      {!list.length && <div className="empty">{people.data.length ? 'Nadie coincide con los filtros.' : 'Aún no hay personas registradas.'}</div>}
      {list.map((p) => {
        const st = statusOf(p);
        const has = !!p.package_id;
        return (
          <Link key={p.id} to={p.id} className="trow people-grid">
            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{p.full_name}</div>
              <div className="cell-sub ellipsis">{p.email ?? 'Sin correo'}</div>
            </div>
            <span className="tag tag-outline" style={{ borderRadius: 12 }}>{p.role}</span>
            <span style={{ fontSize: 13 }}>{profileLabel(p)}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{pkgOf(p) || '—'}</span>
            <span style={{ fontSize: 13 }}>{has ? money(p.amount_due) : '—'}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{has ? money(saldoOf(p)) : '—'}</span>
            <span style={{ fontSize: 13 }} className={p.kit_delivered_on ? undefined : 'muted'}>
              {p.kit_delivered_on ? <><span style={{ color: 'var(--ev)', fontWeight: 700 }}>✓</span> {shortDate(p.kit_delivered_on).replace(/ \d{4}$/, '')}</> : 'Pendiente'}
            </span>
            <span className="tag" style={PAY_STYLE[st]}>{st}</span>
          </Link>
        );
      })}
      {importing && (
        <ImportPeopleModal
          eventId={event.id}
          packages={packages.data}
          activities={activities.data ?? []}
          people={people.data}
          onClose={() => setImporting(false)}
          onDone={async (n) => {
            await invalidate('people', 'balances', 'payments', 'enrollments', 'activity-stats');
            toast(`${n} ${n === 1 ? 'persona importada' : 'personas importadas'}`);
          }}
        />
      )}
    </>
  );
}
