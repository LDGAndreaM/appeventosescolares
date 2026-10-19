import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useActivityStats, useEventDays } from '../../lib/api';
import {
  addDays, dayLong, dayNum, dayShort, eachDay, hm, monthName, parseDay, rangeLong, timeRange, toISODay, todayISO, weekdayShort,
} from '../../lib/format';
import { hourRange, layoutDay, simultaneous } from '../../lib/schedule';
import { typeStyle } from '../../lib/theme';
import type { Activity, ActivityStats } from '../../lib/types';
import { Loading, Segmented } from '../../components/ui';
import './event.css';

type View = 'itinerario' | 'dia' | 'semana' | 'mes';
const VIEWS: { value: View; label: string }[] = [
  { value: 'itinerario', label: 'Itinerario' },
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];
const HH = 40;

function isoWeek(d: string) {
  const x = parseDay(d);
  const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}
const mondayOf = (d: string) => addDays(d, -((parseDay(d).getDay() + 6) % 7));

export default function CalendarPage() {
  const { event } = useEventCtx();
  const activities = useActivities(event.id);
  const stats = useActivityStats(event.id);
  const days = useEventDays(event.id);
  const [params, setParams] = useSearchParams();
  const view = (params.get('vista') as View) || 'itinerario';
  const setView = (v: View) => setParams((p) => { p.set('vista', v); return p; });
  const [month, setMonth] = useState(() => event.start_date.slice(0, 7));

  if (!activities.data || !days.data || !stats.data) return <Loading />;
  const acts = activities.data;
  const evDays = days.data.length ? days.data.map((d) => d.day) : eachDay(event.start_date, event.end_date);
  const today = todayISO();
  const selDay = params.get('dia') && evDays.includes(params.get('dia')!) ? params.get('dia')! : evDays.includes(today) ? today : evDays[0];
  const weekStart = mondayOf(params.get('semana') ?? selDay ?? event.start_date);
  const weekDays = evDays.filter((d) => d >= weekStart && d <= addDays(weekStart, 6));

  let kicker = rangeLong(event.start_date, event.end_date);
  let title = 'Itinerario';
  if (view === 'dia') { kicker = rangeLong(event.start_date, event.end_date); title = dayLong(selDay); }
  if (view === 'semana') {
    kicker = `Semana ${isoWeek(weekStart)} · ${parseDay(weekStart).getDate()} ${monthName(parseDay(weekStart).getMonth()).slice(0, 3).toLowerCase()} – ${parseDay(addDays(weekStart, 6)).getDate()} ${monthName(parseDay(addDays(weekStart, 6)).getMonth()).slice(0, 3).toLowerCase()}`;
    title = 'Calendario';
  }
  if (view === 'mes') { kicker = month.slice(0, 4); title = monthName(Number(month.slice(5, 7)) - 1); }

  const goMonth = (n: number) => {
    const d = parseDay(month + '-01');
    d.setMonth(d.getMonth() + n);
    setMonth(toISODay(d).slice(0, 7));
  };
  const weekNav = (n: number) => setParams((p) => { p.set('semana', addDays(weekStart, 7 * n)); return p; });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker row" style={{ gap: 8 }}>
            {view === 'mes' && <button className="link" style={{ color: 'inherit' }} aria-label="Mes anterior" onClick={() => goMonth(-1)}>‹</button>}
            {view === 'semana' && <button className="link" style={{ color: 'inherit' }} aria-label="Semana anterior" onClick={() => weekNav(-1)}>‹</button>}
            <span>{kicker}</span>
            {view === 'mes' && <button className="link" style={{ color: 'inherit' }} aria-label="Mes siguiente" onClick={() => goMonth(1)}>›</button>}
            {view === 'semana' && <button className="link" style={{ color: 'inherit' }} aria-label="Semana siguiente" onClick={() => weekNav(1)}>›</button>}
          </div>
          <h2>{title}</h2>
        </div>
        <Segmented className="seg-ev" value={view} options={VIEWS} onChange={setView} label="Vista" />
      </div>

      {view === 'itinerario' && <Itinerary days={evDays} acts={acts} />}
      {view === 'dia' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
            <div className="chips">
              {evDays.map((d) => (
                <button key={d} className={'pill pill-md' + (d === selDay ? ' ev-on' : '')} onClick={() => setParams((p) => { p.set('dia', d); return p; })}>
                  {dayShort(d)}
                </button>
              ))}
            </div>
          </div>
          <TimeGrid days={[selDay]} acts={acts} stats={stats.data} hourHeight={56} />
        </>
      )}
      {view === 'semana' && (weekDays.length ? <TimeGrid days={weekDays} acts={acts} stats={stats.data} hourHeight={HH} /> : <div className="empty">No hay días del evento en esta semana.</div>)}
      {view === 'mes' && <Month month={month} evDays={evDays} acts={acts} onPick={(d) => setParams((p) => { p.set('vista', 'dia'); p.set('dia', d); return p; })} />}
    </>
  );
}

function Itinerary({ days, acts }: { days: string[]; acts: Activity[] }) {
  const cols = Math.min(Math.max(days.length, 1), 4);
  return (
    <div className="itin-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, padding: '24px 36px 36px' }}>
      {days.map((d) => {
        const list = acts.filter((a) => a.day === d);
        return (
          <div key={d} className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: 'var(--ev)' }}>{dayNum(d)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{dayLong(d)}</div>
            </div>
            {!list.length && <div className="empty" style={{ padding: 20 }}>Sin actividades</div>}
            {list.map((a) => {
              const st = typeStyle(a.type);
              const sim = simultaneous(a, acts).length;
              return (
                <Link key={a.id} to={`../asistencia/${a.id}`} className="stack" style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-divider)', gap: 4, color: 'inherit', textDecoration: 'none' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{timeRange(a.starts_at, a.ends_at)}</span>
                    <span className="tag tag-xs" style={{ background: st.bg, color: st.fg, borderColor: st.bd }}>{a.type}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>{a.name}</div>
                  <div className="cell-sub">{a.venue}</div>
                  {sim > 1 && <span style={{ fontSize: 11, color: 'var(--ev-700)', fontWeight: 600 }}>· simultáneo ({sim})</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({ days, acts, stats, hourHeight }: { days: string[]; acts: Activity[]; stats: Map<string, ActivityStats>; hourHeight: number }) {
  const visible = acts.filter((a) => days.includes(a.day));
  const [h0, h1] = hourRange(visible);
  const hoursList = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: days.length > 1 ? 120 * days.length + 56 : undefined }}>
        <div className="week-head" style={{ gridTemplateColumns: cols, borderBottom: '1px solid var(--color-neutral-300)' }}>
          <span />
          {days.map((d) => (
            <div key={d} className="row" style={{ padding: '10px 12px', borderLeft: '1px solid var(--color-divider)', alignItems: 'baseline' }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ev)' }}>{dayNum(d)}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{weekdayShort(d)}</span>
            </div>
          ))}
        </div>
        <div className="week-body" style={{ gridTemplateColumns: cols, height: (h1 - h0) * hourHeight + 16 }}>
          <div style={{ position: 'relative' }}>
            {hoursList.map((h, i) => (
              <span key={h} style={{ position: 'absolute', top: i * hourHeight + (i === 0 ? 8 : 0), right: 8, fontSize: 11, transform: 'translateY(-50%)' }} className="muted">
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className="week-col" style={{ background: `repeating-linear-gradient(to bottom, transparent 0 ${hourHeight - 1}px, var(--color-neutral-300) ${hourHeight - 1}px ${hourHeight}px)` }}>
              {layoutDay(visible.filter((a) => a.day === d), h0, hourHeight).map(({ item: a, lane, lanes, top, height }) => {
                const st = typeStyle(a.type);
                const n = stats.get(a.id)?.enrolled ?? 0;
                const cupo = a.capacity ? (n >= a.capacity ? 'Lleno' : `${n}/${a.capacity}`) : '';
                return (
                  <Link
                    key={a.id}
                    to={`../asistencia/${a.id}`}
                    className="cal-block"
                    title={`${a.name} · ${timeRange(a.starts_at, a.ends_at)}`}
                    style={{ top, height, left: `calc(${(lane * 100) / lanes}% + 3px)`, width: `calc(${100 / lanes}% - 6px)`, background: st.bg, color: st.fg, borderColor: st.bd }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{hm(a.starts_at)}–{hm(a.ends_at)}</span>
                    <span className="n" lang="es">{a.name}</span>
                    {hourHeight > 40 && <span style={{ fontSize: 10 }}>{a.venue}</span>}
                    {cupo && <span style={{ fontSize: 10 }}>{cupo}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Month({ month, evDays, acts, onPick }: { month: string; evDays: string[]; acts: Activity[]; onPick: (d: string) => void }) {
  const first = month + '-01';
  const start = mondayOf(first);
  const last = (() => { const d = parseDay(first); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISODay(d); })();
  const end = addDays(mondayOf(last), 6);
  const cells = eachDay(start, end);
  const today = todayISO();
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
        <div className="month-grid" style={{ borderBottom: '1px solid var(--color-neutral-300)' }}>
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((w) => <span key={w} style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>{w}</span>)}
        </div>
        <div className="month-grid">
          {cells.map((d) => {
            const inMonth = d.slice(0, 7) === month;
            const isEv = evDays.includes(d);
            const list = isEv ? acts.filter((a) => a.day === d) : [];
            return (
              <div
                key={d}
                className="month-cell"
                onClick={() => isEv && onPick(d)}
                style={{ background: isEv ? 'var(--ev-100)' : d === today ? '#fff' : 'transparent', cursor: isEv ? 'pointer' : undefined }}
              >
                <span style={{ fontSize: 14, fontWeight: isEv || d === today ? 800 : 400, color: !inMonth ? 'var(--color-neutral-500)' : isEv ? 'var(--ev)' : undefined }}>
                  {dayNum(d)}
                </span>
                {list.slice(0, 4).map((a) => {
                  const conf = a.type === 'Conferencia';
                  return (
                    <span key={a.id} className="month-chip" style={{ background: conf ? 'var(--ev)' : '#fff', color: conf ? '#fff' : 'var(--color-text)', borderLeftColor: typeStyle(a.type).bd }}>
                      {hm(a.starts_at)} {a.name}
                    </span>
                  );
                })}
                {list.length > 4 && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ev-700)' }}>+{list.length - 4} más</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
