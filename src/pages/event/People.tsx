import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useBalances, useInvalidateEvent, usePackages, usePeople } from '../../lib/api';
import { money, profileLabel } from '../../lib/format';
import { PAY_STYLE, payStatus } from '../../lib/people';
import { participantsDataset } from '../../lib/datasets';
import { downloadDataset } from '../../lib/export';
import { ROLES } from '../../lib/types';
import { Loading, useToast } from '../../components/ui';
import ImportPeopleModal from '../../components/ImportPeopleModal';
import './event.css';

export default function People() {
  const { event } = useEventCtx();
  const people = usePeople(event.id);
  const packages = usePackages(event.id);
  const balances = useBalances(event.id);
  const [role, setRole] = useState('Todos');
  const [q, setQ] = useState('');
  const [importing, setImporting] = useState(false);
  const activities = useActivities(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();

  if (!people.data || !packages.data || !balances.data) return <Loading />;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const term = norm(q.trim());
  const list = people.data.filter(
    (p) => (role === 'Todos' || p.role === role) && (!term || norm(p.full_name).includes(term) || (p.email ?? '').includes(term)),
  );
  const chips = [['Todos', people.data.length] as const, ...ROLES.map((r) => [r, people.data!.filter((p) => p.role === r).length] as const)];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{people.data.length.toLocaleString('es-MX')} personas registradas</div>
          <h2>Participantes</h2>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => downloadDataset(participantsDataset({ people: people.data!, packages: packages.data!, balances: balances.data! }, role), 'csv', `${event.code_prefix}-participantes`)}>
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
        <input className="input search" placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
      </div>
      <div className="thead people-grid">
        <span>Nombre y correo</span><span>Rol</span><span>Perfil</span><span>Paquete</span><span>Total</span><span>Saldo</span><span>Estado</span>
      </div>
      {!list.length && <div className="empty">{people.data.length ? 'Nadie coincide con la búsqueda.' : 'Aún no hay personas registradas.'}</div>}
      {list.map((p) => {
        const b = balances.data!.get(p.id);
        const st = payStatus(p, b);
        const has = !!p.package_id;
        return (
          <Link key={p.id} to={p.id} className="trow people-grid">
            <div style={{ minWidth: 0 }}>
              <div className="cell-title">{p.full_name}</div>
              <div className="cell-sub ellipsis">{p.email ?? 'Sin correo'}</div>
            </div>
            <span className="tag tag-outline" style={{ borderRadius: 12 }}>{p.role}</span>
            <span style={{ fontSize: 13 }}>{profileLabel(p)}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{packages.data!.find((x) => x.id === p.package_id)?.name ?? '—'}</span>
            <span style={{ fontSize: 13 }}>{has ? money(p.amount_due) : '—'}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{has ? money(Math.max(p.amount_due - (b?.paid ?? 0), 0)) : '—'}</span>
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
