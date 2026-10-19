import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/messages';
import { dmy, money, profileLabel, todayISO } from '../lib/format';
import { METHODS, type Method, type Package, type Payment, type Person, type PersonBalance } from '../lib/types';
import { Field, Modal, Segmented } from './ui';

/** 1p · Registrar abono (pensado también para la mesa de registro en celular). */
export default function PaymentDialog(props: {
  eventId: string;
  people: Person[];
  packages: Package[];
  balances: Map<string, PersonBalance>;
  payments: Payment[];
  initialPersonId?: string;
  onClose: () => void;
  onSaved: (settled: boolean) => void;
}) {
  const [personId, setPersonId] = useState(props.initialPersonId ?? '');
  const [q, setQ] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<Method>('Efectivo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const t = q.trim().toLowerCase();
    return props.people
      .filter((p) => p.package_id)
      .filter((p) => !t || p.full_name.toLowerCase().includes(t) || p.email.includes(t))
      .slice(0, 8);
  }, [q, props.people]);

  const person = props.people.find((p) => p.id === personId);
  const pkg = props.packages.find((p) => p.id === person?.package_id);
  const paid = person ? props.balances.get(person.id)?.paid ?? 0 : 0;
  const saldo = person ? Math.max(person.amount_due - paid, 0) : 0;
  const value = Number(amount || 0);
  const settles = !!person && saldo > 0 && value >= saldo;
  const history = props.payments.filter((p) => p.person_id === personId);

  const submit = async () => {
    if (!person || value <= 0) return setError('Elige a la persona y escribe el monto.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('payments').insert({ event_id: props.eventId, person_id: person.id, amount: value, paid_on: date, method });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    props.onSaved(settles);
  };

  return (
    <Modal onClose={props.onClose} label="Registrar abono" sheetOnMobile width={460}>
      {!person ? (
        <>
          <h4>Registrar abono</h4>
          <Field label="Participante">
            <input className="input" autoFocus placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <div className="stack" style={{ gap: 6 }}>
            {candidates.map((p) => (
              <button key={p.id} type="button" className="option" style={{ gridTemplateColumns: '1fr auto' }} onClick={() => setPersonId(p.id)}>
                <div>
                  <div className="t">{p.full_name}</div>
                  <div className="d">{profileLabel(p)}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Saldo {money(Math.max(p.amount_due - (props.balances.get(p.id)?.paid ?? 0), 0))}</span>
              </button>
            ))}
            {!candidates.length && <div className="empty">No hay participantes con paquete que coincidan.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 6 }}>
            {!props.initialPersonId && <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setPersonId('')}>‹ Cambiar persona</button>}
            <span style={{ fontSize: 12, fontWeight: 600 }} className="muted">{profileLabel(person)}</span>
            <h3>{person.full_name}</h3>
          </div>
          <div className="money-3">
            <div><span className="k" style={{ fontSize: 11 }}>{pkg?.name}</span><span className="v" style={{ fontSize: 20 }}>{money(person.amount_due)}</span></div>
            <div><span className="k" style={{ fontSize: 11 }}>Abonado</span><span className="v" style={{ fontSize: 20 }}>{money(paid)}</span></div>
            <div><span className="k" style={{ fontSize: 11 }}>Saldo</span><span className="v" style={{ fontSize: 20, color: 'var(--ev)' }}>{money(saldo)}</span></div>
          </div>
          {history.map((h) => (
            <div key={h.id} className="row" style={{ justifyContent: 'space-between', fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--color-divider)' }}>
              <span>{dmy(h.paid_on)} · {h.method}</span><b>{money(h.amount)}</b>
            </div>
          ))}
          <Field label="Monto del abono">
            <input className="input input-money" type="number" inputMode="decimal" min={0} step="0.01" placeholder={saldo ? String(saldo) : '0'} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Fecha">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Método">
            <Segmented className="seg-lg" value={method} options={METHODS.map((m) => ({ value: m, label: m === 'Transferencia' ? 'Transfer.' : m }))} onChange={setMethod} />
          </Field>
          {settles && (
            <div className="info-box" style={{ fontSize: 13 }}>
              Este abono <b>liquida el paquete</b>. Se guardará {dmy(date)} como fecha de liquidación.
            </div>
          )}
          {value > saldo && saldo > 0 && <span className="field-hint">El monto es mayor que el saldo ({money(saldo)}).</span>}
          {error && <div className="alert">{error}</div>}
          <button className="btn btn-primary btn-xl" disabled={busy || value <= 0} onClick={submit}>
            {busy ? 'Guardando…' : settles ? 'Registrar y liquidar' : 'Registrar abono'}
          </button>
        </>
      )}
    </Modal>
  );
}
