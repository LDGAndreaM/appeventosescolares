import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/** Primer valor no vacío, sin espacios ni comillas sobrantes. */
const pick = (...values: (string | undefined)[]) =>
  values.map((v) => (v ?? '').trim().replace(/^['"]|['"]$/g, '')).find(Boolean) ?? ''

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  // Acepta también los nombres que crea la integración Supabase ↔ Vercel.
  // Solo se exponen la URL y la llave pública (nunca la service role).
  const url = pick(env.VITE_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_URL)
  const anon = pick(
    env.VITE_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    env.SUPABASE_PUBLISHABLE_KEY,
  )
  const publicUrl = pick(env.VITE_PUBLIC_URL, env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`)
  return {
    plugins: [
      react(),
      {
        // Respaldo para rutas internas (/eventos, /a/…): si el hosting no aplica la reescritura
        // de vercel.json, su página 404 también carga la app.
        name: 'spa-404-fallback',
        apply: 'build',
        closeBundle() {
          const dist = path.resolve(process.cwd(), 'dist')
          if (fs.existsSync(path.join(dist, 'index.html')))
            fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html'))
        },
      },
    ],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anon),
      'import.meta.env.VITE_PUBLIC_URL': JSON.stringify(publicUrl),
    },
  }
})
