import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key');

/** URL pública de la app (para QR, enlaces de registro y constancias). */
export const publicUrl = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin).replace(/\/$/, '');

/** Lee todas las filas de una consulta paginando de 1000 en 1000 (límite por defecto de PostgREST). */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

/** Convierte errores de Postgres/PostgREST en un código de negocio legible por la UI. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const m = msg.match(/[A-Z][A-Z_]{3,}/);
  return m ? m[0] : msg;
}
