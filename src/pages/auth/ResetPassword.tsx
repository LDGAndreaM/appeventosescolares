import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';
import { friendlyError } from '../../lib/messages';
import { PasswordCard } from './ChangePassword';

/** Destino del enlace de "¿La olvidaste?": Supabase abre una sesión de recuperación. */
export default function ResetPassword() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent, password: string) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else nav('/eventos', { replace: true });
  };

  return (
    <PasswordCard
      title="Crea una nueva contraseña"
      text={!loading && !session ? 'El enlace expiró o ya se usó. Pide uno nuevo desde «¿La olvidaste?».' : 'Escribe tu nueva contraseña dos veces.'}
      disabled={!session}
      busy={busy}
      error={error}
      onSubmit={submit}
    />
  );
}
