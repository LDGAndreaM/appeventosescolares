import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { friendlyError } from '../../lib/messages';
import { AforoLogo, Field } from '../../components/ui';
import './auth.css';

export default function Login() {
  const { session } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/eventos';
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (session) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        nav(from, { replace: true });
      } else {
        if (!name.trim()) throw new Error('Escribe tu nombre.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/eventos` },
        });
        if (error) throw error;
        if (!data.session) setNotice('Te enviamos un correo para confirmar tu cuenta. Después podrás entrar.');
        else nav('/eventos', { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Escribe tu correo y vuelve a tocar «¿La olvidaste?».');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/restablecer`,
    });
    if (error) setError(friendlyError(error));
    else setNotice('Te enviamos un enlace para crear una nueva contraseña.');
  };

  return (
    <div className="auth-shell af-scope">
      <section className="auth-hero">
        <div className="row" style={{ gap: 12 }}>
          <div style={{ boxShadow: '0 0 0 2px #fff', borderRadius: 12 }}>
            <AforoLogo size={52} radius={11} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 22 }}>Aforo</span>
        </div>
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 28 }}>
            <span className="bar" style={{ background: 'var(--af-purple)' }} />
            <span className="bar" style={{ background: 'var(--af-green)' }} />
            <span className="bar" style={{ background: '#fff' }} />
          </div>
          <div className="auth-claim">
            Registra.<br />Organiza.<br />
            <span style={{ color: 'var(--af-green-200)' }}>Cobra.</span><br />
            <span style={{ color: 'var(--af-purple-200)' }}>Recibe.</span>
          </div>
          <p className="auth-lead">Eventos escolares con programa, participantes, paquetes y pagos en un solo lugar.</p>
        </div>
        <div className="row" style={{ fontSize: 13, gap: 24 }}>
          <span>ITSON · {new Date().getFullYear()}</span>
          <a href="mailto:soporte@aforo.app" style={{ color: '#fff', textDecoration: 'none' }}>Ayuda</a>
        </div>
      </section>

      <section className="auth-form">
        <form onSubmit={submit} className="stack" style={{ gap: 28, width: '100%', maxWidth: 480 }}>
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'login'} onClick={() => setTab('login')}>Iniciar sesión</button>
            <button type="button" role="tab" aria-selected={tab === 'signup'} onClick={() => setTab('signup')}>Crear cuenta</button>
          </div>
          <h2>{tab === 'login' ? 'Te damos la bienvenida' : 'Crea tu cuenta'}</h2>
          {tab === 'signup' && (
            <Field label="Nombre completo">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
          )}
          <Field label="Correo electrónico">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field
            label="Contraseña"
            aside={tab === 'login' ? <button type="button" className="link" style={{ fontSize: 12, color: 'var(--af-700)', fontWeight: 400 }} onClick={forgot}>¿La olvidaste?</button> : undefined}
          >
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </Field>
          {error && <div className="alert">{error}</div>}
          {notice && <div className="alert ok">{notice}</div>}
          <button className="btn btn-af btn-lg" disabled={busy}>
            {busy ? 'Un momento…' : tab === 'login' ? 'Entrar →' : 'Crear cuenta →'}
          </button>
          <p style={{ fontSize: 13 }} className="muted">
            ¿Te invitaron como administrador? Entra con el correo y la contraseña temporal que recibiste; te pediremos cambiarla.
          </p>
        </form>
      </section>
    </div>
  );
}
