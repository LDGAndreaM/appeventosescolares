import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePublicEvent } from '../../lib/api';
import { supabase, errorCode } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, firstName, money, rangeShort, timeRange } from '../../lib/format';
import { packageBlocks } from '../../lib/schedule';
import { CAREERS } from '../../lib/people';
import { PROFILES, type PersonProfile } from '../../lib/types';
import { Field, Loading } from '../../components/ui';
import FullActivityModal, { type SlotOption } from '../../components/FullActivityModal';
import { PublicHero, PublicMessage, PublicShell } from './PublicShell';
import '../event/event.css';

type Step = 1 | 2 | 3 | 4;

export default function Register() {
  const { slug = '' } = useParams();
  const q = usePublicEvent(slug);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({ full_name: '', email: '', profile: 'Estudiante' as PersonProfile, career: '', semester: null as number | null });
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [full, setFull] = useState<{ act: SlotOption; block: SlotOption[]; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number } | null>(null);

  const ev = q.data;
  const pkgActs = useMemo(() => (ev && pkgId ? ev.activities.filter((a) => a.package_ids.includes(pkgId)) : []), [ev, pkgId]);
  const blocks = useMemo(() => packageBlocks(pkgActs), [pkgActs]);

  if (q.isLoading) return <PublicShell><Loading /></PublicShell>;
  if (!ev) return <PublicMessage title="Evento no disponible" text="El enlace no existe o el evento todavía no está publicado." />;

  const pkg = ev.packages.find((p) => p.id === pkgId) ?? null;
  const limit = pkg?.workshop_limit ?? blocks.choices.length;
  const chosen = Object.values(choices).filter(Boolean) as string[];
  const isFull = (a: SlotOption) => a.capacity != null && a.enrolled >= a.capacity;
  const set = (p: Partial<typeof form>) => setForm({ ...form, ...p });

  if (done)
    return (
      <PublicShell color={ev.color_primary}>
        <PublicHero label="Registro" logo={ev.logo_url} acronym={ev.acronym} title={ev.name} sub={`${rangeShort(ev.start_date, ev.end_date)}${ev.venue ? ` · ${ev.venue}` : ''}`} />
        <div className="stack" style={{ padding: '24px 20px', gap: 14, flex: 1 }}>
          <div className="card row" style={{ padding: 18, gap: 14 }}>
            <span style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--af-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>✓</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>¡Listo, {firstName(form.full_name)}!</div>
              <div style={{ fontSize: 13 }} className="muted">Quedaste registrado con {form.email}. Usa este correo para marcar tu asistencia con los QR del evento.</div>
            </div>
          </div>
          {pkg && (
            <div className="card stack" style={{ padding: 18, gap: 6 }}>
              <span className="kicker">Tu paquete</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{pkg.name} · {money(done.amount)}</span>
              <span style={{ fontSize: 13 }} className="muted">Puedes pagar en abonos en la mesa de registro. Te daremos tu comprobante ahí.</span>
            </div>
          )}
          <Link to={`/r/${slug}/itinerario`} className="btn btn-primary btn-xl" style={{ marginTop: 'auto' }}>Ver itinerario →</Link>
        </div>
      </PublicShell>
    );

  const pickOption = (block: SlotOption[], a: SlotOption) => {
    const key = block[0].id;
    if (choices[key] === a.id) return setChoices({ ...choices, [key]: null });
    if (isFull(a)) return setFull({ act: a, block, key });
    if (!choices[key] && chosen.length >= limit) return setError(`Tu paquete incluye ${limit} ${limit === 1 ? 'taller' : 'talleres'}. Quita uno para elegir otro.`);
    setError(null);
    setChoices({ ...choices, [key]: a.id });
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const ids = [...blocks.automatic.map((a) => a.id), ...chosen];
    const { data, error } = await supabase.rpc('public_register', {
      p_slug: slug,
      p_person: { ...form, career: form.profile === 'Estudiante' ? form.career : '', semester: form.profile === 'Estudiante' && form.semester ? String(form.semester) : '' },
      p_package_id: pkgId,
      p_activity_ids: ids,
    });
    setBusy(false);
    if (error) {
      if (errorCode(error) === 'ACTIVITY_FULL') {
        const fresh = await q.refetch();
        const actId = (error as { details?: string }).details;
        const acts = fresh.data?.activities ?? [];
        const act = acts.find((a) => a.id === actId);
        const block = blocks.choices.find((b) => b.some((x) => x.id === actId));
        if (act && block) {
          setFull({ act, block: block.map((b) => acts.find((x) => x.id === b.id) ?? b), key: block[0].id });
          return;
        }
      }
      return setError(friendlyError(error));
    }
    setDone({ amount: Number((data as { amount_due: number }).amount_due) });
  };

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!form.full_name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Escribe tu nombre completo y un correo válido.');
      if (form.profile === 'Estudiante' && (!form.career.trim() || !form.semester)) return setError('Elige tu carrera y semestre.');
      if (!ev.packages.length) return void submit();
      return setStep(2);
    }
    if (step === 2) {
      if (!pkgId) return setError('Elige un paquete.');
      if (!blocks.choices.length) return void submit();
      return setStep(3);
    }
    return void submit();
  };

  const closed = !ev.registration_open;

  return (
    <PublicShell color={ev.color_primary}>
      <PublicHero label="Registro" logo={ev.logo_url} acronym={ev.acronym} title={ev.name} sub={`${rangeShort(ev.start_date, ev.end_date)}${ev.venue ? ` · ${ev.venue}` : ''}`} />
      {closed ? (
        <div className="stack" style={{ padding: '24px 20px', gap: 14 }}>
          <h4>El registro está cerrado</h4>
          <p className="muted" style={{ fontSize: 14 }}>Si necesitas inscribirte, acércate a la mesa de registro del evento.</p>
          <Link to={`/r/${slug}/itinerario`} className="btn btn-primary btn-xl">Ver itinerario →</Link>
        </div>
      ) : (
        <>
          <div className="steps">
            {['Datos', 'Paquete', 'Talleres'].map((s, i) => (
              <span key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} onClick={() => step > i + 1 && setStep((i + 1) as Step)} style={{ cursor: step > i + 1 ? 'pointer' : undefined }}>
                {i + 1} {s}
              </span>
            ))}
          </div>
          <div className="stack" style={{ padding: '16px 20px 20px', gap: 12, flex: 1 }}>
            {step === 1 && (
              <>
                <Field label="Nombre completo"><input className="input" value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="name" style={{ minHeight: 48 }} /></Field>
                <Field label="Correo"><input className="input" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" inputMode="email" style={{ minHeight: 48 }} /></Field>
                <Field label="Soy">
                  <div className="chips">
                    {PROFILES.map((p) => (
                      <button key={p} type="button" className={'pill pill-lg' + (form.profile === p ? ' ev-on' : '')} style={form.profile === p ? undefined : { background: '#fff', borderColor: 'var(--color-neutral-400)' }} onClick={() => set({ profile: p })}>{p}</button>
                    ))}
                  </div>
                </Field>
                {form.profile === 'Estudiante' && (
                  <>
                    <Field label="Carrera">
                      <input className="input" list="careers-public" value={form.career} onChange={(e) => set({ career: e.target.value })} placeholder="Elige o escribe" style={{ minHeight: 48 }} />
                      <datalist id="careers-public">{CAREERS.map((c) => <option key={c} value={c} />)}</datalist>
                    </Field>
                    <Field label="Semestre">
                      <div className="semesters lg">
                        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                          <button key={n} type="button" aria-pressed={form.semester === n} onClick={() => set({ semester: n })}>{n}</button>
                        ))}
                      </div>
                    </Field>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h4>Elige tu paquete</h4>
                {ev.packages.map((p) => (
                  <button key={p.id} type="button" className={'option' + (pkgId === p.id ? ' on' : '')} style={{ alignItems: 'start' }} onClick={() => { setPkgId(p.id); setChoices({}); }}>
                    <span className={'dot' + (pkgId === p.id ? ' on' : '')} style={{ marginTop: 3 }} />
                    <div>
                      <div className="t">{p.name}</div>
                      {p.description && <div className="d">{p.description}</div>}
                      {p.includes.length > 0 && <div className="d" style={{ marginTop: 4 }}>{p.includes.join(' · ')}</div>}
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ev)' }}>{money(p.price)}</span>
                  </button>
                ))}
              </>
            )}

            {step === 3 && (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h4>Elige tus talleres</h4>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ev-700)' }}>{chosen.length} de {limit}</span>
                </div>
                <p style={{ fontSize: 13 }} className="muted">Estos talleres son al mismo tiempo: elige uno por bloque. Las conferencias de tu paquete se agregan solas.</p>
                {blocks.choices.map((b) => {
                  const end = b.reduce((m, a) => (a.ends_at > m ? a.ends_at : m), b[0].ends_at);
                  return (
                    <div key={b[0].id} className="stack divider-top" style={{ borderTopColor: 'var(--color-neutral-300)' }}>
                      <div style={{ padding: '8px 0', fontSize: 12, fontWeight: 700 }}>{dayShort(b[0].day)} · {timeRange(b[0].starts_at, end)}</div>
                      {b.map((a) => {
                        const on = choices[b[0].id] === a.id;
                        const f = isFull(a);
                        return (
                          <button key={a.id} type="button" className={'block-opt' + (on ? ' on' : '') + (f && !on ? ' full' : '')} style={{ padding: '10px 12px' }} onClick={() => pickOption(b, a)}>
                            <span className={'dot' + (on ? ' on' : '')} />
                            <div style={{ minWidth: 0 }}>
                              <div className="t">{a.name}</div>
                              <div className="r">{[a.speaker, a.venue].filter(Boolean).join(' · ')}</div>
                            </div>
                            <span className="c">{a.capacity ? (f ? 'Lleno' : `${a.capacity - a.enrolled} lugares`) : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}

            {error && <div className="alert">{error}</div>}
            <button className="btn btn-primary btn-xl" style={{ marginTop: 'auto' }} disabled={busy} onClick={next}>
              {busy ? 'Registrando…' : step === 1 ? (ev.packages.length ? 'Continuar: elegir paquete →' : 'Registrarme →') : step === 2 ? (blocks.choices.length ? 'Continuar: elegir talleres →' : 'Registrarme →') : 'Confirmar registro →'}
            </button>
          </div>
        </>
      )}
      {full && (
        <FullActivityModal
          full={full.act}
          alternatives={full.block}
          personName={form.full_name}
          onClose={() => setFull(null)}
          onChoose={(id) => { setChoices({ ...choices, [full.key]: id }); setFull(null); }}
        />
      )}
    </PublicShell>
  );
}
