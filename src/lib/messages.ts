import { errorCode } from './supabase';

const MESSAGES: Record<string, string> = {
  ACTIVITY_FULL: 'Esta actividad ya alcanzó su cupo.',
  ALREADY_REGISTERED: 'Ese correo ya está registrado en el evento.',
  REGISTRATION_CLOSED: 'El registro público está cerrado.',
  PACKAGE_NOT_FOUND: 'El paquete ya no existe.',
  ACTIVITY_NOT_IN_PACKAGE: 'Esa actividad no está incluida en tu paquete.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  QR_INACTIVE: 'El registro de asistencia de esta actividad no está activo en este momento.',
  NOT_REGISTERED: 'No encontramos ese correo entre las personas registradas al evento.',
  NOT_ENROLLED: 'Esta actividad solo acepta asistencia de personas inscritas.',
  EMAIL_NOT_CONFIGURED: 'El envío de correos no está configurado (falta RESEND_API_KEY en Supabase).',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  UNAUTHORIZED: 'Tu sesión expiró. Vuelve a entrar.',
  INVALID_EMAIL: 'Escribe un correo válido.',
  WEAK_PASSWORD: 'La contraseña temporal debe tener al menos 8 caracteres.',
  CREATE_USER_FAILED: 'No se pudo crear la cuenta.',
};

export function friendlyError(e: unknown): string {
  const raw = (e as { message?: string })?.message ?? String(e);
  if (/people_event_email_uq/.test(raw)) return 'Ya hay una persona con ese correo en el evento.';
  if (/events_slug_key/.test(raw)) return 'Ese enlace ya está en uso; cambia el nombre corto.';
  if (/row-level security/.test(raw)) return MESSAGES.FORBIDDEN;
  if (/Invalid login credentials/i.test(raw)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(raw)) return 'Confirma tu correo antes de entrar (revisa tu bandeja).';
  if (/User already registered/i.test(raw)) return 'Ya existe una cuenta con ese correo. Inicia sesión.';
  if (/Password should be/i.test(raw)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(raw))
    return 'Hay una versión nueva de Aforo. Recarga la página (Ctrl + Shift + R) e inténtalo de nuevo.';
  if (/Tainted canvases|SecurityError/i.test(raw))
    return 'No se pudo usar una de las imágenes (logo, fondo o firma). Vuelve a subirla e inténtalo de nuevo.';
  if (/Failed to fetch|NetworkError/i.test(raw)) return 'Sin conexión con el servidor. Revisa tu internet.';
  return MESSAGES[errorCode(e)] ?? raw;
}
