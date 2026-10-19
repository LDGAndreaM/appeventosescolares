import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useActivityStats, useAttendance, useEnrollments, useInvalidateEvent, usePeople } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, hm, profileLabel, timeRange, todayISO } from '../../lib/format';
import { checkinUrl, downloadQRPoster, qrCanvasRef } from '../../lib/qr';
import { attendanceDataset, attendanceRows } from '../../lib/datasets';
import { downloadDataset } from '../../lib/export';
import { ATT_STYLE } from '../../lib/people';
import type { Activity, Person } from '../../lib/types';
import { Field, Loading, Modal, Progress, SettingRow, Toggle, useToast } from '../../components/ui';
import './event.css';

type Filter = 'Todos' | 'Asistieron' | 'Faltan' | 'Sin inscripción';

export default function AttendancePage() {
  const { activityId } = useParams();
  const { event, full } = useEventCtx();
  const nav = useNavigate();
  const toast = useToast();
  const activities = useActivities(event.id);
  const stats = useActivityStats(event.id, 10_000);
  const attendance = useAttendance(event.id, 10_000);
  const enrollments = useEnrollments(event.id);
  const people = usePeople(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const [filter, setFilter] = useState<Filter>('Todos');
  const [manual, setManual] = useState(false);
  const [editWindow, setEditWindow] = useState(false);

  const acts = useMemo(() => activities.data ?? [], [activities.data]);
  const days = [...new Set(acts.map((a) => a.day))];
  const today = todayISO();
  const selected = acts.find((a) => a.id === activityId) ?? acts.find((a) => a.day === today) ?? acts[0];
  const [day, setDay] = useState<string | null>(null);
  const shownDay = day ?? selected?.day;


  const peopleMap = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const rows = useMemo(
    () => (selected && enrollments.data && attendance.data ? attendanceRows(selected, peopleMap, enrollments.data, attendance.data) : []),
    [selected, peopleMap, enrollments.data, attendance.data],
  );

  if (!activities.data || !stats.data || !attendance.data || !enrollments.data || !people.data) return <Loading />;
  if (!selected)
    return (
      <>
        <Head />
        <div className="empty">Agrega actividades en <Link to="../programa">Programa</Link> para generar sus códigos QR.</div>
      </>
    );

  const s = stats.data.get(selected.id);
  const enrolled = s?.enrolled ?? 0;
  const attendedEnrolled = rows.filter((r) => r.attendance && r.enrolled).length;
  const walkIns = rows.filter((r) => r.status === 'Sin inscripción').length;
  const missing = rows.filter((r) => r.status === 'Falta').length;
  const counts: Record<Filter, number> = { Todos: rows.length, Asistieron: attendedEnrolled, Faltan: missing, 'Sin inscripción': walkIns };
  const shown = rows.filter((r) =>
    filter === 'Todos' ? true : filter === 'Asistieron' ? r.status === 'Asistió' : filter === 'Faltan' ? r.status === 'Falta' || r.status === 'Lista de espera' : r.status === 'Sin inscripción',
  );
  const pct = enrolled ? Math.round((attendedEnrolled / enrolled) * 100) : 0;
  const meta = `${dayShort(selected.day)} · ${timeRange(selected.starts_at, selected.ends_at)}${selected.venue ? ` · ${selected.venue}` : ''}`;

  const updateAct = async (patch: Partial<Activity>) => {
    const { error } = await supabase.from('activities').update(patch).eq('id', selected.id);
    if (error) return toast(friendlyError(error), true);
    await invalidate('activities');
  };
  const mark = async (personId: string) => {
    const { error } = await supabase.from('attendance').insert({ event_id: event.id, activity_id: selected.id, person_id: personId, method: 'manual' });
    if (error) return toast(friendlyError(error), true);
    await invalidate('attendance', 'activity-stats');
  };
  const unmark = async (personId: string) => {
    if (!window.confirm('¿Quitar esta asistencia?')) return;
    const { error } = await supabase.from('attendance').delete().eq('activity_id', selected.id).eq('person_id', personId);
    if (error) return toast(friendlyError(error), true);
    await invalidate('attendance', 'activity-stats');
  };
  const poster = (format: 'png' | 'jpeg') =>
    downloadQRPoster({
      color: event.color_primary, eventName: event.name, type: selected.type, name: selected.name, meta, code: selected.code, format,
      fileName: `QR-asistencia-${selected.code}`,
    });

  return (
    <>
      <Head>
        <button className="btn btn-secondary" onClick={() => downloadDataset(attendanceDataset({ people: people.data!, activities: acts, enrollments: enrollments.data!, attendance: attendance.data! }, selected), 'csv', `asistencia-${selected.code}`)}>
          Exportar asistencia CSV
        </button>
      </Head>
      <div className="att-cols">
        <div className="card" style={{ overflow: 'hidden', gridArea: 'acts' }}>
          <div className="card-head" style={{ fontSize: 13 }}>
            <span>Actividades · {shownDay ? dayShort(shownDay) : ''}</span>
            {days.length > 1 && (
              <span className="row" style={{ gap: 4 }}>
                <button className="link" aria-label="Día anterior" disabled={days.indexOf(shownDay!) <= 0} onClick={() => setDay(days[days.indexOf(shownDay!) - 1])}>‹</button>
                <button className="link" aria-label="Día siguiente" disabled={days.indexOf(shownDay!) >= days.length - 1} onClick={() => setDay(days[days.indexOf(shownDay!) + 1])}>›</button>
              </span>
            )}
          </div>
          {acts.filter((a) => a.day === shownDay).map((a) => {
            const st = stats.data!.get(a.id);
            const reg = st?.enrolled ?? 0;
            const att = st?.attended_enrolled ?? 0;
            const walk = (st?.attended ?? 0) - att;
            const upcoming = a.day > today || (a.day === today && hm(a.starts_at) > new Date().toTimeString().slice(0, 5));
            const p = reg ? Math.round((att / reg) * 100) : 0;
            return (
              <Link key={a.id} to={`../asistencia/${a.id}`} className={'att-act' + (a.id === selected.id ? ' sel' : '')}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</span>
                  <span className="muted" style={{ fontSize: 12, flex: 'none' }}>{hm(a.starts_at)}</span>
                </div>
                <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{att} de {reg} asistieron{walk > 0 ? ` · +${walk} sin inscr.` : ''}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ev-700)' }}>{upcoming && !att ? 'Próxima' : `${p}%`}</span>
                </div>
                <Progress pct={p} />
              </Link>
            );
          })}
        </div>

        <div className="card card-lg stack" style={{ overflow: 'hidden', gridArea: 'qr' }}>
          <div className="stack" style={{ background: 'var(--ev)', color: '#fff', padding: '20px 22px', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>{event.name} · {selected.type}</span>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{selected.name}</span>
            <span style={{ fontSize: 13 }}>{meta}</span>
          </div>
          <div className="stack" style={{ padding: 24, alignItems: 'center', gap: 12 }}>
            <div style={{ width: 280, maxWidth: '100%', aspectRatio: '1', borderRadius: 16, border: '1.5px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', opacity: selected.qr_enabled ? 1 : 0.35 }}>
              <canvas ref={qrCanvasRef(checkinUrl(selected.code))} width={248} height={248} style={{ width: '88%', aspectRatio: '1', imageRendering: 'pixelated' }} aria-label={`Código QR de ${selected.name}`} />
            </div>
            <span className="mono" style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.12em' }}>{selected.code}</span>
            <span style={{ fontSize: 12, textAlign: 'center' }} className="muted">Escanea para registrar tu asistencia</span>
          </div>
          <div className="stack" style={{ padding: '0 22px 22px', gap: 12 }}>
            <div className="grid-2" style={{ gap: 8 }}>
              <button className="btn btn-primary btn-center" style={{ padding: '12px 14px' }} onClick={() => poster('png')}>Descargar PNG</button>
              <button className="btn btn-outline btn-center" style={{ padding: '12px 14px' }} onClick={() => poster('jpeg')}>Descargar JPG</button>
            </div>
            <button className="btn btn-secondary btn-center" onClick={() => nav(`../asistencia/${selected.id}/proyectar`)}>Proyectar en pantalla completa</button>
            <div className="divider-top" style={{ paddingTop: 12 }}>
              <SettingRow
                title="QR activo"
                desc={
                  selected.qr_from || selected.qr_to ? (
                    <>De {hm(selected.qr_from) || 'inicio'} a {hm(selected.qr_to) || 'cierre'}{full && <> · <button className="link" style={{ fontSize: 12 }} onClick={() => setEditWindow(true)}>cambiar</button></>}</>
                  ) : (
                    <>Todo el tiempo{full && <> · <button className="link" style={{ fontSize: 12 }} onClick={() => setEditWindow(true)}>limitar horario</button></>}</>
                  )
                }
              >
                <Toggle label="QR activo" checked={selected.qr_enabled} disabled={!full} onChange={(v) => updateAct({ qr_enabled: v })} />
              </SettingRow>
            </div>
            <SettingRow title="Solo inscritos" desc="Si está apagado, quien no esté inscrito queda como «sin inscripción»">
              <Toggle label="Solo inscritos" checked={selected.only_registered} disabled={!full} onChange={(v) => updateAct({ only_registered: v })} />
            </SettingRow>
          </div>
        </div>

        <div className="stack" style={{ gap: 16, minWidth: 0, gridArea: 'list' }}>
          <div className="stats-3">
            <div className="stat sm"><span className="k">Inscritos</span><span className="v">{enrolled}{selected.capacity && <small> / {selected.capacity} cupo</small>}</span></div>
            <div className="stat sm"><span className="k">Asistieron</span><span className="v" style={{ color: 'var(--af-green)' }}>{attendedEnrolled}<small> · {pct}%</small></span></div>
            <div className="stat sm"><span className="k">Faltan</span><span className="v">{missing}</span></div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--color-divider)' }}>
              <div className="chips">
                {(Object.keys(counts) as Filter[]).map((f) => (
                  <button key={f} type="button" className={'pill' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>{f} {counts[f]}</button>
                ))}
              </div>
              <button className="link" onClick={() => setManual(true)}>Marcar a mano</button>
            </div>
            {!shown.length && <div className="empty">{rows.length ? 'Nadie en esta lista.' : 'Aún no hay inscritos ni asistencias.'}</div>}
            {shown.map((r) => (
              <div key={r.person.id} className="att-row">
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title">{r.person.full_name}</div>
                  <div className="cell-sub">{profileLabel(r.person)}</div>
                </div>
                <span style={{ fontSize: 13 }} className="muted">{r.via}</span>
                <span className={'tag ' + ATT_STYLE[r.status]} style={{ padding: '4px 10px' }}>{r.status}</span>
                <span style={{ textAlign: 'right' }}>
                  {r.attendance ? (
                    <button className="link" style={{ color: 'var(--color-neutral-600)', fontWeight: 400, fontSize: 12 }} onClick={() => unmark(r.person.id)}>Quitar</button>
                  ) : (
                    <button className="link" style={{ fontSize: 12 }} onClick={() => mark(r.person.id)}>Marcar</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {manual && (
        <ManualMark
          people={people.data}
          attended={new Set(rows.filter((r) => r.attendance).map((r) => r.person.id))}
          enrolled={new Set(rows.filter((r) => r.enrolled).map((r) => r.person.id))}
          onlyRegistered={selected.only_registered}
          onMark={async (id) => { await mark(id); toast('Asistencia registrada'); }}
          onClose={() => setManual(false)}
        />
      )}
      {editWindow && (
        <WindowModal
          from={hm(selected.qr_from)}
          to={hm(selected.qr_to)}
          suggestion={[hm(selected.starts_at), hm(selected.ends_at)]}
          onSave={async (from, to) => { await updateAct({ qr_from: from || null, qr_to: to || null }); setEditWindow(false); }}
          onClose={() => setEditWindow(false)}
        />
      )}
    </>
  );
}

function Head({ children }: { children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="kicker"><Link to="../programa" style={{ color: 'inherit', textDecoration: 'none' }}>Programa</Link> / asistencia</div>
        <h2>Control de asistencia</h2>
      </div>
      {children}
    </div>
  );
}

function ManualMark(props: {
  people: Person[];
  attended: Set<string>;
  enrolled: Set<string>;
  onlyRegistered: boolean;
  onMark: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const list = props.people
    .filter((p) => !props.attended.has(p.id))
    .filter((p) => !props.onlyRegistered || props.enrolled.has(p.id))
    .filter((p) => !t || p.full_name.toLowerCase().includes(t) || p.email.includes(t))
    .sort((a, b) => Number(props.enrolled.has(b.id)) - Number(props.enrolled.has(a.id)))
    .slice(0, 10);
  return (
    <Modal onClose={props.onClose} label="Marcar asistencia a mano" sheetOnMobile>
      <h4>Marcar asistencia a mano</h4>
      <input className="input" autoFocus placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="stack" style={{ gap: 6 }}>
        {list.map((p) => (
          <button key={p.id} type="button" className="option" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => props.onMark(p.id)}>
            <div>
              <div className="t">{p.full_name}</div>
              <div className="d">{profileLabel(p)} · {p.role}</div>
            </div>
            <span className={'tag ' + (props.enrolled.has(p.id) ? 'tag-ev' : 'tag-warn')}>{props.enrolled.has(p.id) ? 'Inscrito' : 'Sin inscripción'}</span>
          </button>
        ))}
        {!list.length && <div className="empty">No hay más personas para marcar.</div>}
      </div>
      <div className="modal-actions"><button className="btn btn-secondary" onClick={props.onClose}>Listo</button></div>
    </Modal>
  );
}

function WindowModal(props: { from: string; to: string; suggestion: [string, string]; onSave: (from: string, to: string) => Promise<void>; onClose: () => void }) {
  const [from, setFrom] = useState(props.from);
  const [to, setTo] = useState(props.to);
  return (
    <Modal onClose={props.onClose} label="Horario del QR">
      <h4>Horario del QR</h4>
      <p className="muted" style={{ fontSize: 14 }}>Fuera de este horario el QR no registra asistencias. Déjalo vacío para que funcione todo el día de la actividad.</p>
      <div className="grid-2">
        <Field label="Desde"><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => {
        const [a, b] = props.suggestion;
        const shift = (t: string, m: number) => { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
        setFrom(shift(a, -15)); setTo(shift(b, 15));
      }}>Usar 15 min antes y después</button>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={() => { setFrom(''); setTo(''); }}>Sin límite</button>
        <button className="btn btn-primary" onClick={() => props.onSave(from, to)}>Guardar</button>
      </div>
    </Modal>
  );
}
