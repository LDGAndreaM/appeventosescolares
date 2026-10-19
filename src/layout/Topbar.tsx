import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { AforoLogo } from '../components/ui';

export default function Topbar({ right }: { right?: ReactNode }) {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <Link to="/eventos" className="brand">
        <AforoLogo size={40} radius={10} />
        <span style={{ fontSize: 22 }}>Aforo</span>
      </Link>
      {right ?? (
        <nav className="topbar-nav">
          <NavLink to="/eventos" end className={({ isActive }) => (isActive ? 'active' : '')}>Mis eventos</NavLink>
          <div style={{ position: 'relative' }}>
            <button type="button" className="link" style={{ color: 'var(--color-text)', fontWeight: 400, fontSize: 14 }} onClick={() => setOpen((o) => !o)}>
              {profile?.full_name || profile?.email} ▾
            </button>
            {open && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 30, padding: 8, boxShadow: 'var(--shadow-card)', zIndex: 40, minWidth: 180 }}>
                <div style={{ padding: '6px 10px', fontSize: 12 }} className="muted ellipsis">{profile?.email}</div>
                <button
                  type="button"
                  className="btn btn-sm btn-block"
                  onClick={async () => {
                    await signOut();
                    nav('/entrar');
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
