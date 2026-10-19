import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useActivities, useAdmins, useEvent, useMyAccess, usePackages, usePeople } from '../lib/api';
import { supabase } from '../lib/supabase';
import { evStyle } from '../lib/theme';
import { rangeShort } from '../lib/format';
import type { EventAdmin, EventRow } from '../lib/types';
import { ErrorState, Loading, MonoBox } from '../components/ui';

export interface EventCtx {
  event: EventRow;
  access: EventAdmin;
  /** Acceso completo: puede editar programa, paquetes y paleta. */
  full: boolean;
  isCreator: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useEventCtx = () => useOutletContext<EventCtx>();

export default function EventLayout() {
  const { eventId = '' } = useParams();
  const { session, profile } = useAuth();
  const loc = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const event = useEvent(eventId);
  const access = useMyAccess(eventId, session?.user.id);
  const activities = useActivities(eventId);
  const people = usePeople(eventId);
  const packages = usePackages(eventId);
  const admins = useAdmins(eventId);

  useEffect(() => {
    if (eventId) void supabase.rpc('touch_event_access', { eid: eventId });
  }, [eventId]);
  useEffect(() => setNavOpen(false), [loc.pathname]);

  if (event.isLoading || access.isLoading) return <Loading />;
  if (event.error) return <ErrorState error={event.error} />;
  if (!event.data || !access.data) return <ErrorState error={new Error('No tienes acceso a este evento.')} />;

  const ev = event.data;
  const me = access.data;
  const ctx: EventCtx = { event: ev, access: me, full: me.permission === 'full', isCreator: me.role === 'creator' };
  const count = (n?: number) => (n == null ? '' : n.toLocaleString('es-MX'));
  const items: [string, string, string][] = [
    ['Resumen', 'resumen', ''],
    ['Programa', 'programa', count(activities.data?.length)],
    ['Calendario', 'calendario', ''],
    ['Participantes', 'participantes', count(people.data?.length)],
    ['Pagos', 'pagos', ''],
    ['Paquetes', 'paquetes', count(packages.data?.length)],
    ['Constancias', 'constancias', ''],
    ['Exportar', 'exportar', ''],
    ['Administradores', 'administradores', count(admins.data?.length)],
    ['Ajustes del evento', 'ajustes', ''],
  ];
  const isActive = (path: string) =>
    loc.pathname.includes(`/${path}`) || (path === 'programa' && loc.pathname.includes('/asistencia'));

  return (
    <div className={'event-shell ev-scope' + (navOpen ? ' nav-open' : '')} style={evStyle(ev.color_primary, ev.color_secondary)}>
      <aside className="sidebar" aria-label="Menú del evento">
        <div className="sidebar-brand">
          <MonoBox logo={ev.logo_url} text={ev.acronym} size={44} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{ev.name}</div>
            <div style={{ fontSize: 12 }} className="muted">{rangeShort(ev.start_date, ev.end_date)}</div>
          </div>
        </div>
        <nav>
          {items.map(([label, path, n]) => (
            <NavLink key={path} to={path} className={'nav-item' + (isActive(path) ? ' active' : '')}>
              <span>{label}</span>
              <span className="n">{n}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link to="/eventos">← Mis eventos</Link>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{profile?.full_name || profile?.email}</div>
          <div style={{ fontSize: 12 }} className="muted">
            {me.role === 'creator' ? 'Creador/a del evento' : me.permission === 'full' ? 'Administrador/a · acceso completo' : 'Administrador/a · registro y pagos'}
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <div className="mobile-bar">
        <button type="button" aria-label="Abrir menú" onClick={() => setNavOpen(true)}>☰</button>
        <MonoBox logo={ev.logo_url} text={ev.acronym} size={32} fontSize={11} radius={10} />
        <span className="ellipsis" style={{ fontWeight: 700, fontSize: 14 }}>{ev.name}</span>
      </div>
      <main className="page" style={{ minHeight: '100vh' }}>
        <Outlet context={ctx} />
      </main>
    </div>
  );
}
