import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useBalances, useInvalidateEvent, usePackages, usePayments, usePeople } from '../../lib/api';
import { dmy, money, profileLabel } from '../../lib/format';
import { PAY_STYLE, payStatus } from '../../lib/people';
import { Loading, Progress, useToast } from '../../components/ui';
import PaymentDialog from '../../components/PaymentDialog';
import './event.css';

type Filter = 'Todos' | 'Con saldo' | 'Sin abonos' | 'Liquidados';

export default function Payments() {
  const { event } = useEventCtx();
  const people = usePeople(event.id);
  const packages = usePackages(event.id);
  const balances = useBalances(event.id);
  const payments = usePayments(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('Todos');
  const [open, setOpen] = useState(false);

  if (!people.data || !packages.data || !balances.data || !payments.data) return <Loading />;
  const rows = people.data
    .filter((p) => p.package_id)
    .map((p) => {
      const b = balances.data!.get(p.id);
      return { p, b, paid: b?.paid ?? 0, st: payStatus(p, b) };
    });
  const groups: Record<Filter, typeof rows> = {
    Todos: rows,
    'Con saldo': rows.filter((r) => r.paid < r.p.amount_due),
    'Sin abonos': rows.filter((r) => !r.b?.payments_count),
    Liquidados: rows.filter((r) => r.st === 'Liquidado'),
  };
  const expected = rows.reduce((s, r) => s + r.p.amount_due, 0);
  const collected = rows.reduce((s, r) => s + r.paid, 0);
  const cards = [
    { k: 'Esperado', v: money(expected) },
    { k: 'Cobrado', v: money(collected), c: 'var(--ev)' },
    { k: 'Por cobrar', v: money(Math.max(expected - collected, 0)) },
    { k: 'Liquidados', v: `${groups.Liquidados.length} / ${rows.length}` },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Solo participantes con paquete</div>
          <h2>Pagos</h2>
        </div>
        <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={() => setOpen(true)}>+ Registrar abono</button>
      </div>
      <div className="stats-4" style={{ padding: '24px 36px 8px' }}>
        {cards.map((c) => (
          <div key={c.k} className="stat" style={{ padding: '20px 24px', gap: 4 }}>
            <span className="k">{c.k}</span>
            <span className="v" style={{ fontSize: 32, lineHeight: 1.05, color: c.c }}>{c.v}</span>
          </div>
        ))}
      </div>
      <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
        <div className="chips">
          {(Object.keys(groups) as Filter[]).map((f) => (
            <button key={f} type="button" className={'pill' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
              {f} {groups[f].length}
            </button>
          ))}
        </div>
      </div>
      <div className="thead pay-grid"><span>Participante</span><span>Paquete</span><span>Pagado / total</span><span>Último abono</span><span>Liquidó</span><span>Estado</span></div>
      {!groups[filter].length && <div className="empty">Nadie en esta lista.</div>}
      {groups[filter].map(({ p, b, paid, st }) => (
        <Link key={p.id} to={`../participantes/${p.id}`} className="trow pay-grid" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="cell-title">{p.full_name}</div>
            <div className="cell-sub">{profileLabel(p, false)}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{packages.data!.find((x) => x.id === p.package_id)?.name}</span>
          <div className="stack" style={{ gap: 5 }}>
            <span style={{ fontSize: 13 }}>
              <b>{money(paid)}</b> de {money(p.amount_due)} · {b?.payments_count === 1 ? '1 abono' : `${b?.payments_count ?? 0} abonos`}
            </span>
            <Progress pct={p.amount_due ? (paid / p.amount_due) * 100 : 0} />
          </div>
          <span style={{ fontSize: 13 }}>{dmy(b?.last_paid_on)}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{dmy(p.settled_on)}</span>
          <span className="tag" style={PAY_STYLE[st]}>{st}</span>
        </Link>
      ))}
      {open && (
        <PaymentDialog
          eventId={event.id}
          people={people.data}
          packages={packages.data}
          balances={balances.data}
          payments={payments.data}
          onClose={() => setOpen(false)}
          onSaved={async (settled) => {
            setOpen(false);
            await invalidate('payments', 'balances', 'people');
            toast(settled ? 'Abono registrado · paquete liquidado' : 'Abono registrado');
          }}
        />
      )}
    </>
  );
}
