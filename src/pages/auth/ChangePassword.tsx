import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { friendlyError } from '../../lib/messages';
import { AforoLogo, Field } from '../../components/ui';

export function PasswordCard(props: {
  title: string;
  text: string;
  busy: boolean;
  disabled?: boolean;
  error: string | null;
  onSubmit: (e: FormEvent, password: string) => void;
}) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [local, setLocal] = useState<string | null>(null);
  return (
    <div className="af-scope" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form
        className="card card-lg stack"
        style={{ padding: 32, gap: 20, width: 440, maxWidth: '100%' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (a.length < 8) return setLocal('Usa al menos 8 caracteres.');
          if (a !== b) return setLocal('Las contraseñas no coinciden.');
          setLocal(null);
          props.onSubmit(e, a);
        }}
      >
        <div className="row" style={{ gap: 10 }}>
          <AforoLogo size={32} radius={8} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Aforo</span>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>{props.title}</h3>
          <p className="muted" style={{ fontSize: 14 }}>{props.text}</p>
        </div>
        <Field label="Nueva contraseña">
          <input className="input" type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" disabled={props.disabled} />
        </Field>
        <Field label="Repítela">
          <input className="input" type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" disabled={props.disabled} />
        </Field>
        {(local || props.error) && <div className="alert">{local || props.error}</div>}
        <button className="btn btn-af btn-lg" disabled={props.busy || props.disabled}>
          {props.busy ? 'Guardando…' : 'Guardar contraseña →'}
        </button>
      </form>
    </div>
  );
}

/** Obligatoria para administradores invitados con contraseña temporal. */
export default function ChangePassword() {
  const { session, refreshProfile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (_: FormEvent, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const { error: e2 } = await supabase.from('profiles').update({ must_change_password: false }).eq('id', session!.user.id);
      if (e2) throw e2;
      await refreshProfile();
      nav((loc.state as { from?: string } | null)?.from ?? '/eventos', { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PasswordCard
      title="Cambia tu contraseña temporal"
      text="Entraste con una contraseña temporal. Elige una nueva para seguir."
      busy={busy}
      error={error}
      onSubmit={submit}
    />
  );
}
