import { AforoLogo } from '../components/ui';

/** Se muestra cuando faltan las variables de entorno de Supabase. */
export default function SetupNotice() {
  return (
    <div className="af-scope" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-lg stack" style={{ padding: 32, gap: 16, maxWidth: 560 }}>
        <div className="row" style={{ gap: 10 }}>
          <AforoLogo size={32} radius={8} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Aforo</span>
        </div>
        <h3>Falta conectar Supabase</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          Crea un archivo <code>.env.local</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>
          (ver <code>.env.example</code> y el README) y vuelve a iniciar la app.
        </p>
      </div>
    </div>
  );
}
