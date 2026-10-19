import { useState } from 'react';
import { dayShort, firstName, timeRange } from '../lib/format';
import { Modal } from './ui';

export interface SlotOption {
  id: string;
  type: string;
  name: string;
  speaker: string;
  venue: string;
  day: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  enrolled: number;
}

const FEM = new Set(['Conferencia', 'Ceremonia', 'Exposición', 'Comida']);

/** 2b · Aviso: la actividad ya alcanzó su cupo; ofrece otras del mismo horario o lista de espera. */
export default function FullActivityModal(props: {
  full: SlotOption;
  alternatives: SlotOption[];
  personName: string;
  onChoose: (id: string) => void;
  onWaitlist?: () => void;
  onClose: () => void;
}) {
  const free = props.alternatives.filter((a) => a.id !== props.full.id && (a.capacity == null || a.enrolled < a.capacity));
  const [pick, setPick] = useState<string | null>(free[0]?.id ?? null);
  const f = props.full;
  const kind = f.type.toLowerCase();
  const chosen = free.find((a) => a.id === pick);
  const who = props.personName ? firstName(props.personName) : 'esta persona';

  return (
    <Modal onClose={props.onClose} label="Actividad llena">
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <span className="modal-icon">!</span>
        <div className="stack" style={{ gap: 4 }}>
          <h4>{FEM.has(f.type) ? `Esta ${kind} ya está llena` : `Este ${kind} ya está lleno`}</h4>
          <p style={{ fontSize: 14 }} className="muted">
            <b style={{ color: 'var(--color-text)' }}>{f.name}</b> alcanzó su cupo de {f.capacity} {f.capacity === 1 ? 'persona' : 'personas'}.{' '}
            {free.length ? `Elige otra actividad del mismo horario para ${who}.` : 'No hay otras opciones con lugar en este horario.'}
          </p>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }} className="muted">Disponibles · {dayShort(f.day)} · {timeRange(f.starts_at, f.ends_at)}</span>
        {free.map((a) => (
          <button key={a.id} type="button" className={'option' + (pick === a.id ? ' on' : '')} onClick={() => setPick(a.id)}>
            <span className={'dot' + (pick === a.id ? ' on' : '')} />
            <div>
              <div className="t">{a.name}</div>
              <div className="d">{[a.speaker, a.venue].filter(Boolean).join(' · ')}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--af-green)' }}>
              {a.capacity == null ? 'Sin límite' : `${a.capacity - a.enrolled} ${a.capacity - a.enrolled === 1 ? 'lugar' : 'lugares'}`}
            </span>
          </button>
        ))}
        <div className="option off" aria-disabled="true">
          <span className="dot" />
          <div>
            <div className="t">{f.name}</div>
            <div className="d">{[f.speaker, f.venue].filter(Boolean).join(' · ')}</div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Lleno {f.enrolled}/{f.capacity}</span>
        </div>
      </div>
      <div className="modal-actions" style={{ justifyContent: 'space-between', paddingTop: 4 }}>
        {props.onWaitlist ? <button type="button" className="link" style={{ fontSize: 13 }} onClick={props.onWaitlist}>Agregar a lista de espera</button> : <span />}
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>Cancelar</button>
          {chosen && <button type="button" className="btn btn-primary" onClick={() => props.onChoose(chosen.id)}>Elegir {chosen.name}</button>}
        </div>
      </div>
    </Modal>
  );
}
