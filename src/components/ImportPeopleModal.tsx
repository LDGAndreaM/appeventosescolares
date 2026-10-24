import { useMemo, useState } from 'react';
import { supabase, errorCode } from '../lib/supabase';
import { friendlyError } from '../lib/messages';
import { downloadBlob } from '../lib/certificate';
import { toCSV } from '../lib/export';
import { packageBlocks } from '../lib/schedule';
import { dmy, money, toISODay, todayISO } from '../lib/format';
import { METHODS, PROFILES, ROLES, type Activity, type Method, type Package, type Person, type PersonProfile, type Role } from '../lib/types';
import { Modal } from './ui';

const HEADERS = ['Nombre', 'Correo', 'Rol', 'Perfil', 'Carrera', 'Semestre', 'Paquete', 'Abono', 'Fecha abono', 'Método'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Encabezados aceptados (sin acentos ni mayúsculas) → campo. */
const COLUMN: Record<string, keyof Row> = {
  nombre: 'full_name', 'nombre completo': 'full_name', 'nombre s': 'full_name', alumno: 'full_name', participante: 'full_name',
  correo: 'email', email: 'email', 'correo electronico': 'email', 'e mail': 'email', mail: 'email',
  rol: 'role', 'rol en el evento': 'role',
  perfil: 'profile', descripcion: 'profile', tipo: 'profile', 'soy': 'profile',
  carrera: 'career', programa: 'career', licenciatura: 'career',
  semestre: 'semester',
  paquete: 'package',
  abono: 'amount', abonado: 'amount', monto: 'amount', pagado: 'amount', pago: 'amount', 'monto abonado': 'amount',
  'fecha abono': 'paid_on', 'fecha de abono': 'paid_on', 'fecha de pago': 'paid_on', 'fecha pago': 'paid_on', fecha: 'paid_on',
  metodo: 'method', 'metodo de pago': 'method', 'forma de pago': 'method',
};

interface Row {
  full_name: string;
  email: string;
  role: string;
  profile: string;
  career: string;
  semester: string;
  package: string;
  amount: string;
  paid_on: string;
  method: string;
}

interface Parsed {
  line: number;
  person: { full_name: string; email: string | null; role: Role; profile: PersonProfile | null; career: string | null; semester: number | null; package: Package | null };
  payment: { amount: number; paid_on: string; method: Method } | null;
  errors: string[];
  warnings: string[];
}

/** CSV con comillas, separador «,» o «;» (Excel en español) y BOM. */
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Lee el archivo como UTF-8 y, si no lo es (CSV guardado por Excel en Windows), como Windows-1252. */
async function readText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function parseDate(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = new Date(Number(y), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : toISODay(d);
  }
  return null;
}

const parseMoney = (s: string) => {
  const v = Number(s.replace(/[$\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

function interpret(rows: string[][], packages: Package[], existing: Person[]): { parsed: Parsed[]; unknownCols: string[]; missing: string[] } {
  const [head, ...body] = rows;
  const cols = head.map((h) => COLUMN[norm(h)]);
  const unknownCols = head.filter((_, i) => !cols[i] && head[i].trim());
  const missing = cols.includes('full_name') ? [] : ['Nombre'];
  // solo se omite a quien ya está con el mismo nombre y correo (p. ej. al subir el mismo archivo dos veces)
  const key = (name: string, email: string | null) => `${norm(name)}|${email ?? ''}`;
  const taken = new Set(existing.map((p) => key(p.full_name, p.email)));
  const seen = new Set<string>();
  const parsed = body.map((cells, i): Parsed => {
    const r: Row = { full_name: '', email: '', role: '', profile: '', career: '', semester: '', package: '', amount: '', paid_on: '', method: '' };
    cols.forEach((k, j) => { if (k) r[k] = (cells[j] ?? '').trim(); });
    const errors: string[] = [];
    const warnings: string[] = [];
    let email: string | null = r.email.toLowerCase() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      warnings.push(`Correo «${r.email}» no válido: se importa sin correo`);
      email = null;
    }
    const k = key(r.full_name, email);
    if (!r.full_name) errors.push('Falta el nombre');
    else if (taken.has(k)) errors.push('Ya está registrada en el evento');
    else if (seen.has(k)) errors.push('Fila repetida en el archivo');
    seen.add(k);

    let role = ROLES.find((x) => norm(x) === norm(r.role)) as Role | undefined;
    if (!role) {
      if (r.role) warnings.push(`Rol «${r.role}» no reconocido: queda como Participante`);
      role = 'Participante';
    }
    const profile = (PROFILES.find((x) => norm(x) === norm(r.profile)) ?? null) as PersonProfile | null;
    if (r.profile && !profile) warnings.push(`Perfil «${r.profile}» no reconocido`);
    const sem = r.semester ? parseInt(r.semester, 10) : NaN;
    const semester = profile === 'Estudiante' && sem >= 1 && sem <= 12 ? sem : null;
    const pkg = role === 'Participante' && r.package ? packages.find((p) => norm(p.name) === norm(r.package)) ?? null : null;
    if (r.package && role === 'Participante' && !pkg) warnings.push(`Paquete «${r.package}» no existe: se importa sin paquete`);

    let payment: Parsed['payment'] = null;
    if (r.amount) {
      const amount = parseMoney(r.amount);
      if (!(amount > 0)) warnings.push(`Abono «${r.amount}» no es un monto válido`);
      else if (!pkg) warnings.push('El abono se ignora porque no tiene paquete');
      else {
        const date = r.paid_on ? parseDate(r.paid_on) : todayISO();
        if (r.paid_on && !date) warnings.push(`Fecha «${r.paid_on}» no válida: se usa la de hoy`);
        const m = norm(r.method);
        const method = (METHODS.find((x) => norm(x).startsWith(m.slice(0, 5)) && m) ?? 'Efectivo') as Method;
        payment = { amount, paid_on: date ?? todayISO(), method };
      }
    }
    return {
      line: i + 2,
      person: {
        full_name: r.full_name, email, role, profile,
        career: profile === 'Estudiante' ? r.career || null : null, semester, package: pkg,
      },
      payment, errors, warnings,
    };
  });
  return { parsed, unknownCols, missing };
}

export default function ImportPeopleModal(props: {
  eventId: string;
  packages: Package[];
  activities: Activity[];
  people: Person[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: { line: number; msg: string }[] } | null>(null);

  const info = useMemo(() => (rows && rows.length ? interpret(rows, props.packages, props.people) : null), [rows, props.packages, props.people]);
  const ready = info?.parsed.filter((p) => !p.errors.length) ?? [];

  const pick = async (f: File | undefined) => {
    setError(null);
    setResult(null);
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) return setError('Ese es un archivo de Excel. En Excel elige «Guardar como → CSV UTF-8» y sube ese archivo.');
    setFileName(f.name);
    const text = await readText(f);
    const r = parseCSV(text);
    if (r.length < 2) return setError('El archivo no tiene filas de datos.');
    setRows(r);
  };

  const template = () => {
    const example = props.packages[0]?.name ?? 'Básico';
    downloadBlob(
      new Blob([toCSV({ title: 'Participantes', head: HEADERS, rows: [
        ['Karla Estrada Félix', 'karla.estrada@potros.itson.edu.mx', 'Participante', 'Estudiante', 'Arquitectura', 7, example, 300, dmy(todayISO()), 'Transferencia'],
        ['Diego Arvizu', 'diego.arvizu@itson.edu.mx', 'Tallerista', 'Docente', '', '', '', '', '', ''],
      ] })], { type: 'text/csv;charset=utf-8' }),
      'plantilla-participantes.csv',
    );
  };

  const run = async () => {
    setBusy('Importando…');
    setError(null);
    const failed: { line: number; msg: string }[] = [];
    let ok = 0;
    for (let i = 0; i < ready.length; i++) {
      const r = ready[i];
      setBusy(`Importando ${i + 1} de ${ready.length}…`);
      try {
        const { data, error } = await supabase
          .from('people')
          .insert({
            event_id: props.eventId, full_name: r.person.full_name, email: r.person.email, role: r.person.role,
            profile: r.person.profile, career: r.person.career, semester: r.person.semester,
            package_id: r.person.package?.id ?? null, amount_due: r.person.package?.price ?? 0,
          })
          .select('id')
          .single();
        if (error) throw error;
        const pid = data.id as string;
        if (r.payment) {
          const { error: e2 } = await supabase.from('payments').insert({ event_id: props.eventId, person_id: pid, ...r.payment });
          if (e2) throw e2;
        }
        if (r.person.package) {
          // actividades del paquete que no requieren elegir (las simultáneas se eligen en la ficha)
          const pkgActs = props.activities.filter((a) => a.activity_packages?.some((x) => x.package_id === r.person.package!.id));
          for (const a of packageBlocks(pkgActs).automatic) {
            const { error: e3 } = await supabase.from('enrollments').insert({ event_id: props.eventId, activity_id: a.id, person_id: pid });
            if (e3 && errorCode(e3) === 'ACTIVITY_FULL')
              await supabase.from('enrollments').insert({ event_id: props.eventId, activity_id: a.id, person_id: pid, status: 'waitlist' });
          }
        }
        ok++;
      } catch (e) {
        failed.push({ line: r.line, msg: friendlyError(e) });
      }
    }
    setBusy(null);
    setResult({ ok, failed });
    if (ok) props.onDone(ok);
  };

  const skipped = (info?.parsed.length ?? 0) - ready.length;
  const warned = ready.filter((p) => p.warnings.length).length;

  return (
    <Modal onClose={() => !busy && props.onClose()} width={860} label="Importar participantes">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h4>Importar participantes desde CSV</h4>
        <button type="button" className="link" onClick={template}>Descargar plantilla</button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Columnas: <b>Nombre</b> (obligatoria), Correo, Rol, Perfil, Carrera, Semestre, Paquete, Abono, Fecha abono, Método.
        El correo es opcional y puede repetirse. Los nombres de paquete deben coincidir con los de <i>Paquetes</i>.
        Solo se omite a quien ya esté registrado con el mismo nombre y correo.
      </p>
      {!result && (
        <label className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
          {fileName ? `Cambiar archivo (${fileName})` : 'Elegir archivo CSV'}
          <input type="file" accept=".csv,text/csv,.txt,.xls,.xlsx" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {error && <div className="alert">{error}</div>}
      {info && !result && (
        <>
          {info.missing.length > 0 && <div className="alert">Falta la columna {info.missing.join(' y ')}. Revisa que la primera fila tenga los encabezados.</div>}
          {info.unknownCols.length > 0 && <div className="alert info">Columnas que no se usan: {info.unknownCols.join(', ')}</div>}
          <div className="chips">
            <span className="tag tag-ok" style={{ padding: '4px 9px' }}>Listas {ready.length}</span>
            {warned > 0 && <span className="tag tag-warn" style={{ padding: '4px 9px' }}>Con avisos {warned}</span>}
            {skipped > 0 && <span className="tag tag-muted" style={{ padding: '4px 9px' }}>Se omiten {skipped}</span>}
          </div>
          <div className="preview-table" style={{ maxHeight: '42vh', overflowY: 'auto', border: '1px solid var(--color-divider)', borderRadius: 12 }}>
            <table>
              <thead><tr><th>Fila</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Perfil</th><th>Paquete</th><th>Abono</th><th>Estado</th></tr></thead>
              <tbody>
                {info.parsed.map((p) => (
                  <tr key={p.line} style={p.errors.length ? { opacity: 0.55 } : undefined}>
                    <td>{p.line}</td>
                    <td>{p.person.full_name}</td>
                    <td>{p.person.email ?? <span className="muted">Sin correo</span>}</td>
                    <td>{p.person.role}</td>
                    <td>{p.person.profile ?? '—'}{p.person.semester ? ` · ${p.person.semester}º` : ''}</td>
                    <td>{p.person.package?.name ?? '—'}</td>
                    <td>{p.payment ? money(p.payment.amount) : '—'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 180, color: p.errors.length ? 'var(--danger)' : p.warnings.length ? 'var(--warn-700)' : 'var(--ok-700)' }}>
                      {p.errors.length ? p.errors.join('; ') : p.warnings.length ? p.warnings.join('; ') : 'Lista'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {result && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="alert ok">Se importaron {result.ok} {result.ok === 1 ? 'persona' : 'personas'}.</div>
          {result.failed.length > 0 && (
            <div className="alert">
              No se pudieron importar {result.failed.length}:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.failed.slice(0, 10).map((f) => <li key={f.line}>Fila {f.line}: {f.msg}</li>)}</ul>
            </div>
          )}
          <p className="field-hint" style={{ margin: 0 }}>Los talleres de bloques simultáneos se eligen después en la ficha de cada participante.</p>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={!!busy} onClick={props.onClose}>{result ? 'Cerrar' : 'Cancelar'}</button>
        {!result && (
          <button className="btn btn-primary" disabled={!!busy || !ready.length || !!info?.missing.length} onClick={run}>
            {busy ?? `Importar ${ready.length} ${ready.length === 1 ? 'persona' : 'personas'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
