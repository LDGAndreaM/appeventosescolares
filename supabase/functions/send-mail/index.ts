// Envía correos a participantes: constancias (con PDF adjunto) y comprobantes de pago.
// Todas las consultas usan los permisos de quien llama, así que solo funciona
// para administradores del evento.
import {
  callerClient, corsHeaders, emailConfigured, emailLayout, esc, json, money, sendEmail,
} from '../_shared/util.ts';

const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await callerClient(req);
    if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
    if (!emailConfigured()) return json({ error: 'EMAIL_NOT_CONFIGURED' }, 501);
    const db = caller.client;
    const body = await req.json();

    if (body.kind === 'certificate') {
      const { data: cert, error } = await db.from('certificates')
        .select('id, folio, event_id, person:people(full_name, email), activity:activities(type, name, day, starts_at, ends_at), event:events(name, color_primary)')
        .eq('id', body.certificate_id).single();
      if (error || !cert) return json({ error: 'NOT_FOUND' }, 404);
      // deno-lint-ignore no-explicit-any
      const c = cert as any;
      const first = String(c.person.full_name).split(' ')[0];
      const detail = c.activity
        ? `${esc(c.activity.type)} ${esc(c.activity.name)} · ${esc(body.duration ?? '')} · ${fmtDate(c.activity.day)}`
        : 'Constancia general de participación';
      const others = (body.others ?? []) as { name: string; url: string }[];
      await sendEmail({
        to: c.person.email,
        subject: `Tu constancia: ${c.activity?.name ?? c.event.name}`,
        html: emailLayout({
          color: c.event.color_primary,
          eventName: c.event.name,
          title: `Tu constancia: ${c.activity?.name ?? 'participación'}`,
          body: `<p>Hola ${esc(first)}, gracias por asistir a ${esc(c.event.name)}. Adjuntamos tu constancia de asistencia.</p>
            <div style="border-left:6px solid ${esc(c.event.color_primary)};border-radius:12px;background:#f7f8fb;padding:14px 16px;margin:16px 0">
              <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${esc(c.event.color_primary)}">Constancia de asistencia</div>
              <div style="font-size:20px;font-weight:700">${esc(c.person.full_name)}</div>
              <div style="font-size:12px;color:#5a6070">${detail}</div>
            </div>
            ${body.verify_url ? `<p style="font-size:13px">Folio <b>${esc(c.folio)}</b> · <a href="${esc(body.verify_url)}">verificar o descargar</a></p>` : ''}
            ${others.length ? `<p style="font-size:12px;font-weight:700;color:#5a6070;margin-top:20px">También asististe a</p>
              ${others.map((o) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e4e7ef;font-size:13px"><span>${esc(o.name)}</span> <a href="${esc(o.url)}" style="font-weight:700">Descargar</a></div>`).join('')}` : ''}`,
        }),
        attachments: body.pdf_base64 ? [{ filename: `Constancia-${c.folio}.pdf`, content: body.pdf_base64 }] : undefined,
      });
      await db.from('certificates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', c.id);
      return json({ ok: true });
    }

    if (body.kind === 'receipt') {
      const { data: p, error } = await db.from('people')
        .select('full_name, email, amount_due, settled_on, package:packages(name), event:events(name, color_primary), payments(amount, paid_on, method)')
        .eq('id', body.person_id).single();
      if (error || !p) return json({ error: 'NOT_FOUND' }, 404);
      // deno-lint-ignore no-explicit-any
      const r = p as any;
      const pays = [...r.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on));
      const paid = pays.reduce((s, x) => s + Number(x.amount), 0);
      const due = Number(r.amount_due);
      await sendEmail({
        to: r.email,
        subject: `Comprobante de pago · ${r.event.name}`,
        html: emailLayout({
          color: r.event.color_primary,
          eventName: r.event.name,
          title: 'Comprobante de pago',
          body: `<p>Hola ${esc(String(r.full_name).split(' ')[0])}, este es el estado de tu paquete <b>${esc(r.package?.name ?? '—')}</b>.</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">
              <tr><th align="left" style="padding:6px 0;border-bottom:1px solid #dde1ea">Fecha</th><th align="left" style="border-bottom:1px solid #dde1ea">Método</th><th align="right" style="border-bottom:1px solid #dde1ea">Monto</th></tr>
              ${pays.map((x) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e4e7ef">${fmtDate(x.paid_on)}</td><td style="border-bottom:1px solid #e4e7ef">${esc(x.method)}</td><td align="right" style="border-bottom:1px solid #e4e7ef"><b>${money(x.amount)}</b></td></tr>`).join('')}
            </table>
            <p>A pagar <b>${money(due)}</b> · Abonado <b>${money(paid)}</b> · Saldo <b>${money(Math.max(due - paid, 0))}</b></p>
            ${r.settled_on ? `<p>Liquidaste tu paquete el <b>${fmtDate(r.settled_on)}</b>. ¡Gracias!</p>` : ''}`,
        }),
      });
      return json({ ok: true });
    }

    return json({ error: 'UNKNOWN_KIND' }, 400);
  } catch (e) {
    return json({ error: 'INTERNAL', message: (e as Error).message }, 500);
  }
});
