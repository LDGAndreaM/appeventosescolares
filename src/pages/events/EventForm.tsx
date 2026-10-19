import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadEventAsset } from '../../lib/api';
import { PALETTES } from '../../lib/theme';
import { dayShort, eachDay, hm, initials, slugify } from '../../lib/format';
import type { EventDay, EventRow, EventStatus } from '../../lib/types';
import { Field, MonoBox, Segmented } from '../../components/ui';

export interface EventFormState {
  name: string;
  acronym: string;
  organizer: string;
  description: string;
  venue: string;
  logoUrl: string | null;
  logoFile: File | null;
  palette: string;
  color: string;
  color2: string;
  start: string;
  end: string;
  days: { day: string; starts_at: string; ends_at: string }[];
  registrationOpen: boolean;
  closesAt: string; // datetime-local
  status: EventStatus;
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function initialFormState(ev?: EventRow, days?: EventDay[]): EventFormState {
  if (!ev)
    return {
      name: '', acronym: '', organizer: '', description: '', venue: '', logoUrl: null, logoFile: null,
      palette: 'Cobalto', color: PALETTES[0][1], color2: PALETTES[0][3], start: '', end: '', days: [],
      registrationOpen: true, closesAt: '', status: 'draft',
    };
  return {
    name: ev.name, acronym: ev.acronym, organizer: ev.organizer, description: ev.description, venue: ev.venue,
    logoUrl: ev.logo_url, logoFile: null, palette: ev.palette, color: ev.color_primary, color2: ev.color_secondary ?? '',
    start: ev.start_date, end: ev.end_date,
    days: (days ?? []).map((d) => ({ day: d.day, starts_at: hm(d.starts_at), ends_at: hm(d.ends_at) })),
    registrationOpen: ev.registration_open, closesAt: toLocalInput(ev.registration_closes_at), status: ev.status,
  };
}

export function validate(s: EventFormState): string | null {
  if (!s.name.trim()) return 'Escribe el nombre del evento.';
  if (!s.start || !s.end) return 'Elige las fechas de inicio y fin.';
  if (s.end < s.start) return 'La fecha de fin debe ser posterior al inicio.';
  if (s.days.length > 31) return 'Un evento puede durar hasta 31 días.';
  if (s.days.some((d) => d.ends_at <= d.starts_at)) return 'Revisa los horarios: la hora de cierre debe ser después de la de inicio.';
  if (!/^#[0-9a-f]{6}$/i.test(s.color)) return 'El color principal debe ser un HEX como #3047c8.';
  if (s.color2 && !/^#[0-9a-f]{6}$/i.test(s.color2)) return 'El color secundario debe ser un HEX como #e3e6fa.';
  return null;
}

/**
 * Crea o actualiza el evento con sus días y logo. `onCreated` avisa el id en cuanto el evento
 * existe, para que un reintento lo actualice en vez de duplicarlo. Si solo falla el logo,
 * el evento queda guardado y se devuelve `logoError`.
 */
export async function saveEvent(
  s: EventFormState,
  existing?: Pick<EventRow, 'id'>,
  onCreated?: (id: string) => void,
): Promise<{ id: string; logoError?: string }> {
  const acronym = (s.acronym.trim() || initials(s.name)).slice(0, 6);
  const fields = {
    name: s.name.trim(), acronym, organizer: s.organizer.trim(), description: s.description.trim(), venue: s.venue.trim(),
    palette: s.palette, color_primary: s.color.toLowerCase(), color_secondary: s.color2 ? s.color2.toLowerCase() : null,
    start_date: s.start, end_date: s.end, registration_open: s.registrationOpen,
    registration_closes_at: s.closesAt ? new Date(s.closesAt).toISOString() : null, status: s.status,
    ...(existing && !s.logoUrl ? { logo_url: null } : {}),
  };
  let id = existing?.id;
  if (!id) {
    id = crypto.randomUUID();
    const prefix = (acronym.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'EV') + s.start.slice(2, 4);
    const slug = `${slugify(s.name).slice(0, 48)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.from('events').insert({ id, slug, code_prefix: prefix, ...fields });
    if (error) throw error;
    onCreated?.(id);
  } else {
    const { error } = await supabase.from('events').update(fields).eq('id', id);
    if (error) throw error;
  }
  const { error: dErr } = await supabase.from('event_days').upsert(
    s.days.map((d) => ({ event_id: id, day: d.day, starts_at: d.starts_at, ends_at: d.ends_at })),
  );
  if (dErr) throw dErr;
  const keep = s.days.map((d) => d.day);
  if (existing) {
    const { error } = await supabase.from('event_days').delete().eq('event_id', id).not('day', 'in', `(${keep.join(',')})`);
    if (error) throw error;
  }
  if (s.logoFile) {
    try {
      const ext = s.logoFile.name.split('.').pop()?.toLowerCase() || 'png';
      // nombre nuevo en cada subida: solo requiere permiso de crear archivo, no de reemplazar
      const url = await uploadEventAsset(id, `logo-${Date.now()}.${ext}`, s.logoFile);
      const { error } = await supabase.from('events').update({ logo_url: url }).eq('id', id);
      if (error) throw error;
    } catch (e) {
      return { id, logoError: (e as Error).message };
    }
  }
  return { id };
}

export default function EventForm({ s, set, disabled }: { s: EventFormState; set: (p: Partial<EventFormState>) => void; disabled?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const setRange = (start: string, end: string) => {
    const valid = start && end && end >= start;
    const days = valid
      ? eachDay(start, end).map((day) => s.days.find((d) => d.day === day) ?? { day, starts_at: '09:00', ends_at: '18:00' })
      : s.days;
    set({ start, end, days });
  };
  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) return;
    set({ logoFile: f, logoUrl: URL.createObjectURL(f) });
  };
  const isCustom = !PALETTES.some(([, a]) => a.toLowerCase() === s.color.toLowerCase());

  return (
    <fieldset disabled={disabled} className="editor-cols" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <section>
        <h4>1 · Datos generales</h4>
        <Field label="Nombre del evento">
          <input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jornadas de Diseño AD 2026" required />
        </Field>
        <div className="grid-2" style={{ gridTemplateColumns: '120px 1fr' }}>
          <Field label="Siglas" hint="Para el logo y los folios">
            <input className="input" value={s.acronym} maxLength={6} onChange={(e) => set({ acronym: e.target.value.toUpperCase() })} placeholder={initials(s.name) || 'AD'} />
          </Field>
          <Field label="Organiza">
            <input className="input" value={s.organizer} onChange={(e) => set({ organizer: e.target.value })} placeholder="Academia de Diseño · ITSON" />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea className="input" value={s.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Logo">
          <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
            <div
              className={'logo-drop' + (drag ? ' drag' : '')}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
            >
              {s.logoUrl ? <img src={s.logoUrl} alt="Logo del evento" /> : <span>logo del evento<br />PNG / SVG</span>}
            </div>
            <div className="stack muted" style={{ justifyContent: 'center', gap: 8, fontSize: 13 }}>
              <span>Arrastra el archivo o</span>
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => fileRef.current?.click()}>Subir logo</button>
              <span>Cuadrado, mínimo 512 px</span>
              {s.logoUrl && <button type="button" className="link danger" style={{ alignSelf: 'flex-start' }} onClick={() => set({ logoUrl: null, logoFile: null })}>Quitar logo</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>
        </Field>
        <Field label="Sede principal">
          <input className="input" value={s.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="ITSON Campus Náinari, Cd. Obregón" />
        </Field>
      </section>

      <section>
        <h4>2 · Paleta de colores</h4>
        <p style={{ fontSize: 13 }} className="muted">Tiñe el panel del evento, el formulario público y el itinerario.</p>
        <div className="palettes">
          {PALETTES.map(([name, a, b, c]) => {
            const on = a.toLowerCase() === s.color.toLowerCase();
            return (
              <button type="button" key={name} className={'palette' + (on ? ' on' : '')} onClick={() => set({ palette: name, color: a, color2: c })}>
                <div className="sw">
                  <div style={{ flex: 2, background: a }} />
                  <div style={{ flex: 1, background: b }} />
                  <div style={{ flex: 1, background: c }} />
                </div>
                <div className="lbl"><span>{name}</span><span>{on ? '●' : ''}</span></div>
              </button>
            );
          })}
        </div>
        <Field label="Personalizada (HEX)">
          <div className="grid-2" style={{ gap: 8 }}>
            {(['color', 'color2'] as const).map((k) => (
              <label key={k} className="input input-sm hex-input" style={{ borderRadius: k === 'color2' ? 999 : 12 }}>
                <input type="color" value={s[k] || '#ffffff'} aria-label={k === 'color' ? 'Color principal' : 'Color secundario'}
                  onChange={(e) => set(k === 'color' ? { color: e.target.value, palette: 'Personalizada' } : { color2: e.target.value })} />
                <input
                  value={s[k]}
                  onChange={(e) => set(k === 'color' ? { color: e.target.value, palette: 'Personalizada' } : { color2: e.target.value })}
                  placeholder={k === 'color' ? 'Principal' : 'Secundario'}
                  style={{ border: 0, outline: 0, font: 'inherit', width: '100%', minWidth: 0, background: 'transparent' }}
                />
              </label>
            ))}
          </div>
          {isCustom && <span className="field-hint">Usando color personalizado.</span>}
        </Field>
        <div style={{ marginTop: 'auto', border: '1.5px solid var(--color-neutral-300)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'var(--ev)', color: '#fff', padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <MonoBox logo={s.logoUrl} text={s.acronym || initials(s.name) || 'AD'} size={40} fontSize={12} outline={!s.logoUrl} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Vista previa</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 8, background: '#fff' }}>
            <span className="tag" style={{ background: 'var(--ev)', color: '#fff', fontSize: 12 }}>Conferencia</span>
            <span className="tag" style={{ background: 'var(--ev-100)', color: 'var(--ev-800)', borderColor: 'var(--ev)', fontSize: 12 }}>Taller</span>
          </div>
        </div>
      </section>

      <section>
        <h4>3 · Fechas y horarios</h4>
        <div className="grid-2">
          <Field label="Inicia">
            <input className="input" type="date" value={s.start} onChange={(e) => setRange(e.target.value, s.end && s.end >= e.target.value ? s.end : e.target.value)} required />
          </Field>
          <Field label="Termina">
            <input className="input" type="date" value={s.end} min={s.start} onChange={(e) => setRange(s.start, e.target.value)} required />
          </Field>
        </div>
        <div className="stack">
          <label className="label" style={{ marginBottom: 6 }}>Horario por día</label>
          {s.days.length === 0 && <span className="field-hint">Elige las fechas para definir el horario de cada día.</span>}
          {s.days.map((d, i) => (
            <div key={d.day} className="day-hours">
              <span style={{ fontSize: 14, fontWeight: 600 }}>{dayShort(d.day)}</span>
              {(['starts_at', 'ends_at'] as const).map((k) => (
                <input key={k} className="input input-xs" type="time" value={d[k]} aria-label={`${k === 'starts_at' ? 'Abre' : 'Cierra'} ${dayShort(d.day)}`}
                  onChange={(e) => set({ days: s.days.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} />
              ))}
            </div>
          ))}
        </div>
        <Field label="Registro público">
          <Segmented
            value={s.registrationOpen ? 'open' : 'closed'}
            options={[{ value: 'open', label: 'Abierto' }, { value: 'closed', label: 'Cerrado' }]}
            onChange={(v) => set({ registrationOpen: v === 'open' })}
          />
        </Field>
        {s.registrationOpen && (
          <Field label="Cierra el" hint="Opcional. Después de esta fecha el formulario deja de recibir registros.">
            <input className="input input-sm" type="datetime-local" value={s.closesAt} onChange={(e) => set({ closesAt: e.target.value })} />
          </Field>
        )}
      </section>
    </fieldset>
  );
}
