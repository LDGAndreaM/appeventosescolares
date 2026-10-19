import { useState } from 'react';
import { useEventCtx } from '../../layout/EventLayout';
import {
  useActivities, useAttendance, useBalances, useCertificates, useEnrollments, usePackages, usePayments, usePeople,
} from '../../lib/api';
import { attendanceDataset, certificatesDataset, participantsDataset, paymentsDataset } from '../../lib/datasets';
import { downloadDataset, type Dataset } from '../../lib/export';
import { friendlyError } from '../../lib/messages';
import { ROLES } from '../../lib/types';
import { Field, Loading, useToast } from '../../components/ui';
import './event.css';

type Key = 'participantes' | 'pagos' | 'asistencia' | 'constancias';
const SETS: { key: Key; t: string; d: string }[] = [
  { key: 'participantes', t: 'Participantes', d: 'Nombre, correo, rol, perfil escolar y paquete' },
  { key: 'pagos', t: 'Pagos y abonos', d: 'Total, abonos con fecha y fecha de liquidación' },
  { key: 'asistencia', t: 'Asistencia a actividades', d: 'Inscritos vs. asistentes por actividad' },
  { key: 'constancias', t: 'Constancias', d: 'Folio, actividad, duración y estado de envío' },
];

export default function ExportPage() {
  const { event } = useEventCtx();
  const toast = useToast();
  const people = usePeople(event.id);
  const packages = usePackages(event.id);
  const balances = useBalances(event.id);
  const payments = usePayments(event.id);
  const activities = useActivities(event.id);
  const enrollments = useEnrollments(event.id);
  const attendance = useAttendance(event.id);
  const certificates = useCertificates(event.id);
  const [on, setOn] = useState<Record<Key, boolean>>({ participantes: true, pagos: true, asistencia: true, constancias: false });
  const [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx');
  const [role, setRole] = useState('Todos');
  const [busy, setBusy] = useState(false);

  if (!people.data || !packages.data || !balances.data || !payments.data || !activities.data || !enrollments.data || !attendance.data || !certificates.data)
    return <Loading />;

  const src = {
    people: people.data, packages: packages.data, balances: balances.data, payments: payments.data,
    activities: activities.data, enrollments: enrollments.data, attendance: attendance.data, certificates: certificates.data,
  };
  const build = (k: Key): Dataset =>
    k === 'participantes' ? participantsDataset(src, role) : k === 'pagos' ? paymentsDataset(src) : k === 'asistencia' ? attendanceDataset(src) : certificatesDataset(src);
  const chosen = SETS.filter((s) => on[s.key]);
  const preview = build(chosen[0]?.key ?? 'participantes');
  const n = chosen.length;

  const download = async () => {
    setBusy(true);
    try {
      for (const s of chosen) await downloadDataset(build(s.key), fmt, `${event.code_prefix}-${s.key}`);
    } catch (e) {
      toast(friendlyError(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Reportes</div>
          <h2>Exportar datos</h2>
        </div>
      </div>
      <div className="export-cols">
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <Field label="¿Qué quieres exportar?">
            <div className="stack" style={{ gap: 8 }}>
              {SETS.map((s) => (
                <button key={s.key} type="button" className={'export-opt' + (on[s.key] ? ' on' : '')} aria-pressed={on[s.key]} onClick={() => setOn({ ...on, [s.key]: !on[s.key] })}>
                  <span className={'check' + (on[s.key] ? ' on' : '')} style={{ marginTop: 2 }}>{on[s.key] ? '✓' : ''}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.t}</div>
                    <div className="cell-sub">{s.d}</div>
                  </div>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Filtrar por rol" hint="Aplica a la lista de participantes.">
            <select className="input input-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="Todos">Todos los roles</option>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Formato">
            <div className="fmt-switch">
              <button type="button" aria-pressed={fmt === 'xlsx'} onClick={() => setFmt('xlsx')}>Excel (.xlsx)</button>
              <button type="button" aria-pressed={fmt === 'csv'} onClick={() => setFmt('csv')}>CSV</button>
            </div>
            <span className="field-hint">{fmt === 'xlsx' ? 'Se abre directo en Excel. Un archivo por tipo de dato.' : 'Separado por comas, UTF-8. Un archivo por tipo de dato.'}</span>
          </Field>
          <button className="btn btn-primary btn-lg" disabled={!n || busy} onClick={download}>
            {busy ? 'Generando…' : n ? `Descargar ${n} archivo${n > 1 ? 's' : ''} ${fmt === 'xlsx' ? 'Excel' : 'CSV'}` : 'Elige qué exportar'}
          </button>
        </div>
        <div className="card" style={{ overflow: 'hidden', minWidth: 0 }}>
          <div className="row" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-divider)', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Vista previa · {preview.title}</span>
            <span style={{ fontSize: 12 }} className="muted">{preview.rows.length.toLocaleString('es-MX')} filas</span>
          </div>
          <div className="preview-table">
            <table>
              <thead><tr>{preview.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 9).map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{typeof c === 'number' && /Total|Pagado|Saldo/.test(preview.head[j]) ? `$${c.toLocaleString('es-MX')}` : c}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {!preview.rows.length && <div className="empty">Sin datos todavía.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
