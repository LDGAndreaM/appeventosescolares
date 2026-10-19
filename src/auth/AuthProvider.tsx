import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchProfile } from '../lib/api';
import type { Profile } from '../lib/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileFailed, setProfileFailed] = useState(false);

  const loadProfile = async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await fetchProfile(s.user.id));
      setProfileFailed(false);
    } catch {
      setProfile(null);
      setProfileFailed(true);
    }
  };

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // fuera del callback para no bloquear el cliente de auth
      setTimeout(() => loadProfile(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    profile,
    // la sesión existe pero aún no llega su perfil: seguimos cargando
    loading: loading || (!!session && profile?.id !== session.user.id && !profileFailed),
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}
