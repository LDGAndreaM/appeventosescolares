import { useEffect, useMemo, useRef, useState } from 'react';
import { useEventCtx } from '../../layout/EventLayout';
import {
  callFunction, uploadEventAsset, useActivities, useAttendance, useCertSettings, useCertificates, useEnrollments, useInvalidateEvent,
  usePeople,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, durationLabel, longDate, shortDate, todayISO } from '../../lib/format';
import { activitiesGivenBy, activityLine, certificatesPdf, downloadBlob, drawCertificate, renderTemplate, type CertificateData } from '../../lib/certificate';
import { certificateUrl } from '../../lib/qr';
import { attendanceRows } from '../../lib/datasets';
import { ROLES, type Activity, type Certificate, type CertificateSettings, type Person, type Signer } from '../../lib/types';
import { Field, Loading, SettingRow, Toggle, useToast } from '../../components/ui';
import './event.css';

const FIELDS = ['{nombre}', '{actividad}', '{tipo}', '{fecha}', '{duración}', '{evento}', '{ponente}', '{fechas}'];
const ROLE_FIELDS = ['{nombre}', '{rol}', '{evento}', '{fechas}'];
const DEFAULT_ROLE_BODY = 'Por su valiosa participación como {rol} en {evento}, celebrado del {fechas}.';
/** Filtro de la constancia por rol: todo el equipo (sin participantes) o un rol específico. */
const TEAM = 'equipo';
type Kind = 'activity' | 'general' | 'role';

interface Recipient {
  person: Person;
  attended: boolean;
  cert?: Certificate;
}

export default function Certificates() {
  const { event, full } = useEventCtx();
  const toast = useToast();
  const invalidate = useInvalidateEvent(event.id);
  const activities = useActivities(event.id);
  const people = usePeople(event.id);
  const enrollments = useEnrollments(event.id);
  const attendance = useAttendance(event.id);
  const certs = useCertificates(event.id);
  const settingsQ = useCertSettings(event.id);

  const [kind, setKind] = useState<Kind>('activity');
  const [roleFilter, setRoleFilter] = useState<string>(TEAM);
  const [activityId, setActivityId] = useState<string>('');
  const [settings, setSettings] = useState<CertificateSettings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (settingsQ.data && !settings) setSettings({ ...settingsQ.data, body_role: settingsQ.data.body_role ?? DEFAULT_ROLE_BODY });
    if (settingsQ.isSuccess && !settingsQ.data && !settings)
      setSettings({ event_id: event.id, body_activity: '', body_general: '', body_role: DEFAULT_ROLE_BODY, signers: [], show_verification: true });
  }, [settingsQ.data, settingsQ.isSuccess, settings, event.id]);

  const acts = useMemo(() => activities.data ?? [], [activities.data]);
  const attendedIds = useMemo(() => new Set((attendance.data ?? []).map((a) => a.activity_id)), [attendance.data]);
  const act: Activity | undefined = acts.find((a) => a.id === activityId) ?? acts.find((a) => attendedIds.has(a.id)) ?? acts[0];
  const peopleMap = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);

  const recipients: Recipient[] = useMemo(() => {
    if (!people.data || !enrollments.data || !attendance.data || !certs.data) return [];
    if (kind === 'role') {
      // por su rol: no requiere asistencia registrada
      return people.data
        .filter((p) => (roleFilter === TEAM ? p.role !== 'Participante' : p.role === roleFilter))
        .sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name))
        .map((p) => ({ person: p, attended: true, cert: certs.data!.find((c) => c.person_id === p.id && c.kind === 'role') }));
    }
    if (kind === 'general') {
      const ids = new Set(attendance.data.map((a) => a.person_id));
      return people.data
        .filter((p) => ids.has(p.id))
        .map((p) => ({ person: p, attended: true, cert: certs.data!.find((c) => c.person_id === p.id && !c.activity_id && c.kind !== 'role') }));
    }
    if (!act) return [];
    return attendanceRows(act, peopleMap, enrollments.data, attendance.data).map((r) => ({
      person: r.person,
      attended: !!r.attendance,
      cert: certs.data!.find((c) => c.person_id === r.person.id && c.activity_id === act.id),
    }));
  }, [kind, roleFilter, act, people.data, enrollments.data, attendance.data, certs.data, peopleMap]);

  const selected = recipients.filter((r) => r.attended && !excluded.has(r.person.id));
  const current = selected[Math.min(idx, Math.max(selected.length - 1, 0))];

  const dataFor = useMemo(
    () => (person: Person, folio: string | null): CertificateData | null => {
      if (!settings) return null;
      const base = {
        color: event.color_primary, eventName: event.name, organizer: event.organizer, acronym: event.acronym, logoUrl: event.logo_url,
        folio, personName: person.full_name, signers: settings.signers, showVerification: settings.show_verification,
      };
      const vars = { person: person.full_name, eventName: event.name, start: event.start_date, end: event.end_date, role: person.role };
      if (kind === 'role') {
        const given = activitiesGivenBy(person.full_name, acts);
        return { ...base, title: 'Constancia de participación', body: renderTemplate(settings.body_role, vars), list: given.length ? given.map(activityLine) : undefined };
      }
      const attendedActs = acts.filter((a) => (attendance.data ?? []).some((x) => x.person_id === person.id && x.activity_id === a.id));
      return {
        ...base,
        body: renderTemplate(kind === 'general' ? settings.body_general : settings.body_activity, { ...vars, activity: kind === 'general' ? null : act }),
        list: kind === 'general' ? attendedActs.map(activityLine) : undefined,
      };
    },
    [settings, acts, attendance.data, event, kind, act],
  );

  useEffect(() => {
    if (!canvasRef.current || !current) return;
    const d = dataFor(current.person, current.cert?.folio ?? null);
    if (d) void drawCertificate(canvasRef.current, d, 2);
  }, [current, dataFor]);

  if (!activities.data || !people.data || !enrollments.data || !attendance.data || !certs.data || !settings) return <Loading />;

  const setS = (p: Partial<CertificateSettings>) => { setSettings({ ...settings, ...p }); setDirty(true); };
  const bodyKey = kind === 'role' ? 'body_role' : kind === 'general' ? 'body_general' : 'body_activity';
  const insertField = (f: string) => {
    const el = bodyRef.current;
    const text = settings[bodyKey];
    const at = el ? el.selectionStart : text.length;
    setS({ [bodyKey]: text.slice(0, at) + f + text.slice(at) } as Partial<CertificateSettings>);
  };
  const setSigner = (i: number, p: Partial<Signer>) => setS({ signers: settings.signers.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  const saveSettings = async () => {
    const { error } = await supabase.from('certificate_settings').upsert(settings);
    if (error) return toast(friendlyError(error), true);
    setDirty(false);
    await invalidate('cert-settings');
    toast('Plantilla guardada');
  };

  const issue = async () => {
    if (dirty && full) await saveSettings();
    const ids = selected.map((r) => r.person.id);
    const { data, error } = await supabase.rpc('issue_certificates', {
      p_event: event.id, p_activity: kind === 'activity' ? act!.id : null, p_people: ids, p_kind: kind === 'role' ? 'role' : 'attendance',
    });
    if (error) throw error;
    await invalidate('certificates');
    return data as Certificate[];
  };

  const downloadAll = async () => {
    if (!selected.length) return;
    setBusy('Generando PDF…');
    try {
      const issued = await issue();
      const list = selected
        .map((r) => dataFor(r.person, issued.find((c) => c.person_id === r.person.id)?.folio ?? null))
        .filter((x): x is CertificateData => !!x);
      const pdf = await certificatesPdf(list);
      const name = kind === 'activity' ? act!.code : kind === 'general' ? `${event.code_prefix}-general` : `${event.code_prefix}-${roleFilter === TEAM ? 'equipo' : roleFilter.toLowerCase()}`;
      downloadBlob(pdf.output('blob'), `Constancias-${name}.pdf`);
    } catch (e) {
      toast(friendlyError(e), true);
    } finally {
      setBusy(null);
    }
  };

  const sendAll = async () => {
    if (!selected.length) return;
    setBusy('Preparando…');
    let sent = 0;
    try {
      const issued = await issue();
      for (const r of selected) {
        const cert = issued.find((c) => c.person_id === r.person.id);
        const d = cert && dataFor(r.person, cert.folio);
        if (!cert || !d) continue;
        setBusy(`Enviando ${sent + 1} de ${selected.length}…`);
        const pdf = await certificatesPdf([d]);
        const others = certs.data!
          .filter((c) => c.person_id === r.person.id && c.id !== cert.id && c.activity_id && c.kind === 'attendance')
          .map((c) => ({ name: acts.find((a) => a.id === c.activity_id)?.name ?? '', url: certificateUrl(c.folio) }));
        await callFunction('send-mail', {
          kind: 'certificate', certificate_id: cert.id, pdf_base64: pdf.output('datauristring').split(',')[1],
          duration: act && kind === 'activity' ? durationLabel(act.starts_at, act.ends_at) : '', verify_url: certificateUrl(cert.folio), others,
          detail: kind === 'role' ? `Constancia de participación como ${r.person.role.toLowerCase()}` : undefined,
        });
        sent++;
      }
      toast(`${sent} constancias enviadas`);
    } catch (e) {
      toast(`${sent ? `Se enviaron ${sent}. ` : ''}${friendlyError(e)}`, true);
    } finally {
      setBusy(null);
      await invalidate('certificates');
    }
  };

  const uploadSignature = async (i: number, file: File | undefined) => {
    if (!file) return;
    try {
      const url = await uploadEventAsset(event.id, `firmas/${crypto.randomUUID()}.${file.name.split('.').pop() || 'png'}`, file);
      setSigner(i, { signature_url: url });
    } catch (e) {
      toast(friendlyError(e), true);
    }
  };

  const finished = event.status === 'finished' || todayISO() > event.end_date;
  const notAttended = recipients.filter((r) => !r.attended).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{finished ? `Evento finalizado · ${shortDate(event.end_date)}` : `Se entregan al terminar · ${shortDate(event.end_date)}`}</div>
          <h2>Constancias</h2>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" disabled={!!busy || !selected.length} onClick={downloadAll}>Descargar todas (PDF)</button>
          <button className="btn btn-primary" disabled={!!busy || !selected.length} onClick={sendAll}>
            {busy ?? `Enviar ${selected.length} ${selected.length === 1 ? 'constancia' : 'constancias'} por correo`}
          </button>
        </div>
      </div>
      <div className="cert-cols">
        <div className="card card-pad stack" style={{ gap: 16 }}>
          <Field label="Tipo de constancia">
            <div className="stack" style={{ gap: 6 }}>
              {([['activity', 'Por actividad', 'una por taller o conferencia'], ['general', 'General', 'lista todas sus actividades'], ['role', 'Por rol', 'organizadores, staff, talleristas, ponentes…']] as const).map(([k, t, d]) => (
                <button key={k} type="button" className={'option' + (kind === k ? ' on' : '')} style={{ gridTemplateColumns: '16px 1fr', padding: '10px 12px', borderRadius: 12, fontSize: 13 }} onClick={() => { setKind(k); setIdx(0); setExcluded(new Set()); }}>
                  <span className={'dot' + (kind === k ? ' on' : '')} />
                  <span><b>{t}</b> — {d}</span>
                </button>
              ))}
            </div>
          </Field>
          {kind === 'role' && (
            <Field label="Rol" hint="Para talleristas, conferencistas y ponentes se listan las actividades que impartieron (según el nombre capturado en Programa).">
              <select className="input input-sm" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setIdx(0); setExcluded(new Set()); }}>
                <option value={TEAM}>Todo el equipo (todos menos participantes)</option>
                {ROLES.map((r) => <option key={r} value={r}>{r} ({(people.data ?? []).filter((p) => p.role === r).length})</option>)}
              </select>
            </Field>
          )}
          {kind === 'activity' && (
            <Field label="Actividad">
              <select className="input input-sm" value={act?.id ?? ''} onChange={(e) => { setActivityId(e.target.value); setIdx(0); setExcluded(new Set()); }}>
                {acts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.type} · {dayShort(a.day)}</option>)}
              </select>
            </Field>
          )}
          <Field label="Texto">
            <textarea ref={bodyRef} className="input" style={{ fontSize: 13, minHeight: 130 }} disabled={!full} value={settings[bodyKey]} onChange={(e) => setS({ [bodyKey]: e.target.value } as Partial<CertificateSettings>)} />
            <div className="chips">
              {(kind === 'role' ? ROLE_FIELDS : FIELDS).map((f) => (
                <button key={f} type="button" className="pill" disabled={!full} style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px' }} onClick={() => insertField(f)}>{f}</button>
              ))}
            </div>
          </Field>
          <Field label="Firmas">
            {settings.signers.map((s, i) => (
              <div key={i} className="stack" style={{ gap: 6, border: '1.5px solid var(--color-neutral-300)', borderRadius: 12, padding: '10px 12px' }}>
                <input className="input input-xs" placeholder="Nombre" value={s.name} disabled={!full} onChange={(e) => setSigner(i, { name: e.target.value })} />
                <input className="input input-xs" placeholder="Cargo (Coordinador, Tallerista…)" value={s.title} disabled={!full} onChange={(e) => setSigner(i, { title: e.target.value })} />
                {full && (
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                    <label className="link" style={{ fontSize: 12 }}>
                      {s.signature_url ? 'Cambiar firma.png' : 'Subir firma (PNG)'}
                      <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => uploadSignature(i, e.target.files?.[0])} />
                    </label>
                    <button type="button" className="link danger" style={{ fontSize: 12 }} onClick={() => setS({ signers: settings.signers.filter((_, j) => j !== i) })}>Quitar</button>
                  </div>
                )}
              </div>
            ))}
            {full && settings.signers.length < 3 && (
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setS({ signers: [...settings.signers, { name: '', title: '' }] })}>+ Agregar firma</button>
            )}
          </Field>
          <div className="divider-top" style={{ paddingTop: 12 }}>
            <SettingRow title="Folio y QR de verificación" desc="Para validar que es auténtica">
              <Toggle label="Folio y QR de verificación" checked={settings.show_verification} disabled={!full} onChange={(v) => setS({ show_verification: v })} />
            </SettingRow>
          </div>
          {full && dirty && <button className="btn btn-primary btn-sm" onClick={saveSettings}>Guardar plantilla</button>}
        </div>

        <div className="stack" style={{ gap: 12, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 700 }}>Vista previa{current ? ` · ${current.person.full_name}` : ''}</span>
            {selected.length > 0 && (
              <span className="row muted" style={{ gap: 6 }}>
                <button className="link" style={{ color: 'inherit' }} aria-label="Anterior" disabled={idx <= 0} onClick={() => setIdx(idx - 1)}>‹</button>
                {Math.min(idx, selected.length - 1) + 1} de {selected.length}
                <button className="link" style={{ color: 'inherit' }} aria-label="Siguiente" disabled={idx >= selected.length - 1} onClick={() => setIdx(idx + 1)}>›</button>
              </span>
            )}
          </div>
          <div className="cert-preview">
            {current ? <canvas ref={canvasRef} /> : <div className="empty" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kind === 'role' ? 'No hay personas con este rol.' : `Nadie tiene asistencia registrada ${kind === 'activity' ? 'en esta actividad' : 'todavía'}.`}</div>}
          </div>
          {current && !current.cert && <span className="field-hint">El folio se asigna al descargar o enviar.</span>}
          {kind === 'activity' && act && <span className="field-hint">{act.type} · {longDate(act.day)} · {durationLabel(act.starts_at, act.ends_at)}</span>}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="stack" style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-divider)', gap: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Destinatarios</span>
              <span style={{ fontSize: 12 }} className="muted">{kind === 'activity' ? `${recipients.length} en la lista` : kind === 'role' ? `${recipients.length} ${recipients.length === 1 ? 'persona' : 'personas'}` : `${recipients.length} con asistencia`}</span>
            </div>
            <div className="chips">
              {kind === 'role'
                ? <span className="tag tag-ev" style={{ padding: '4px 9px' }}>{roleFilter === TEAM ? 'Equipo' : roleFilter} {recipients.length}</span>
                : <span className="tag tag-ok" style={{ padding: '4px 9px' }}>Asistieron {recipients.filter((r) => r.attended).length}</span>}
              {kind === 'activity' && <span className="tag tag-muted" style={{ padding: '4px 9px' }}>Sin asistencia {notAttended}</span>}
            </div>
          </div>
          {!recipients.length && <div className="empty">Sin destinatarios.</div>}
          {recipients.map((r) => {
            const on = r.attended && !excluded.has(r.person.id);
            const st = !r.attended ? 'Sin asistencia' : r.cert?.status === 'sent' ? 'Enviada' : 'Lista';
            return (
              <button
                key={r.person.id}
                type="button"
                className="recipient"
                disabled={!r.attended}
                onClick={() => {
                  const next = new Set(excluded);
                  if (next.has(r.person.id)) next.delete(r.person.id); else next.add(r.person.id);
                  setExcluded(next);
                }}
              >
                <span className={'check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.person.full_name}</div>
                  <div className="ellipsis" style={{ fontSize: 11 }}><span className="muted">{kind === 'role' ? `${r.person.role} · ` : ''}{r.person.email}</span></div>
                </div>
                <span className={'tag ' + (st === 'Enviada' ? 'tag-ok' : st === 'Lista' ? 'tag-ev' : 'tag-muted')}>{st}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
