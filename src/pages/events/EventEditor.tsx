import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '../../lib/api';
import { friendlyError } from '../../lib/messages';
import { evStyle } from '../../lib/theme';
import { useToast } from '../../components/ui';
import Topbar from '../../layout/Topbar';
import EventForm, { initialFormState, saveEvent, validate, type EventFormState } from './EventForm';
import './events.css';

const STEPS = ['Datos', 'Paleta', 'Fechas y horarios', 'Paquetes', 'Administradores'];

/** 1c · Crear evento — datos, logo, paleta, fechas y horarios. */
export default function EventEditor() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [s, setS] = useState<EventFormState>(initialFormState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<EventFormState>) => setS((x) => ({ ...x, ...p }));

  const save = async (status: 'draft' | 'active') => {
    const v = validate(s);
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    try {
      const id = await saveEvent({ ...s, status });
      await qc.invalidateQueries({ queryKey: qk.myEvents });
      toast(status === 'draft' ? 'Borrador guardado' : 'Evento creado');
      nav(status === 'draft' ? '/eventos' : `/evento/${id}/paquetes`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ev-scope" style={{ ...evStyle(s.color), minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Topbar
        right={
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => save('draft')}>Guardar borrador</button>
            <button className="btn btn-primary" style={{ minWidth: 200 }} disabled={busy} onClick={() => save('active')}>
              {busy ? 'Guardando…' : 'Siguiente: paquetes →'}
            </button>
          </div>
        }
      />
      <div className="editor-steps">
        {STEPS.map((label, i) => (
          <div key={label} className={i < 3 ? 'on' : ''}>
            <span className="n">{'0' + (i + 1)}</span>{label}
          </div>
        ))}
      </div>
      {error && <div className="alert" style={{ margin: '16px 36px 0' }}>{error}</div>}
      <EventForm s={s} set={set} />
    </div>
  );
}
