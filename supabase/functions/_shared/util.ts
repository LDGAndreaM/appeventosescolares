import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

/** Cliente con los permisos (RLS) de quien llama, más el usuario autenticado. */
export async function callerClient(req: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  return { client, userId: data.user.id };
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

export const emailConfigured = () => Boolean(Deno.env.get('RESEND_API_KEY') && Deno.env.get('MAIL_FROM'));

export async function sendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string }[];
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), ...msg }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plantilla base de correo: franja con el color del evento y tarjeta blanca. */
export function emailLayout(opts: { color: string; eventName: string; title: string; body: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Figtree,Segoe UI,Arial,sans-serif;color:#1b1f2b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:${esc(opts.color)};color:#fff;border-radius:20px 20px 0 0;padding:20px 24px">
    <div style="font-size:12px;font-weight:600;opacity:.9">${esc(opts.eventName)} · vía Aforo</div>
    <div style="font-size:22px;font-weight:700;line-height:1.2;margin-top:4px">${esc(opts.title)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 20px 20px;padding:24px;font-size:14px;line-height:1.55">${opts.body}</div>
  <p style="font-size:12px;color:#737989;text-align:center;margin-top:16px">Enviado con Aforo · Registro de eventos escolares</p>
</div></body></html>`;
}

export const money = (n: number) => '$' + Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
