import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useEventCtx } from '../../layout/EventLayout';
import { qk, useEventDays, useInvalidateEvent } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { registerUrl } from '../../lib/qr';
import { evStyle } from '../../lib/theme';
import { Field, Loading, Modal, Segmented, useToast } from '../../components/ui';
import EventForm, { initialFormState, saveEvent, validate, type EventFormState } from '../events/EventForm';
import '../events/events.css';

export default function Settings() {
  const { event, full, isCreator } = useEventCtx();
  const days = useEventDays(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [s, setS] = useState<EventFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (days.data && !s) setS(initialFormState(event, days.data));
  }, [days.data, event, s]);

  if (!s) return <Loading />;
  const set = (p: Partial<EventFormState>) => setS((x) => (x ? { ...x, ...p } : x));

  const save = async () => {
    const v = validate(s);
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    try {
      await saveEvent(s, event);
      await invalidate();
      await qc.invalidateQueries({ queryKey: qk.myEvents });
      toast('Cambios guardados');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) return toast(friendlyError(error), true);
    await qc.invalidateQueries({ queryKey: qk.myEvents });
    nav('/eventos');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{full ? 'Datos, paleta y fechas' : 'Solo lectura · tu permiso es registro y pagos'}</div>
          <h2>Ajustes del evento</h2>
        </div>
        {full && <button className="btn btn-primary" style={{ minWidth: 140 }} disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>}
      </div>
      {error && <div className="alert" style={{ margin: '16px 36px 0' }}>{error}</div>}
      {/* la vista previa toma el color que se está editando */}
      <div className="ev-scope" style={evStyle(s.color)}>
        <EventForm s={s} set={set} disabled={!full} />
      </div>
      <div className="page-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, borderTop: '1px solid var(--color-divider)' }}>
        <div className="card card-pad stack" style={{ gap: 12 }}>
          <h5>Estado del evento</h5>
          <Segmented
            value={s.status}
            options={[{ value: 'draft', label: 'Borrador' }, { value: 'active', label: 'Activo' }, { value: 'finished', label: 'Finalizado' }]}
            onChange={(v) => full && set({ status: v })}
          />
          <span className="field-hint">El formulario público y la asistencia por QR solo funcionan con el evento activo o finalizado.</span>
        </div>
        <div className="card card-pad stack" style={{ gap: 12 }}>
          <h5>Enlaces públicos</h5>
          <Field label="Registro">
            <div className="row">
              <input className="input input-sm" readOnly value={registerUrl(event.slug)} onFocus={(e) => e.target.select()} />
              <button className="btn btn-secondary btn-sm" onClick={() => { void navigator.clipboard.writeText(registerUrl(event.slug)); toast('Enlace copiado'); }}>Copiar</button>
            </div>
          </Field>
          <Field label="Itinerario">
            <a href={`${registerUrl(event.slug)}/itinerario`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{registerUrl(event.slug)}/itinerario</a>
          </Field>
        </div>
        {isCreator && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <h5>Eliminar evento</h5>
            <p className="muted" style={{ fontSize: 13 }}>Borra el programa, participantes, pagos, asistencias y constancias. No se puede deshacer.</p>
            <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmDelete(true)}>Eliminar evento</button>
          </div>
        )}
      </div>
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(false)} label="Eliminar evento">
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <span className="modal-icon">!</span>
            <div className="stack" style={{ gap: 4 }}>
              <h4>¿Eliminar {event.name}?</h4>
              <p className="muted" style={{ fontSize: 14 }}>Escribe el nombre del evento para confirmar.</p>
            </div>
          </div>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={event.name} />
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="btn btn-danger" disabled={typed.trim() !== event.name} onClick={remove}>Eliminar para siempre</button>
          </div>
        </Modal>
      )}
    </>
  );
}
