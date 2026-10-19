import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { dayShort, firstName, timeRange } from '../../lib/format';
import { Field, Loading } from '../../components/ui';
import { PublicHero, PublicMessage, PublicShell } from './PublicShell';

interface CheckinActivity {
  code: string;
  type: string;
  name: string;
  speaker: string;
  venue: string;
  day: string;
  starts_at: string;
  ends_at: string;
  event_name: string;
  acronym: string;
  color_primary: string;
  logo_url: string | null;
}

const EMAIL_KEY = 'aforo-checkin-email';
const readEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 2c · El asistente escanea el QR de la actividad y confirma con su correo. */
export default function CheckIn() {
  const { code = '' } = useParams();
  const q = useQuery({
    queryKey: ['checkin', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_checkin_activity', { p_code: code });
      if (error) throw error;
      return data as CheckinActivity | null;
    },
  });
  const [email, setEmail] = useState(readEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{ name: string; time: string; enrolled: boolean } | null>(null);

  if (q.isLoading) return <PublicShell><Loading /></PublicShell>;
  const a = q.data;
  if (!a) return <PublicMessage title="Código no válido" text="Este QR no corresponde a ninguna actividad. Pide ayuda al staff." />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('checkin', { p_code: code, p_email: email.trim() });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    try {
      localStorage.setItem(EMAIL_KEY, email.trim());
    } catch {
      /* almacenamiento no disponible */
    }
    const r = data as { full_name: string; local_time: string; enrolled: boolean };
    setOk({ name: r.full_name, time: r.local_time, enrolled: r.enrolled });
  };

  return (
    <PublicShell color={a.color_primary}>
      <PublicHero
        label="Asistencia"
        kicker={`${a.type} · ${dayShort(a.day)} · ${timeRange(a.starts_at, a.ends_at)}`}
        title={a.name}
        sub={[a.venue, a.speaker].filter(Boolean).join(' · ') || a.event_name}
      />
      <form className="stack" style={{ padding: '24px 20px', gap: 14, flex: 1 }} onSubmit={submit}>
        <h4>Registra tu asistencia</h4>
        <p style={{ fontSize: 14 }} className="muted">Usa el correo con el que te inscribiste a {a.event_name}.</p>
        <Field label="Correo">
          <input className="input" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ minHeight: 48, borderColor: 'var(--ev)' }} disabled={!!ok} />
        </Field>
        {!ok && <button className="btn btn-primary btn-xl btn-center" disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar asistencia'}</button>}
        {error && <div className="alert">{error}</div>}
        {ok && (
          <div className="card row" style={{ marginTop: 'auto', padding: 18, gap: 14 }}>
            <span style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--af-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>✓</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>¡Listo, {firstName(ok.name)}!</div>
              <div style={{ fontSize: 13 }} className="muted">
                Asistencia registrada a las {ok.time}. {ok.enrolled ? 'Ya cuenta para tu constancia.' : 'No estabas inscrito; quedó como asistencia sin inscripción.'}
              </div>
            </div>
          </div>
        )}
      </form>
    </PublicShell>
  );
}
