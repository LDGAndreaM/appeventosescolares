import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import { useActivities, useActivityStats, useEventDays, useInvalidateEvent, usePackages, usePeople } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, hm, plural, timeRange } from '../../lib/format';
import { simultaneous } from '../../lib/schedule';
import { ACTIVITY_TYPES, speakerLabel, typeStyle } from '../../lib/theme';
import type { Activity } from '../../lib/types';
import { Field, Loading, useToast } from '../../components/ui';
import './event.css';

interface Draft {
  id?: string;
  type: string;
  customType: string;
  name: string;
  speaker: string;
  venue: string;
  day: string;
  starts_at: string;
  ends_at: string;
  capacity: string;
  packages: string[];
}

const emptyDraft = (day: string): Draft => ({
  type: 'Taller', customType: '', name: '', speaker: '', venue: '', day, starts_at: '10:00', ends_at: '12:00', capacity: '', packages: [],
});

export default function Program() {
  const { event, full } = useEventCtx();
  const activities = useActivities(event.id);
  const stats = useActivityStats(event.id);
  const days = useEventDays(event.id);
  const packages = usePackages(event.id);
  const people = usePeople(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();
  const [filter, setFilter] = useState('Todas');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => activities.data ?? [], [activities.data]);
  if (!activities.data || !days.data || !packages.data || !stats.data) return <Loading />;

  const firstDay = days.data[0]?.day ?? event.start_date;
  const d = draft ?? emptyDraft(firstDay);
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const types = [...new Set(all.map((a) => a.type))];
  const shown = filter === 'Todas' ? all : all.filter((a) => a.type === filter);
  const speakers = (people.data ?? []).filter((p) => ['Tallerista', 'Ponente', 'Conferencista', 'Organizador'].includes(p.role));
  const isOther = !(ACTIVITY_TYPES as readonly string[]).includes(d.type);
  const effectiveType = isOther ? d.customType.trim() || 'Otro' : d.type;

  const clash = d.day && d.starts_at < d.ends_at
    ? all.filter((a) => a.id !== d.id && a.day === d.day && hm(a.starts_at) < d.ends_at && hm(a.ends_at) > d.starts_at)
    : [];

  const edit = (a: Activity) => {
    if (!full) return;
    setError(null);
    const known = (ACTIVITY_TYPES as readonly string[]).includes(a.type);
    setDraft({
      id: a.id, type: known ? a.type : 'Otro', customType: known ? '' : a.type, name: a.name, speaker: a.speaker, venue: a.venue,
      day: a.day, starts_at: hm(a.starts_at), ends_at: hm(a.ends_at), capacity: a.capacity ? String(a.capacity) : '',
      packages: (a.activity_packages ?? []).map((x) => x.package_id),
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (d.ends_at <= d.starts_at) return setError('La hora de fin debe ser después del inicio.');
    setBusy(true);
    setError(null);
    try {
      const row = {
        event_id: event.id, type: effectiveType, name: d.name.trim(), speaker: d.speaker.trim(), venue: d.venue.trim(),
        day: d.day, starts_at: d.starts_at, ends_at: d.ends_at, capacity: d.capacity ? Number(d.capacity) : null,
      };
      let id = d.id;
      if (id) {
        const { error } = await supabase.from('activities').update(row).eq('id', id);
        if (error) throw error;
        const { error: e2 } = await supabase.from('activity_packages').delete().eq('activity_id', id);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from('activities').insert(row).select('id').single();
        if (error) throw error;
        id = data.id as string;
      }
      if (d.packages.length) {
        const { error } = await supabase.from('activity_packages').insert(d.packages.map((package_id) => ({ activity_id: id, package_id })));
        if (error) throw error;
      }
      await invalidate('activities', 'activity-stats');
      toast(d.id ? 'Actividad actualizada' : 'Actividad agregada al programa');
      setDraft(emptyDraft(d.day));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!d.id) return;
    const s = stats.data.get(d.id);
    const msg = s && (s.enrolled || s.attended)
      ? `Tiene ${s.enrolled} inscritos y ${s.attended} asistencias registradas que también se borrarán. ¿Eliminar la actividad?`
      : '¿Eliminar la actividad?';
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from('activities').delete().eq('id', d.id);
    if (error) return setError(friendlyError(error));
    await invalidate();
    setDraft(null);
    toast('Actividad eliminada');
  };

  return (
    <div className="with-aside narrow">
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="page-head">
          <div>
            <div className="kicker">{plural(all.length, 'actividad', 'actividades')} · {plural(days.data.length, 'día', 'días')}</div>
            <h2>Programa</h2>
          </div>
          <Link to="../asistencia" className="btn btn-secondary">Control de asistencia y QR →</Link>
        </div>
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <div className="chips">
            {['Todas', ...types].map((t) => {
              const st = t === 'Todas' ? null : typeStyle(t);
              const on = filter === t;
              return (
                <button
                  key={t}
                  type="button"
                  className="pill"
                  aria-pressed={on}
                  onClick={() => setFilter(t)}
                  style={{
                    fontWeight: 700,
                    background: on ? 'var(--color-text)' : st?.bg ?? '#fff',
                    color: on ? '#fff' : st?.fg,
                    borderColor: on ? 'var(--color-text)' : st?.bd ?? 'var(--color-text)',
                    boxShadow: on && t !== 'Todas' ? '0 0 0 2px var(--ev-200)' : undefined,
                  }}
                >
                  {t === 'Todas' ? `Todas ${all.length}` : t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="thead acts-grid"><span>Día</span><span>Horario</span><span>Actividad</span><span>Sede</span><span>Cupo</span></div>
        {!shown.length && <div className="empty">Aún no hay actividades. {full ? 'Agrégalas con el formulario.' : ''}</div>}
        {shown.map((a) => {
          const st = typeStyle(a.type);
          const sim = simultaneous(a, all).length;
          const n = stats.data.get(a.id)?.enrolled ?? 0;
          const isFull = a.capacity != null && n >= a.capacity;
          return (
            <button key={a.id} type="button" className={'trow acts-grid' + (d.id === a.id ? ' sel' : '')} style={{ paddingTop: 9, paddingBottom: 9, cursor: full ? 'pointer' : 'default' }} onClick={() => edit(a)}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{dayShort(a.day)}</span>
              <span style={{ fontSize: 13 }}>{timeRange(a.starts_at, a.ends_at)}</span>
              <div className="row" style={{ gap: 10, minWidth: 0 }}>
                <span className="tag tag-xs" style={{ background: st.bg, color: st.fg, borderColor: st.bd, flex: 'none' }}>{a.type}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title">{a.name}</div>
                  <div className="cell-sub">{a.speaker}</div>
                </div>
                {sim > 1 && <span style={{ fontSize: 11, color: 'var(--ev-700)', fontWeight: 600, flex: 'none' }}>· simultáneo ({sim})</span>}
              </div>
              <span style={{ fontSize: 13 }}>{a.venue}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: isFull ? 'var(--color-accent-700)' : undefined }}>
                {a.capacity ? `${n}/${a.capacity}` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <aside className="aside-panel">
        {!full ? (
          <>
            <h4>Programa</h4>
            <p className="muted" style={{ fontSize: 14 }}>Tu permiso es de registro y pagos: puedes consultar el programa pero no editarlo.</p>
          </>
        ) : (
          <form className="stack" style={{ gap: 16 }} onSubmit={save}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h4>{d.id ? 'Editar actividad' : 'Nueva actividad'}</h4>
              {d.id && <button type="button" className="link" onClick={() => setDraft(emptyDraft(d.day))}>Nueva</button>}
            </div>
            <Field label="Tipo">
              <div className="seg seg-grid">
                {[...ACTIVITY_TYPES, 'Otro'].map((t) => (
                  <button type="button" key={t} aria-pressed={t === 'Otro' ? isOther : d.type === t} onClick={() => set({ type: t })}>
                    {t === 'Otro' ? 'Otro…' : t}
                  </button>
                ))}
              </div>
              {isOther && <input className="input input-sm" value={d.customType} onChange={(e) => set({ customType: e.target.value })} placeholder="Exposición, torneo, visita…" />}
            </Field>
            <Field label="Nombre">
              <input className="input input-sm" required value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Lettering con pincel" />
            </Field>
            <Field label={speakerLabel(effectiveType)}>
              <input className="input input-sm" list="speakers" value={d.speaker} onChange={(e) => set({ speaker: e.target.value })} placeholder="Ana Valenzuela" />
              <datalist id="speakers">{speakers.map((p) => <option key={p.id} value={p.full_name} />)}</datalist>
            </Field>
            <div className="grid-3">
              <Field label="Día">
                <select className="input input-sm" value={d.day} onChange={(e) => set({ day: e.target.value })} style={{ paddingLeft: 10 }}>
                  {days.data.map((x) => <option key={x.day} value={x.day}>{dayShort(x.day)}</option>)}
                </select>
              </Field>
              <Field label="Inicio"><input className="input input-sm" type="time" required value={d.starts_at} onChange={(e) => set({ starts_at: e.target.value })} style={{ padding: 10 }} /></Field>
              <Field label="Fin"><input className="input input-sm" type="time" required value={d.ends_at} onChange={(e) => set({ ends_at: e.target.value })} style={{ padding: 10 }} /></Field>
            </div>
            {clash.length > 0 && (
              <div className="info-box">
                <b>Simultánea con {plural(clash.length, 'actividad', 'actividades')}:</b> {clash.map((a) => a.name).join(', ')}.
                {effectiveType === 'Taller' && clash.some((a) => a.type === 'Taller') ? ' Los participantes elegirán uno de este bloque.' : ''}
              </div>
            )}
            <div className="grid-2" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 8 }}>
              <Field label="Sede"><input className="input input-sm" value={d.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Lab. 5" /></Field>
              <Field label="Cupo"><input className="input input-sm" type="number" min={1} value={d.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="Libre" /></Field>
            </div>
            <Field label="Incluido en paquetes" hint={packages.data.length ? undefined : 'Crea paquetes para asignar actividades.'}>
              <div className="chips">
                {packages.data.map((p) => {
                  const on = d.packages.includes(p.id);
                  return (
                    <button key={p.id} type="button" className={'pill' + (on ? ' ev-on' : '')} style={on ? { fontWeight: 700, borderRadius: 12 } : { color: 'var(--color-neutral-600)' }}
                      onClick={() => set({ packages: on ? d.packages.filter((x) => x !== p.id) : [...d.packages, p.id] })}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            {error && <div className="alert">{error}</div>}
            <button className="btn btn-primary" disabled={busy} style={{ marginTop: 'auto' }}>
              {busy ? 'Guardando…' : d.id ? 'Guardar cambios' : 'Agregar al programa'}
            </button>
            {d.id && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Link to={`../asistencia/${d.id}`} className="link">QR de asistencia →</Link>
                <button type="button" className="link danger" onClick={remove}>Eliminar actividad</button>
              </div>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}
