import { Link, useParams } from 'react-router-dom';
import { useActivities, useActivityStats, useEvent } from '../../lib/api';
import { dayShort, timeRange } from '../../lib/format';
import { checkinUrl, qrCanvasRef } from '../../lib/qr';
import { evStyle } from '../../lib/theme';
import { Loading } from '../../components/ui';

/** QR de asistencia a pantalla completa para proyectar en el salón. */
export default function Projector() {
  const { eventId = '', activityId } = useParams();
  const event = useEvent(eventId);
  const activities = useActivities(eventId);
  const stats = useActivityStats(eventId, 5_000);
  const act = activities.data?.find((a) => a.id === activityId);

  if (!event.data || !activities.data) return <Loading />;
  if (!act) return <Loading label="Actividad no encontrada" />;
  const st = stats.data?.get(act.id);

  return (
    <div className="ev-scope" style={{ ...evStyle(event.data.color_primary), minHeight: '100vh', background: 'var(--ev)', color: '#fff', display: 'flex', flexDirection: 'column', padding: '3vh 4vw', gap: '3vh' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'clamp(14px, 1.6vw, 22px)', fontWeight: 600, opacity: 0.9 }}>{event.data.name} · {act.type}</span>
        <div className="row" style={{ gap: 16 }}>
          <button className="btn" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }} onClick={() => document.documentElement.requestFullscreen?.()}>Pantalla completa</button>
          <Link to={`/evento/${eventId}/asistencia/${act.id}`} className="btn" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}>Cerrar</Link>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4vw', alignItems: 'center' }}>
        <div className="stack" style={{ gap: '2vh' }}>
          <div style={{ fontSize: 'clamp(36px, 6vw, 96px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em' }}>{act.name}</div>
          <div style={{ fontSize: 'clamp(16px, 2vw, 30px)' }}>{dayShort(act.day)} · {timeRange(act.starts_at, act.ends_at)}{act.venue ? ` · ${act.venue}` : ''}</div>
          <div style={{ fontSize: 'clamp(16px, 2vw, 30px)', marginTop: '3vh' }}>Escanea para registrar tu asistencia</div>
          <div className="mono" style={{ fontSize: 'clamp(18px, 2.4vw, 36px)', fontWeight: 600, letterSpacing: '0.12em' }}>{act.code}</div>
          <div style={{ fontSize: 'clamp(14px, 1.6vw, 24px)', opacity: 0.85 }}>{st?.attended ?? 0} asistencias registradas</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 32, padding: '2.5vh' }}>
          <canvas ref={qrCanvasRef(checkinUrl(act.code))} width={600} height={600} style={{ width: 'min(70vh, 42vw)', height: 'min(70vh, 42vw)', imageRendering: 'pixelated', display: 'block' }} />
        </div>
      </div>
    </div>
  );
}
