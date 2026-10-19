import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePublicEvent } from '../../lib/api';
import { dayNum, eachDay, hm, todayISO, weekdayShort } from '../../lib/format';
import { simultaneous } from '../../lib/schedule';
import { typeStyle } from '../../lib/theme';
import { Loading } from '../../components/ui';
import { PublicMessage, PublicShell } from './PublicShell';

/** 1o · Itinerario por día (vista pública, móvil). */
export default function PublicItinerary() {
  const { slug = '' } = useParams();
  const q = usePublicEvent(slug);
  const [sel, setSel] = useState<string | null>(null);
  if (q.isLoading) return <PublicShell><Loading /></PublicShell>;
  const ev = q.data;
  if (!ev) return <PublicMessage title="Evento no disponible" text="El enlace no existe o el evento todavía no está publicado." />;

  const days = ev.days.length ? ev.days.map((d) => d.day) : eachDay(ev.start_date, ev.end_date);
  const today = todayISO();
  const day = sel ?? (days.includes(today) ? today : days[0]);
  const list = ev.activities.filter((a) => a.day === day);

  return (
    <PublicShell color={ev.color_primary} color2={ev.color_secondary}>
      <div className="stack" style={{ padding: '20px 20px 14px', gap: 10, borderBottom: '1px solid var(--color-divider)' }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
          <span className="ellipsis">{ev.name}</span>
          <span style={{ color: 'var(--ev)', flex: 'none' }}>{ev.acronym} {ev.start_date.slice(0, 4)}</span>
        </div>
        <h3>Itinerario</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(days.length, 5)}, 1fr)`, borderBottom: '1px solid var(--color-neutral-300)', overflowX: 'auto', gridAutoFlow: 'column', gridAutoColumns: days.length > 5 ? '20%' : undefined }}>
        {days.map((d) => (
          <button key={d} type="button" onClick={() => setSel(d)}
            style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minHeight: 56, border: 0, cursor: 'pointer', background: d === day ? 'var(--ev)' : 'transparent', color: d === day ? '#fff' : 'var(--color-text)' }}>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{dayNum(d)}</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{weekdayShort(d)}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        {!list.length && <div className="empty">Sin actividades este día.</div>}
        {list.map((a) => {
          const sim = simultaneous(a, ev.activities).length;
          return (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--color-divider)' }}>
              <div className="stack">
                <span style={{ fontSize: 14, fontWeight: 700 }}>{hm(a.starts_at)}</span>
                <span style={{ fontSize: 11 }} className="muted">{hm(a.ends_at)}</span>
              </div>
              <div className="stack" style={{ borderLeft: `4px solid ${typeStyle(a.type).bd}`, borderRadius: 2, paddingLeft: 10, gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ev-700)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {a.type}{sim > 1 ? ` · simultáneo (${sim})` : ''}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{a.name}</span>
                <span style={{ fontSize: 12 }} className="muted">{[a.speaker, a.venue].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          );
        })}
      </div>
      {ev.registration_open && (
        <div style={{ padding: 20 }}>
          <Link to={`/r/${slug}`} className="btn btn-primary btn-xl btn-block">Registrarme →</Link>
        </div>
      )}
    </PublicShell>
  );
}
