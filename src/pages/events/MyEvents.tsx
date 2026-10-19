import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { useMyEvents } from '../../lib/api';
import { plural, rangeShort } from '../../lib/format';
import { ErrorState, Loading, MonoBox } from '../../components/ui';
import Topbar from '../../layout/Topbar';
import './events.css';

const STATUS = { draft: 'Borrador', active: 'Activo', finished: 'Finalizado' } as const;

export default function MyEvents() {
  const { session } = useAuth();
  const q = useMyEvents(session?.user.id);
  const events = q.data ?? [];

  return (
    <div className="af-scope" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar />
      <div className="page-head" style={{ padding: 36 }}>
        <div>
          <div className="kicker">{plural(events.length, 'evento', 'eventos')}</div>
          <h1 style={{ marginTop: 4 }}>Mis eventos</h1>
        </div>
        <Link to="/eventos/nuevo" className="btn btn-af" style={{ padding: '12px 16px', minWidth: 180 }}>+ Nuevo evento</Link>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="events-grid">
          {events.map((e) => (
            <Link key={e.id} to={`/evento/${e.id}/resumen`} className="event-card">
              <div className="event-card-cover" style={{ background: e.color_primary }}>
                <MonoBox logo={e.logo_url} text={e.acronym} size={52} outline={!e.logo_url} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>{rangeShort(e.start_date, e.end_date)}</div>
              </div>
              <div className="event-card-body">
                <div className="row">
                  <span className="tag tag-upper tag-outline">{STATUS[e.status]}</span>
                  <span className="tag tag-upper" style={{ background: 'var(--color-neutral-200)', borderRadius: 6 }}>
                    {e.my_role === 'creator' ? 'Creador/a' : 'Administrador/a'}
                  </span>
                </div>
                <h3>{e.name}</h3>
                <p style={{ fontSize: 14 }} className="muted">{e.description}</p>
                <div className="event-card-foot">
                  <span>{plural(e.people_count, 'persona', 'personas')} · {plural(e.activities_count, 'actividad', 'actividades')}</span>
                  <span style={{ fontWeight: 700 }}>Abrir →</span>
                </div>
              </div>
            </Link>
          ))}
          {!events.length && (
            <div className="card card-lg empty" style={{ gridColumn: '1 / -1', padding: 48 }}>
              <h4 style={{ marginBottom: 8, color: 'var(--color-text)' }}>Aún no tienes eventos</h4>
              <p style={{ marginBottom: 16 }}>Crea tu primer evento para dar de alta el programa, los paquetes y a los participantes.</p>
              <Link to="/eventos/nuevo" className="btn btn-af">+ Nuevo evento</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
