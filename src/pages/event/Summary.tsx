import { Link } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useActivityStats, useBalances, usePeople } from '../../lib/api';
import { daysBetween, dayLong, money, plural, timeRange, todayISO } from '../../lib/format';
import { registerUrl } from '../../lib/qr';
import { typeStyle } from '../../lib/theme';
import { PROFILES } from '../../lib/types';
import { Loading, Progress, useToast } from '../../components/ui';
import './event.css';

export default function Summary() {
  const { event } = useEventCtx();
  const toast = useToast();
  const people = usePeople(event.id);
  const balances = useBalances(event.id);
  const activities = useActivities(event.id);
  const stats = useActivityStats(event.id);
  if (!people.data || !balances.data || !activities.data || !stats.data) return <Loading />;

  const today = todayISO();
  const until = daysBetween(today, event.start_date);
  const kicker =
    event.status === 'finished' || today > event.end_date
      ? 'Evento finalizado'
      : until > 0
        ? `Faltan ${plural(until, 'día', 'días')}`
        : `En curso · día ${daysBetween(event.start_date, today) + 1} de ${daysBetween(event.start_date, event.end_date) + 1}`;

  const participants = people.data.filter((p) => p.role === 'Participante');
  const withPkg = participants.filter((p) => p.package_id);
  const expected = withPkg.reduce((s, p) => s + p.amount_due, 0);
  const collected = withPkg.reduce((s, p) => s + (balances.data.get(p.id)?.paid ?? 0), 0);
  const pending = withPkg.filter((p) => (balances.data.get(p.id)?.paid ?? 0) < p.amount_due);
  const noPayments = withPkg.filter((p) => !balances.data.get(p.id)?.payments_count);
  const workshops = activities.data.filter((a) => a.type === 'Taller' && a.capacity);
  const cap = workshops.reduce((s, a) => s + (a.capacity ?? 0), 0);
  const occ = workshops.reduce((s, a) => s + Math.min(stats.data.get(a.id)?.enrolled ?? 0, a.capacity ?? 0), 0);
  const fullCount = workshops.filter((a) => (stats.data.get(a.id)?.enrolled ?? 0) >= (a.capacity ?? Infinity)).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const kitsGiven = people.data.filter((p) => p.kit_delivered_on);
  const kitDays = [...new Set(kitsGiven.map((p) => p.kit_delivered_on!))].sort()
    .map((d) => [d, kitsGiven.filter((p) => p.kit_delivered_on === d).length] as const);

  const cards = [
    { k: 'Personas registradas', v: people.data.length.toLocaleString('es-MX'), sub: `${participants.length} participantes · ${people.data.length - participants.length} equipo`, pct: people.data.length ? 100 : 0 },
    { k: 'Recaudado', v: money(collected), sub: `de ${money(expected)} esperados`, pct: pct(collected, expected) },
    { k: 'Con saldo pendiente', v: String(pending.length), sub: `${noPayments.length} sin ningún abono`, pct: pct(pending.length, withPkg.length) },
    { k: 'Ocupación de talleres', v: `${pct(occ, cap)}%`, sub: `${fullCount} de ${workshops.length} talleres llenos`, pct: pct(occ, cap) },
  ];

  const days = [...new Set(activities.data.map((a) => a.day))].sort();
  const shownDay = days.includes(today) ? today : days.find((d) => d >= today) ?? days[0];
  const dayActs = activities.data.filter((a) => a.day === shownDay);
  const dayIdx = days.indexOf(shownDay);
  const dayNote = shownDay === today ? 'hoy' : dayIdx === 0 ? 'primer día' : `día ${dayIdx + 1}`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{kicker}</div>
          <h2>Resumen</h2>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => { void navigator.clipboard.writeText(registerUrl(event.slug)); toast('Enlace de registro copiado'); }}>
            Copiar enlace de registro
          </button>
          <Link to="../participantes/nuevo" className="btn btn-primary" style={{ minWidth: 160 }}>+ Agregar persona</Link>
        </div>
      </div>
      {event.status === 'draft' && (
        <div className="alert info" style={{ margin: '16px 36px 0' }}>
          El evento está en borrador: el registro público y la asistencia por QR se activan cuando lo marcas como activo en <Link to="../ajustes">Ajustes</Link>.
        </div>
      )}
      <div className="stats-4" style={{ padding: '24px 36px 0' }}>
        {cards.map((c) => (
          <div key={c.k} className="stat">
            <span className="k">{c.k}</span>
            <span className="v">{c.v}</span>
            <span className="s">{c.sub}</span>
            <div style={{ marginTop: 6 }}><Progress pct={c.pct} /></div>
          </div>
        ))}
      </div>
      <div className="two-col" style={{ padding: '16px 36px 36px' }}>
        <div className="card" style={{ padding: '24px 28px' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h5>{shownDay ? `${dayLong(shownDay)} · ${dayNote}` : 'Programa'}</h5>
            <Link to="../calendario" className="link">Ver itinerario →</Link>
          </div>
          {!dayActs.length && <div className="empty">Aún no hay actividades. <Link to="../programa">Agrega la primera</Link>.</div>}
          {dayActs.map((a) => {
            const t = typeStyle(a.type);
            return (
              <div key={a.id} className="agenda-row">
                <span style={{ fontSize: 13, fontWeight: 600 }}>{timeRange(a.starts_at, a.ends_at)}</span>
                <div>
                  <div className="cell-title">{a.name}</div>
                  <div className="cell-sub">{a.venue}</div>
                </div>
                <span className="tag" style={{ background: t.bg, color: t.fg, borderColor: t.bd }}>{a.type}</span>
              </div>
            );
          })}
        </div>
        <div className="card stack" style={{ padding: '24px 28px', gap: 24 }}>
          <div>
            <h5 style={{ marginBottom: 12 }}>Cupo de talleres</h5>
            {!workshops.length && <span className="muted" style={{ fontSize: 13 }}>Sin talleres con cupo.</span>}
            {workshops.map((a) => {
              const n = stats.data.get(a.id)?.enrolled ?? 0;
              const isFull = n >= (a.capacity ?? 0);
              return (
                <div key={a.id} className="cupo-row">
                  <span style={{ fontSize: 13 }} className="ellipsis">{a.name}</span>
                  <Progress lg pct={pct(n, a.capacity ?? 0)} color={isFull ? 'var(--color-text)' : undefined} />
                  <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{n}/{a.capacity}</span>
                </div>
              );
            })}
          </div>
          <div>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h5>Kits de bienvenida</h5>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{kitsGiven.length} de {people.data.length} entregados</span>
            </div>
            <Progress lg pct={pct(kitsGiven.length, people.data.length)} />
            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              {kitDays.map(([d, n]) => (
                <div key={d} className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{dayLong(d)}</span><b>{n}</b>
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 16, marginTop: 12, fontSize: 13 }}>
              <Link to="../participantes?kit=pendiente" className="link">Ver pendientes ({people.data.length - kitsGiven.length}) →</Link>
              {kitsGiven.length > 0 && <Link to="../participantes?kit=entregado" className="link">Ver entregados →</Link>}
            </div>
          </div>
          <div>
            <h5 style={{ marginBottom: 12 }}>Perfil de participantes</h5>
            <div className="profile-grid">
              {PROFILES.map((k) => (
                <div key={k} className="stack" style={{ padding: '10px 10px 0 0' }}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{participants.filter((p) => p.profile === k).length}</span>
                  <span style={{ fontSize: 12 }} className="muted">{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
