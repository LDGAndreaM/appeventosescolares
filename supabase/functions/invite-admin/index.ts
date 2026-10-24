// Invita a un administrador a un evento. Si la cuenta no existe se crea con la
// contraseña temporal indicada y se marca para cambiarla al primer inicio de sesión.
import {
  callerClient, corsHeaders, emailConfigured, emailLayout, esc, json, sendEmail, serviceClient,
} from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await callerClient(req);
    if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);

    const { event_id, full_name, email, password, permission, notify } = await req.json();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!event_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return json({ error: 'INVALID_EMAIL' }, 400);
    if (!['full', 'registration'].includes(permission)) return json({ error: 'INVALID_PERMISSION' }, 400);

    const { data: allowed } = await caller.client.rpc('has_full_access', { eid: event_id });
    if (!allowed) return json({ error: 'FORBIDDEN' }, 403);

    const admin = serviceClient();
    const { data: event } = await admin.from('events').select('name, color_primary').eq('id', event_id).single();

    let { data: profile } = await admin.from('profiles').select('id').eq('email', cleanEmail).maybeSingle();
    let created = false;
    if (!profile) {
      if (typeof password !== 'string' || password.length < 8) return json({ error: 'WEAK_PASSWORD' }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: String(full_name ?? '').trim(), must_change_password: true },
      });
      if (error || !data.user) return json({ error: 'CREATE_USER_FAILED', message: error?.message }, 400);
      profile = { id: data.user.id };
      created = true;
    }

    const { data: existing } = await admin.from('event_admins').select('role')
      .eq('event_id', event_id).eq('user_id', profile.id).maybeSingle();
    if (existing) return json({ already: true, created: false, emailed: false });

    const { error: insErr } = await admin.from('event_admins').insert({
      event_id, user_id: profile.id, role: 'admin', permission, invited_by: caller.userId,
    });
    if (insErr) return json({ error: 'INSERT_FAILED', message: insErr.message }, 400);

    let emailed = false;
    // el correo es opcional: solo si la app lo pide y está configurado; si falla, la invitación sigue siendo válida
    if (notify === true && emailConfigured()) try {
      const appUrl = Deno.env.get('APP_URL') ?? '';
      const access = permission === 'full' ? 'Acceso completo' : 'Registro y pagos';
      const creds = created
        ? `<p>Entra con estos datos; te pediremos cambiar la contraseña:</p>
           <p style="background:#f4f6fb;border-radius:12px;padding:12px 14px;font-family:ui-monospace,Menlo,monospace">
           ${esc(cleanEmail)}<br>${esc(password)}</p>`
        : `<p>Entra con tu correo y tu contraseña de siempre.</p>`;
      await sendEmail({
        to: cleanEmail,
        subject: `Te invitaron a administrar ${event?.name ?? 'un evento'}`,
        html: emailLayout({
          color: event?.color_primary ?? '#1d5bd8',
          eventName: event?.name ?? '',
          title: 'Invitación como administrador',
          body: `<p>Hola ${esc(full_name || '')}, te dieron acceso al panel de <b>${esc(event?.name)}</b> con permiso <b>${access}</b>.</p>
            ${creds}
            ${appUrl ? `<p><a href="${esc(appUrl)}/entrar" style="display:inline-block;background:#1d5bd8;color:#fff;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:12px">Entrar a Aforo →</a></p>` : ''}`,
        }),
      });
      emailed = true;
    } catch (e) {
      console.error('invite email failed', e);
    }
    return json({ created, emailed, already: false });
  } catch (e) {
    return json({ error: 'INTERNAL', message: (e as Error).message }, 500);
  }
});
