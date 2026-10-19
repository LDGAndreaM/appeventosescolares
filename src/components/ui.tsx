import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

export function Field(props: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; aside?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="field" style={props.style}>
      {props.aside ? (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="label">{props.label}</label>
          {props.aside}
        </div>
      ) : (
        <label>{props.label}</label>
      )}
      {props.children}
      {props.error ? <span className="field-error">{props.error}</span> : props.hint ? <span className="field-hint">{props.hint}</span> : null}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className="toggle"
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    />
  );
}

export function SettingRow(props: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="stack">
        <span className="t">{props.title}</span>
        {props.desc && <span className="d">{props.desc}</span>}
      </div>
      {props.children}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: readonly (T | { value: T; label: ReactNode })[];
  onChange: (v: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={'seg ' + (props.className ?? '')} role="group" aria-label={props.label}>
      {props.options.map((o) => {
        const value = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return (
          <button type="button" key={value} aria-pressed={props.value === value} onClick={() => props.onChange(value)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ pct, color, lg }: { pct: number; color?: string; lg?: boolean }) {
  return (
    <div className={'progress' + (lg ? ' lg' : '')}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function Modal(props: { onClose: () => void; children: ReactNode; width?: number; sheetOnMobile?: boolean; label?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [props]);
  // El modal hereda el color del evento del contenedor más cercano
  const host = document.querySelector('.ev-scope') ?? document.body;
  return createPortal(
    <div
      className={'modal-backdrop' + (props.sheetOnMobile ? ' sheet-mobile' : '')}
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.label} style={props.width ? { width: props.width } : undefined}>
        {props.children}
      </div>
    </div>,
    host,
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Cargando" />;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="center-screen">
      <Spinner />
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="center-screen">
      <div className="alert" style={{ maxWidth: 480 }}>
        No pudimos cargar la información. {(error as Error)?.message}
      </div>
    </div>
  );
}

/** Cuadro con el logo del evento o sus siglas (como en el diseño). */
export function MonoBox(props: { logo?: string | null; text: string; size: number; fontSize?: number; outline?: boolean; radius?: number }) {
  return (
    <div
      className={'mono-box' + (props.logo ? ' has-logo' : props.outline ? ' outline' : '')}
      style={{ width: props.size, height: props.size, fontSize: props.fontSize ?? 15, borderRadius: props.radius ?? 12, padding: props.logo ? Math.max(2, Math.round(props.size * 0.08)) : undefined }}
    >
      {props.logo ? <img src={props.logo} alt="" /> : props.text}
    </div>
  );
}

export function AforoLogo({ size = 28, radius = 6 }: { size?: number; radius?: number }) {
  return (
    <div className="logo-crop" style={{ width: size, height: size, borderRadius: radius }}>
      <img src="/brand/aforo-logo.png" alt="Aforo" />
    </div>
  );
}

// ── Avisos ────────────────────────────────────────────────────────────────────
type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, error }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), error ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={'toast' + (t.error ? ' error' : '')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastCtx);
