import { useState, type FormEvent } from 'react';
import { useEventCtx } from '../../layout/EventLayout';
import { useInvalidateEvent, usePackages, usePeople } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/messages';
import { money } from '../../lib/format';
import type { Package } from '../../lib/types';
import { Field, Loading, Modal, Progress, useToast } from '../../components/ui';
import './event.css';

type Draft = { id?: string; name: string; price: string; description: string; includes: string; workshop_limit: string };

export default function Packages() {
  const { event, full } = useEventCtx();
  const packages = usePackages(event.id);
  const people = usePeople(event.id);
  const invalidate = useInvalidateEvent(event.id);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!packages.data || !people.data) return <Loading />;
  const buyers = (id: string) => people.data.filter((p) => p.package_id === id);
  const sold = packages.data.map((p) => buyers(p.id).length);
  const maxSold = Math.max(1, ...sold);
  const totalSold = sold.reduce((a, b) => a + b, 0);
  const expected = people.data.filter((p) => p.package_id).reduce((s, p) => s + p.amount_due, 0);

  const open = (p?: Package) =>
    setDraft(
      p
        ? { id: p.id, name: p.name, price: String(p.price), description: p.description, includes: p.includes.join('\n'), workshop_limit: p.workshop_limit == null ? '' : String(p.workshop_limit) }
        : { name: '', price: '', description: '', includes: '', workshop_limit: '' },
    );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const row = {
      event_id: event.id,
      name: draft.name.trim(),
      price: Number(draft.price || 0),
      description: draft.description.trim(),
      includes: draft.includes.split('\n').map((x) => x.trim()).filter(Boolean),
      workshop_limit: draft.workshop_limit === '' ? null : Number(draft.workshop_limit),
      ...(draft.id ? {} : { sort_order: packages.data.length }),
    };
    const { error } = draft.id
      ? await supabase.from('packages').update(row).eq('id', draft.id)
      : await supabase.from('packages').insert(row);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await invalidate('packages');
    setDraft(null);
    toast(draft.id ? 'Paquete actualizado' : 'Paquete creado');
  };

  const remove = async () => {
    if (!draft?.id) return;
    const n = buyers(draft.id).length;
    if (n && !window.confirm(`${n} participantes tienen este paquete. Si lo eliminas quedarán sin paquete. ¿Continuar?`)) return;
    const { error } = await supabase.from('packages').delete().eq('id', draft.id);
    if (error) return setError(friendlyError(error));
    await invalidate();
    setDraft(null);
    toast('Paquete eliminado');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{totalSold} vendidos · {money(expected)} esperados</div>
          <h2>Paquetes</h2>
        </div>
        {full && <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={() => open()}>+ Nuevo paquete</button>}
      </div>
      <div className="packages-grid">
        {packages.data.map((p, i) => (
          <div key={p.id} className="pkg-card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>{p.name}</h3>
              {full && <button className="link" style={{ fontSize: 12, color: 'var(--color-neutral-700)', fontWeight: 400 }} onClick={() => open(p)}>Editar</button>}
            </div>
            <div className="pkg-price">{money(p.price)}</div>
            {p.description && <p style={{ fontSize: 13 }} className="muted">{p.description}</p>}
            <div className="stack divider-top">
              {p.includes.map((x) => <div key={x} className="pkg-inc">{x}</div>)}
              {p.workshop_limit != null && <div className="pkg-inc">{p.workshop_limit === 1 ? '1 taller a elegir' : `${p.workshop_limit} talleres a elegir`}</div>}
            </div>
            <div className="stack" style={{ marginTop: 'auto', gap: 6 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>Vendidos</span><b>{sold[i]}</b></div>
              <Progress pct={(sold[i] / maxSold) * 100} />
              <span className="cell-sub">{money(buyers(p.id).reduce((s, x) => s + x.amount_due, 0))} esperados</span>
            </div>
          </div>
        ))}
        {!packages.data.length && (
          <div className="card card-lg empty" style={{ gridColumn: '1 / -1' }}>
            Crea los paquetes que podrán adquirir los participantes (por ejemplo Básico, Completo, Total).
            {full && <div style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={() => open()}>+ Nuevo paquete</button></div>}
          </div>
        )}
      </div>

      {draft && (
        <Modal onClose={() => setDraft(null)} label="Paquete" sheetOnMobile>
          <form className="stack" style={{ gap: 16 }} onSubmit={save}>
            <h4>{draft.id ? 'Editar paquete' : 'Nuevo paquete'}</h4>
            <div className="grid-2">
              <Field label="Nombre"><input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Completo" /></Field>
              <Field label="Precio (MXN)"><input className="input" type="number" min={0} step="0.01" required value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></Field>
            </div>
            <Field label="Descripción"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="El más elegido por estudiantes." /></Field>
            <Field label="Incluye" hint="Una línea por cada beneficio.">
              <textarea className="input" value={draft.includes} onChange={(e) => setDraft({ ...draft, includes: e.target.value })} placeholder={'Todas las conferencias\nComidas (3)\nKit y constancia'} />
            </Field>
            <Field label="Talleres a elegir" hint="Cuántos bloques de talleres simultáneos puede elegir. Las actividades del paquete se marcan en Programa.">
              <input className="input" type="number" min={0} value={draft.workshop_limit} onChange={(e) => setDraft({ ...draft, workshop_limit: e.target.value })} placeholder="Sin límite" />
            </Field>
            {error && <div className="alert">{error}</div>}
            <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
              {draft.id ? <button type="button" className="link danger" onClick={remove}>Eliminar paquete</button> : <span />}
              <div className="row">
                <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
