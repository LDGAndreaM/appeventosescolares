import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { activityLine, certificatesPdf, downloadBlob, drawCertificate, renderTemplate, type CertificateData } from '../../lib/certificate';
import { shortDate } from '../../lib/format';
import type { Signer } from '../../lib/types';
import { Loading } from '../../components/ui';
import { PublicHero, PublicMessage, PublicShell } from './PublicShell';
import '../event/event.css';

interface Verified {
  folio: string;
  issued_at: string;
  kind?: 'attendance' | 'role';
  person: { full_name: string; role?: string };
  event: { name: string; acronym: string; organizer: string; logo_url: string | null; color_primary: string; start_date: string; end_date: string };
  activity: { type: string; name: string; speaker: string; day: string; starts_at: string; ends_at: string } | null;
  attended: { type: string; name: string; day: string; starts_at: string; ends_at: string }[] | null;
  given?: { type: string; name: string; day: string; starts_at: string; ends_at: string }[] | null;
  settings: { body_activity: string; body_general: string; body_role?: string; signers: Signer[]; show_verification: boolean; background_url?: string | null; extra_logos?: string[] };
}

/** Verificación pública de una constancia (destino del QR) y descarga en PDF. */
export default function CertificateView() {
  const { folio = '' } = useParams();
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['certificate', folio],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verify_certificate', { p_folio: folio });
      if (error) throw error;
      return data as Verified | null;
    },
  });
  const c = q.data;
  const data: CertificateData | null = c
    ? {
        color: c.event.color_primary, eventName: c.event.name, organizer: c.event.organizer, acronym: c.event.acronym, logoUrl: c.event.logo_url,
        folio: c.folio, personName: c.person.full_name, signers: c.settings.signers, showVerification: c.settings.show_verification,
        background: c.settings.background_url ?? null, extraLogos: c.settings.extra_logos ?? [],
        ...(c.kind === 'role'
          ? {
              title: 'Constancia de participación',
              body: renderTemplate(c.settings.body_role || 'Por su valiosa participación como {rol} en {evento}, celebrado del {fechas}.', {
                person: c.person.full_name, role: c.person.role, eventName: c.event.name, start: c.event.start_date, end: c.event.end_date,
              }),
              list: c.given?.length ? c.given.map((a) => activityLine({ ...a, speaker: '' })) : undefined,
            }
          : {
              body: renderTemplate(c.activity ? c.settings.body_activity : c.settings.body_general, {
                person: c.person.full_name, activity: c.activity, eventName: c.event.name, start: c.event.start_date, end: c.event.end_date,
              }),
              list: c.activity ? undefined : (c.attended ?? []).map((a) => activityLine({ ...a, speaker: '' })),
            }),
      }
    : null;

  useEffect(() => {
    if (ref.current && data) void drawCertificate(ref.current, data, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c]);

  if (q.isLoading) return <PublicShell><Loading /></PublicShell>;
  if (!c || !data) return <PublicMessage title="Constancia no encontrada" text={`No existe una constancia con el folio ${folio.toUpperCase()}. Revisa que esté bien escrito.`} />;

  return (
    <PublicShell color={c.event.color_primary}>
      <PublicHero label="Verificación" logo={c.event.logo_url} acronym={c.event.acronym} title={c.event.name} sub={c.event.organizer} />
      <div className="stack" style={{ padding: '24px 20px', gap: 14, flex: 1 }}>
        <div className="card row" style={{ padding: 18, gap: 14 }}>
          <span style={{ width: 44, height: 44, flex: 'none', borderRadius: '50%', background: 'var(--af-green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }}>✓</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Constancia auténtica</div>
            <div style={{ fontSize: 13 }} className="muted">
              Folio {c.folio} · emitida a {c.person.full_name} el {shortDate(c.issued_at.slice(0, 10))}.
            </div>
          </div>
        </div>
        <div className="cert-preview" style={{ borderRadius: 12 }}><canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} /></div>
        <button
          className="btn btn-primary btn-xl btn-center"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const pdf = await certificatesPdf([data]);
            downloadBlob(pdf.output('blob'), `Constancia-${c.folio}.pdf`);
            setBusy(false);
          }}
        >
          {busy ? 'Generando…' : 'Descargar PDF'}
        </button>
      </div>
    </PublicShell>
  );
}
