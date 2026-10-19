import { AforoLogo } from '../components/ui';

const hasUrl = Boolean(import.meta.env.VITE_SUPABASE_URL);
const hasKey = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Se muestra cuando faltan las variables de entorno de Supabase al construir la app. */
export default function SetupNotice() {
  const row = (ok: boolean, name: string) => (
    <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className={'tag ' + (ok ? 'tag-ok' : 'tag-muted')}>{ok ? 'OK' : 'Falta'}</span>
      <code>{name}</code>
    </li>
  );
  return (
    <div className="af-scope" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-lg stack" style={{ padding: 32, gap: 16, maxWidth: 560 }}>
        <div className="row" style={{ gap: 10 }}>
          <AforoLogo size={32} radius={8} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Aforo</span>
        </div>
        <h3>Falta conectar Supabase</h3>
        <ul className="stack" style={{ gap: 6, margin: 0, padding: 0, listStyle: 'none', fontSize: 14 }}>
          {row(hasUrl, 'VITE_SUPABASE_URL')}
          {row(hasKey, 'VITE_SUPABASE_ANON_KEY')}
        </ul>
        <p className="muted" style={{ fontSize: 14 }}>
          En Vercel: Settings → Environment Variables. Marca el ambiente <b>Production</b> y después haz
          <b> Redeploy</b>: las variables se leen al construir la app, no al abrirla. En local, ponlas en <code>.env.local</code>.
        </p>
      </div>
    </div>
  );
}
