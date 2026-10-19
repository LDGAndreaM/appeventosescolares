import type { ReactNode } from 'react';
import { evStyle } from '../../lib/theme';
import { AforoLogo, Loading, MonoBox } from '../../components/ui';

/** Contenedor móvil teñido con el color del evento para las páginas públicas. */
export function PublicShell({ color, color2, children }: { color?: string | null; color2?: string | null; children: ReactNode }) {
  return (
    <div className="ev-scope" style={{ ...evStyle(color, color2), background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="mobile-page">{children}</div>
    </div>
  );
}

export function PublicHero(props: { label: string; logo?: string | null; acronym?: string; title: string; sub: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="hero">
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
        <span className="row" style={{ gap: 6 }}><AforoLogo size={18} radius={5} /> Aforo</span>
        <span>{props.label}</span>
      </div>
      {props.kicker && <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, marginTop: 6 }}>{props.kicker}</span>}
      {props.acronym !== undefined && <MonoBox logo={props.logo} text={props.acronym} size={48} outline={!props.logo} />}
      <span aria-hidden="true" style={{ width: 48, height: 6, borderRadius: 99, background: 'var(--ev2)', marginTop: 2 }} />
      <div className="hero-title">{props.title}</div>
      <div style={{ fontSize: 13 }}>{props.sub}</div>
    </div>
  );
}

export function PublicMessage({ title, text, children }: { title: string; text: ReactNode; children?: ReactNode }) {
  return (
    <PublicShell>
      <div className="stack" style={{ padding: 24, gap: 12, marginTop: '20vh', textAlign: 'center', alignItems: 'center' }}>
        <AforoLogo size={40} radius={10} />
        <h3>{title}</h3>
        <p className="muted" style={{ fontSize: 14 }}>{text}</p>
        {children}
      </div>
    </PublicShell>
  );
}

export { Loading };
