import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEventCtx } from '../../layout/EventLayout';
import {
  useActivities, useActivityStats, useBalances, useEnrollments, useInvalidateEvent, usePackages, usePayments, usePerson,
} from '../../lib/api';
import { supabase, errorCode } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, dmy, money, timeRange, todayISO } from '../../lib/format';
import { packageBlocks } from '../../lib/schedule';
import { CAREERS } from '../../lib/people';
import { METHODS, PROFILES, ROLES, type Activity, type Method, type Person, type PersonProfile, type Role } from '../../lib/types';
import { Field, Loading, Progress, useToast } from '../../components/ui';
import FullActivityModal, { type SlotOption } from '../../components/FullActivityModal';
import './event.css';

interface Draft {
  full_name: string;
  email: string;
  role: Role;
  profile: PersonProfile | null;
  career: string;
  semester: number | null;
  package_id: string | null;
}

const fromPerson = (p?: Person): Draft => ({
  full_name: p?.full_name ?? '',
  email: p?.email ?? '',
  role: p?.role ?? 'Participante',
  profile: p?.profile ?? 'Estudiante',
  career: p?.career ?? '',
  semester: p?.semester ?? null,
  package_id: p?.package_id ?? null,
});

type Choice = { id: string; status: 'enrolled' | 'waitlist' };

export default function PersonDetailRoute() {
  const { personId } = useParams();
  const loc = useLocation();
  // cada «nueva persona» (incluido «Guardar y agregar otra») empieza con el formulario limpio
  return <PersonDetail key={personId ?? `new-${loc.key}`} />;
}

function PersonDetail() {
  const params = useParams();
  const [search] = useSearchParams();
  const [createdId, setCreatedId] = useState<string | null>(null);
  /** id de la persona: el de la URL o el recién creado si el primer guardado se detuvo por cupo lleno. */
  const personId = params.personId ?? createdId ?? undefined;
  const { event } = useEventCtx();
  const nav = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateEvent(event.id);
  const person = usePerson(event.id, personId);
  const packages = usePackages(event.id);
  const activities = useActivities(event.id);
  const stats = useActivityStats(event.id);
  const enrollments = useEnrollments(event.id);
  const payments = usePayments(event.id, personId ?? null);
  const balances = useBalances(event.id);

  const [d, setD] = useState<Draft | null>(() => {
    if (params.personId) return null;
    // «Guardar y agregar otra» conserva el rol y la descripción de la persona anterior
    const draft = fromPerson();
    const rol = search.get('rol');
    const perfil = search.get('perfil');
    if (rol && (ROLES as readonly string[]).includes(rol)) draft.role = rol as Role;
    if (perfil && (PROFILES as readonly string[]).includes(perfil)) draft.profile = perfil as PersonProfile;
    return draft;
  });
  /** Elección por bloque simultáneo (clave = id de la primera actividad del bloque). */
  const [choices, setChoices] = useState<Record<string, Choice | null> | null>(params.personId ? null : {});
  const [full, setFull] = useState<{ act: SlotOption; block: SlotOption[]; key: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState({ date: todayISO(), method: 'Transferencia' as Method, amount: '' });
  /** Abonos capturados antes de guardar a una persona nueva; se registran al guardar. */
  const [pending, setPending] = useState<{ date: string; method: Method; amount: number }[]>([]);

  const draftPkg = d?.package_id ?? null;
  const pkgActs = useMemo(
    () => (activities.data ?? []).filter((a) => draftPkg && a.activity_packages?.some((x) => x.package_id === draftPkg)),
    [activities.data, draftPkg],
  );
  const blocks = useMemo(() => packageBlocks(pkgActs), [pkgActs]);
  const mine = useMemo(() => (enrollments.data ?? []).filter((e) => e.person_id === personId), [enrollments.data, personId]);

  useEffect(() => {
    if (person.data && !d) setD(fromPerson(person.data));
  }, [person.data, d]);
  useEffect(() => {
    if (choices || !params.personId || !enrollments.data || !activities.data || !d) return;
    const init: Record<string, Choice | null> = {};
    for (const b of blocks.choices) {
      const e = mine.find((x) => b.some((a) => a.id === x.activity_id));
      init[b[0].id] = e ? { id: e.activity_id, status: e.status } : null;
    }
    setChoices(init);
  }, [choices, params.personId, enrollments.data, activities.data, d, blocks, mine]);

  if (!d || !choices || !packages.data || !activities.data || !stats.data || !balances.data || (personId && !payments.data))
    return <Loading />;

  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const isParticipant = d.role === 'Participante';
  const pkg = packages.data.find((p) => p.id === d.package_id) ?? null;
  const limit = pkg?.workshop_limit ?? blocks.choices.length;
  const chosenCount = Object.values(choices).filter(Boolean).length;
  const enrolledIn = (id: string) => mine.some((e) => e.activity_id === id && e.status === 'enrolled');
  const slot = (a: Activity): SlotOption => ({ ...a, enrolled: stats.data!.get(a.id)?.enrolled ?? 0 });
  const isFull = (a: Activity) => a.capacity != null && !enrolledIn(a.id) && (stats.data!.get(a.id)?.enrolled ?? 0) >= a.capacity;

  const due = isParticipant && pkg ? pkg.price : 0;
  const paid = (payments.data ?? []).reduce((s, p) => s + p.amount, 0) + pending.reduce((s, p) => s + p.amount, 0);
  const saldo = Math.max(due - paid, 0);
  const settled = person.data?.settled_on;

  const pickOption = (block: Activity[], a: Activity) => {
    const key = block[0].id;
    const cur = choices[key];
    if (cur?.id === a.id) return setChoices({ ...choices, [key]: null });
    if (isFull(a)) return setFull({ act: slot(a), block: block.map(slot), key });
    if (!cur && chosenCount >= limit) return toast(`El paquete ${pkg?.name ?? ''} incluye ${limit} ${limit === 1 ? 'taller' : 'talleres'}. Quita uno para elegir otro.`, true);
    setChoices({ ...choices, [key]: { id: a.id, status: 'enrolled' } });
  };

  /** Guarda la persona y sincroniza sus inscripciones con el paquete y las elecciones. */
  const save = async (andNew = false) => {
    if (!d.full_name.trim() || !d.email.trim()) return setError('Escribe nombre y correo.');
    if (isParticipant && d.profile === 'Estudiante' && !d.career.trim()) return setError('Elige la carrera del estudiante.');
    setBusy(true);
    setError(null);
    try {
      const row = {
        event_id: event.id, full_name: d.full_name.trim(), email: d.email.trim(), role: d.role, profile: d.profile,
        career: d.profile === 'Estudiante' ? d.career.trim() || null : null,
        semester: d.profile === 'Estudiante' ? d.semester : null,
        package_id: isParticipant ? d.package_id : null, amount_due: due,
      };
      let id = personId;
      if (id) {
        const { error } = await supabase.from('people').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('people').insert(row).select('id').single();
        if (error) throw error;
        id = data.id as string;
        setCreatedId(id);
      }

      const desired = new Map<string, 'enrolled' | 'waitlist'>();
      if (isParticipant && pkg) {
        for (const a of blocks.automatic) desired.set(a.id, mine.find((e) => e.activity_id === a.id)?.status ?? 'enrolled');
        for (const c of Object.values(choices)) if (c) desired.set(c.id, c.status);
      }
      const remove = mine.filter((e) => !desired.has(e.activity_id)).map((e) => e.activity_id);
      if (remove.length) {
        const { error } = await supabase.from('enrollments').delete().eq('person_id', id).in('activity_id', remove);
        if (error) throw error;
      }
      const waitlisted: string[] = [];
      for (const [activity_id, status] of desired) {
        const cur = mine.find((e) => e.activity_id === activity_id);
        if (cur?.status === status) continue;
        const { error } = await supabase.from('enrollments').upsert({ event_id: event.id, activity_id, person_id: id, status });
        if (error && errorCode(error) === 'ACTIVITY_FULL') {
          const act = activities.data!.find((a) => a.id === activity_id)!;
          const blockOf = blocks.choices.find((b) => b.some((a) => a.id === activity_id));
          if (!blockOf) {
            // actividad incluida sin alternativa: queda en lista de espera
            await supabase.from('enrollments').upsert({ event_id: event.id, activity_id, person_id: id, status: 'waitlist' });
            waitlisted.push(act.name);
            continue;
          }
          await invalidate('activity-stats', 'enrollments');
          const fresh = await supabase.from('activity_stats').select('*').in('activity_id', blockOf.map((a) => a.id));
          const count = new Map((fresh.data ?? []).map((r) => [r.activity_id as string, r.enrolled as number]));
          setFull({ act: { ...act, enrolled: count.get(act.id) ?? act.capacity ?? 0 }, block: blockOf.map((a) => ({ ...a, enrolled: count.get(a.id) ?? 0 })), key: blockOf[0].id });
          throw new Error('ACTIVITY_FULL');
        }
        if (error) throw error;
      }
      if (pending.length && isParticipant && pkg) {
        const { error } = await supabase.from('payments').insert(
          pending.map((x) => ({ event_id: event.id, person_id: id, amount: x.amount, paid_on: x.date, method: x.method })),
        );
        if (error) throw error;
        setPending([]);
      }
      await invalidate('people', 'enrollments', 'activity-stats', 'balances', 'payments', `person-${id}`);
      toast(waitlisted.length ? `Guardado. ${waitlisted.join(', ')} está lleno: quedó en lista de espera.` : andNew ? `${d.full_name.trim()} guardado. Agrega a la siguiente persona.` : 'Cambios guardados');
      if (andNew) nav(`../participantes/nuevo?${new URLSearchParams({ rol: d.role, perfil: d.profile ?? '' })}`);
      else if (!params.personId) nav(`../participantes/${id}`, { replace: true });
    } catch (err) {
      if ((err as Error).message !== 'ACTIVITY_FULL') setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async () => {
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) return toast('Escribe el monto del abono.', true);
    if (!personId) {
      // persona nueva: el abono se guarda junto con la ficha
      setPending([...pending, { date: pay.date, method: pay.method, amount }]);
      setPay({ ...pay, amount: '' });
      return toast('Abono agregado · se registrará al guardar');
    }
    const { error } = await supabase.from('payments').insert({ event_id: event.id, person_id: personId, amount, paid_on: pay.date, method: pay.method });
    if (error) return toast(friendlyError(error), true);
    await invalidate(`payments-${personId}`, 'payments', 'balances', 'people', `person-${personId}`);
    setPay({ ...pay, amount: '' });
    toast(amount >= saldo && saldo > 0 ? 'Abono registrado · paquete liquidado' : 'Abono registrado');
  };

  const deletePayment = async (id: string) => {
    if (!window.confirm('¿Eliminar este abono?')) return;
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) return toast(friendlyError(error), true);
    await invalidate(`payments-${personId}`, 'payments', 'balances', 'people', `person-${personId}`);
  };

  const removePerson = async () => {
    if (!personId || !window.confirm(`¿Eliminar a ${d.full_name}? También se borran sus abonos, inscripciones y asistencias.`)) return;
    const { error } = await supabase.from('people').delete().eq('id', personId);
    if (error) return toast(friendlyError(error), true);
    await invalidate();
    nav('../participantes');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker"><Link to="../participantes" style={{ color: 'inherit', textDecoration: 'none' }}>Participantes</Link> / {personId ? 'ficha' : 'nueva persona'}</div>
          <h2>{d.full_name || 'Nueva persona'}</h2>
        </div>
        <div className="page-actions">
          {personId ? (
            <Link to={`../participantes/nuevo?${new URLSearchParams({ rol: d.role, perfil: d.profile ?? '' })}`} className="btn btn-secondary">+ Agregar otra persona</Link>
          ) : (
            <button className="btn btn-secondary" disabled={busy} onClick={() => save(true)}>Guardar y agregar otra</button>
          )}
          <button className="btn btn-primary" style={{ minWidth: 140 }} disabled={busy} onClick={() => save()}>{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
      {error && <div className="alert" style={{ margin: '16px 36px 0' }}>{error}</div>}
      <div className="person-cols">
        <section>
          <h5>Datos</h5>
          <Field label="Nombre"><input className="input input-sm" value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} /></Field>
          <Field label="Correo"><input className="input input-sm" type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Rol en el evento">
            <select className="input input-sm" value={d.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Descripción">
            <div className="chips">
              {PROFILES.map((p) => (
                <button key={p} type="button" className={'pill pill-md' + (d.profile === p ? ' ev-on' : '')} style={d.profile === p ? undefined : { background: '#fff', borderColor: 'var(--color-neutral-400)' }} onClick={() => set({ profile: p })}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          {d.profile === 'Estudiante' && (
            <>
              <Field label="Carrera">
                <input className="input input-sm" list="careers" value={d.career} onChange={(e) => set({ career: e.target.value })} placeholder="Elige o escribe" />
                <datalist id="careers">{CAREERS.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Semestre">
                <div className="semesters">
                  {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" aria-pressed={d.semester === n} onClick={() => set({ semester: d.semester === n ? null : n })}>{n}</button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {personId && <button type="button" className="link danger" style={{ alignSelf: 'flex-start', marginTop: 'auto' }} onClick={removePerson}>Eliminar persona</button>}
        </section>

        <section>
          <h5>Paquete</h5>
          {!isParticipant ? (
            <p className="muted" style={{ fontSize: 14 }}>Los paquetes y abonos aplican solo a personas con rol Participante.</p>
          ) : (
            <>
              <div className="stack" style={{ border: '1.5px solid var(--color-neutral-300)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                {packages.data.map((p, i) => {
                  const on = d.package_id === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => { set({ package_id: on ? null : p.id }); setChoices({}); }}
                      style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 0, borderTop: i ? '1px solid var(--color-divider)' : 0, background: on ? 'var(--ev-100)' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      <span className="row" style={{ gap: 10 }}>
                        <span className={'dot' + (on ? ' on' : '')} />
                        <span style={{ fontSize: 14, fontWeight: on ? 800 : 400 }}>{p.name}</span>
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{money(p.price)}</span>
                    </button>
                  );
                })}
                {!packages.data.length && <div className="empty" style={{ padding: 16 }}>Crea paquetes en <Link to="../paquetes">Paquetes</Link>.</div>}
              </div>
              <div className="money-3">
                <div><span className="k">A pagar</span><span className="v">{money(due)}</span></div>
                <div><span className="k">Abonado</span><span className="v">{money(paid)}</span></div>
                <div><span className="k">Saldo</span><span className="v" style={{ color: 'var(--ev)' }}>{money(saldo)}</span></div>
              </div>
              <div style={{ marginTop: -8 }}><Progress lg pct={due ? (paid / due) * 100 : 0} /></div>
              {person.data && person.data.package_id !== d.package_id && <div className="info-box">Guarda para aplicar el cambio de paquete.</div>}
              <div>
                <div className="abono-grid" style={{ padding: '8px 0', fontSize: 12, fontWeight: 700, borderBottom: '1px solid var(--color-neutral-300)' }}>
                  <span>Fecha</span><span>Método · recibió</span><span style={{ textAlign: 'right' }}>Monto</span>
                </div>
                {(payments.data ?? []).map((p) => (
                  <div key={p.id} className="abono-grid" style={{ borderBottom: '1px solid var(--color-divider)' }}>
                    <span>{dmy(p.paid_on)}</span>
                    <span className="ellipsis">{p.method}{p.received_by_name ? ` · ${p.received_by_name}` : ''}</span>
                    <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <b>{money(p.amount)}</b>
                      <button type="button" className="link" aria-label="Eliminar abono" title="Eliminar abono" style={{ color: 'var(--color-neutral-500)' }} onClick={() => deletePayment(p.id)}>×</button>
                    </span>
                  </div>
                ))}
                {pending.map((x, i) => (
                  <div key={i} className="abono-grid" style={{ borderBottom: '1px solid var(--color-divider)' }}>
                    <span>{dmy(x.date)}</span>
                    <span className="ellipsis">{x.method} · <i className="muted">por guardar</i></span>
                    <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <b>{money(x.amount)}</b>
                      <button type="button" className="link" aria-label="Quitar abono" title="Quitar abono" style={{ color: 'var(--color-neutral-500)' }} onClick={() => setPending(pending.filter((_, j) => j !== i))}>×</button>
                    </span>
                  </div>
                ))}
                <>
                    <div className="abono-grid">
                      <input className="input input-xs" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} aria-label="Fecha del abono" />
                      <select className="input input-xs" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as Method })} aria-label="Método">
                        {METHODS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                      <input className="input input-xs" type="number" min={0} step="0.01" placeholder="$0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} style={{ textAlign: 'right' }} aria-label="Monto" />
                    </div>
                    <button type="button" className="btn btn-outline btn-sm btn-block" disabled={personId ? !person.data?.package_id : !d.package_id} onClick={addPayment}>+ Registrar abono</button>
                    {!d.package_id && <p className="field-hint" style={{ paddingTop: 6 }}>Elige un paquete para registrar abonos.</p>}
                </>
              </div>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, paddingTop: 4 }}>
                <span>Fecha de liquidación</span>
                {settled ? <b>{dmy(settled)}</b> : <span className="muted">Se registra al saldar</span>}
              </div>
            </>
          )}
        </section>

        <section>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h5>Talleres y conferencias</h5>
            {pkg && blocks.choices.length > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ev-700)' }}>{chosenCount} de {limit} talleres</span>}
          </div>
          {!isParticipant || !pkg ? (
            <p className="muted" style={{ fontSize: 13 }}>{isParticipant ? 'Elige un paquete para ver sus actividades.' : 'Solo los participantes se inscriben a actividades con paquete.'}</p>
          ) : (
            <>
              <p style={{ fontSize: 13 }} className="muted">En bloques simultáneos elige una opción. Las demás actividades del paquete se asignan solas.</p>
              {blocks.choices.map((b) => {
                const key = b[0].id;
                const end = b.reduce((m, a) => (a.ends_at > m ? a.ends_at : m), b[0].ends_at);
                return (
                  <div key={key} className="stack divider-top" style={{ borderTopColor: 'var(--color-neutral-300)' }}>
                    <div className="row" style={{ padding: '8px 0', fontSize: 12, fontWeight: 700, justifyContent: 'space-between' }}>
                      <span>{dayShort(b[0].day)} · {timeRange(b[0].starts_at, end)}</span>
                      <span className="muted" style={{ fontWeight: 600 }}>{b.length} opciones</span>
                    </div>
                    {b.map((a) => {
                      const c = choices[key];
                      const on = c?.id === a.id;
                      const n = stats.data!.get(a.id)?.enrolled ?? 0;
                      const fullNow = isFull(a);
                      return (
                        <button key={a.id} type="button" className={'block-opt' + (on ? ' on' : '') + (fullNow && !on ? ' full' : '')} onClick={() => pickOption(b, a)}>
                          <span className={'dot' + (on ? ' on' : '')} />
                          <div style={{ minWidth: 0 }}>
                            <div className="t">{a.name}{on && c?.status === 'waitlist' ? ' · lista de espera' : ''}</div>
                            <div className="r">{[a.speaker, a.venue].filter(Boolean).join(' · ')}</div>
                          </div>
                          <span className="c">{a.capacity ? (fullNow ? 'Lleno' : `${n}/${a.capacity}`) : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {blocks.automatic.length > 0 && (
                <div className="stack divider-top" style={{ borderTopColor: 'var(--color-neutral-300)' }}>
                  <div style={{ padding: '8px 0', fontSize: 12, fontWeight: 700 }}>Incluidas en el paquete</div>
                  {blocks.automatic.map((a) => {
                    const e = mine.find((x) => x.activity_id === a.id);
                    return (
                      <div key={a.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '5px 0' }}>
                        <span className="ellipsis">{dayShort(a.day)} · {a.name}</span>
                        <span className="muted" style={{ fontSize: 11, fontWeight: 700, flex: 'none' }}>{e ? (e.status === 'waitlist' ? 'Lista de espera' : 'Inscrito') : 'Al guardar'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {!pkgActs.length && <p className="field-hint">Este paquete aún no tiene actividades. Asígnalas en Programa → «Incluido en paquetes».</p>}
            </>
          )}
        </section>
      </div>

      {full && (
        <FullActivityModal
          full={full.act}
          alternatives={full.block}
          personName={d.full_name}
          onClose={() => setFull(null)}
          onChoose={(id) => {
            if (full.key) setChoices({ ...choices, [full.key]: { id, status: 'enrolled' } });
            setFull(null);
          }}
          onWaitlist={() => {
            if (full.key) setChoices({ ...choices, [full.key]: { id: full.act.id, status: 'waitlist' } });
            setFull(null);
            toast('Quedará en lista de espera al guardar');
          }}
        />
      )}
    </>
  );
}
