import { useState, type FormEvent } from 'react';
import { useEventCtx } from '../../layout/EventLayout';
import { callFunction, useAdmins, useInvalidateEvent } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dateTimeShort } from '../../lib/format';
import type { Permission } from '../../lib/types';
import { Field, Loading, Modal, useToast } from '../../components/ui';
import './event.css';

const PERMS: { value: Permission; t: string; d: string }[] = [
  { value: 'full', t: 'Acceso completo', d: 'Programa, personas, paquetes y pagos' },
  { value: 'registration', t: 'Registro y pagos', d: 'No edita el programa ni la paleta' },
];

function tempPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(9));
  const s = Array.from(r, (n) => abc[n % abc.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
}

export default function Admins() {
  const { event, full, isCreator, access } = useEventCtx();
  const admins = useAdmins(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(tempPassword);
  const [perm, setPerm] = useState<Permission>('full');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; password: string; created: boolean; emailed: boolean } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);

  if (!admins.data) return <Loading />;

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await callFunction<{ created: boolean; emailed: boolean; already: boolean }>('invite-admin', {
        event_id: event.id, full_name: name, email, password, permission: perm, notify: false,
      });
      if (r.already) {
        setError('Esa persona ya es administradora de este evento.');
        return;
      }
      await invalidate('admins');
      if (r.emailed) toast('Invitación enviada por correo');
      setResult({ email: email.trim().toLowerCase(), password, created: r.created, emailed: r.emailed });
      setName('');
      setEmail('');
      setPassword(tempPassword());
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { error } = await supabase.from('event_admins').delete().eq('event_id', event.id).eq('user_id', removing.id);
    setRemoving(null);
    if (error) return toast(friendlyError(error), true);
    await invalidate('admins');
    toast('Administrador quitado');
  };

  const changePerm = async (userId: string, permission: Permission) => {
    const { error } = await supabase.from('event_admins').update({ permission }).eq('event_id', event.id).eq('user_id', userId);
    if (error) return toast(friendlyError(error), true);
    await invalidate('admins');
  };

  return (
    <div className="with-aside">
      <div className="stack" style={{ minWidth: 0 }}>
        <div className="page-head">
          <div>
            <div className="kicker">Acceso al panel</div>
            <h2>Administradores</h2>
          </div>
        </div>
        <div className="thead admins-grid"><span>Nombre y correo</span><span>Permiso</span><span>Último acceso</span><span /></div>
        {admins.data.map((a) => {
          const p = PERMS.find((x) => x.value === a.permission)!;
          const editable = isCreator && a.role !== 'creator';
          return (
            <div key={a.user_id} className="trow admins-grid" style={{ paddingTop: 16, paddingBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{a.profile?.full_name || a.profile?.email}{a.user_id === access.user_id && <span className="muted" style={{ fontWeight: 400 }}> · tú</span>}</div>
                <div className="cell-sub ellipsis">{a.profile?.email}</div>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                {editable ? (
                  <select className="input input-xs" value={a.permission} onChange={(e) => changePerm(a.user_id, e.target.value as Permission)} style={{ maxWidth: 190 }}>
                    {PERMS.map((x) => <option key={x.value} value={x.value}>{x.t}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 14 }}>{p.t}</span>
                )}
                <span className="cell-sub">{a.role === 'creator' ? 'Creador/a' : 'Administrador/a'}</span>
              </div>
              <span style={{ fontSize: 14 }}>{a.last_access_at ? dateTimeShort(a.last_access_at) : 'Aún no entra'}</span>
              <span>
                {editable && (
                  <button className="link" style={{ color: 'var(--color-neutral-700)', fontWeight: 400 }} onClick={() => setRemoving({ id: a.user_id, name: a.profile?.full_name || a.profile?.email || '' })}>
                    Quitar
                  </button>
                )}
              </span>
            </div>
          );
        })}
        <p style={{ padding: '20px 36px', fontSize: 13, maxWidth: 620 }} className="muted">
          Cada administrador entra con su propio correo y contraseña. Solo quien creó el evento puede eliminarlo o quitar administradores.
        </p>
      </div>

      <aside className="aside-panel">
        <h4>Invitar administrador</h4>
        {!full ? (
          <p className="muted" style={{ fontSize: 14 }}>Necesitas acceso completo para invitar administradores.</p>
        ) : (
          <form className="stack" style={{ gap: 18 }} onSubmit={invite}>
            <Field label="Nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Mtra. Paula Ibarra" />
            </Field>
            <Field label="Correo">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="paula.ibarra@itson.edu.mx" />
            </Field>
            <Field label="Contraseña temporal" hint="Si ya tiene cuenta en Aforo, conserva su contraseña.">
              <div className="row">
                <input className="input mono" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                <button type="button" className="btn btn-secondary" style={{ padding: '0 12px', alignSelf: 'stretch' }} onClick={() => setPassword(tempPassword())}>Generar</button>
              </div>
            </Field>
            <Field label="Permiso">
              <div className="stack" style={{ border: '1.5px solid var(--color-neutral-300)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                {PERMS.map((p, i) => (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setPerm(p.value)}
                    style={{ padding: 12, display: 'flex', gap: 10, border: 0, borderTop: i ? '1px solid var(--color-divider)' : 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <span className={'dot' + (perm === p.value ? ' on' : '')} style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: perm === p.value ? 700 : 400 }}>{p.t}</div>
                      <div className="cell-sub">{p.d}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Field>
            {error && <div className="alert">{error}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Agregando…' : 'Agregar administrador'}</button>
          </form>
        )}
      </aside>

      {result && (
        <Modal onClose={() => setResult(null)} label="Invitación creada">
          <h4>{result.emailed ? 'Invitación enviada' : 'Administrador agregado'}</h4>
          {result.created ? (
            <>
              <p className="muted" style={{ fontSize: 14 }}>
                Compártele estos datos (por WhatsApp, mensaje o en persona). Entra en {window.location.host}; al hacerlo por primera vez le pediremos cambiar la contraseña.
              </p>
              <div className="card mono" style={{ background: 'var(--color-neutral-100)', padding: '12px 14px', fontSize: 14 }}>
                {result.email}<br />{result.password}
              </div>
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => { void navigator.clipboard.writeText(`Acceso a Aforo · ${event.name}\n${window.location.origin}/entrar\nCorreo: ${result.email}\nContraseña temporal: ${result.password}`); toast('Datos copiados'); }}>
                Copiar datos de acceso
              </button>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 14 }}>Ya tenía cuenta en Aforo: entra con su correo y contraseña de siempre y verá este evento en «Mis eventos».</p>
          )}
          <div className="modal-actions"><button className="btn btn-primary" onClick={() => setResult(null)}>Listo</button></div>
        </Modal>
      )}
      {removing && (
        <Modal onClose={() => setRemoving(null)} label="Quitar administrador">
          <h4>¿Quitar a {removing.name}?</h4>
          <p className="muted" style={{ fontSize: 14 }}>Dejará de ver este evento. Su cuenta de Aforo no se borra.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setRemoving(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={remove}>Quitar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
