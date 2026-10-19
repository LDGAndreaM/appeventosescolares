export type EventStatus = 'draft' | 'active' | 'finished';
export type Permission = 'full' | 'registration';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  must_change_password: boolean;
}

export interface EventRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  acronym: string;
  organizer: string;
  description: string;
  venue: string;
  logo_url: string | null;
  palette: string;
  color_primary: string;
  color_secondary: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  status: EventStatus;
  registration_open: boolean;
  registration_closes_at: string | null;
  code_prefix: string;
  created_at: string;
}

export interface EventDay {
  event_id: string;
  day: string;
  starts_at: string;
  ends_at: string;
}

export interface EventAdmin {
  event_id: string;
  user_id: string;
  role: 'creator' | 'admin';
  permission: Permission;
  last_access_at: string | null;
  created_at: string;
  profile?: { full_name: string; email: string } | null;
}

export interface Package {
  id: string;
  event_id: string;
  name: string;
  price: number;
  description: string;
  includes: string[];
  workshop_limit: number | null;
  sort_order: number;
}

export interface Activity {
  id: string;
  event_id: string;
  type: string;
  name: string;
  speaker: string;
  venue: string;
  day: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  code: string;
  qr_enabled: boolean;
  qr_from: string | null;
  qr_to: string | null;
  only_registered: boolean;
  activity_packages?: { package_id: string }[];
}

export interface ActivityStats {
  activity_id: string;
  enrolled: number;
  waitlist: number;
  attended: number;
  /** Asistencias de personas inscritas (sin contar «sin inscripción»). */
  attended_enrolled: number;
}

export const ROLES = [
  'Participante', 'Organizador', 'Colaborador', 'Ponente', 'Conferencista', 'Tallerista', 'Patrocinador', 'Staff',
] as const;
export type Role = (typeof ROLES)[number];

export const PROFILES = ['Estudiante', 'Docente', 'Administrativo', 'Externo', 'Familiar'] as const;
export type PersonProfile = (typeof PROFILES)[number];

export const METHODS = ['Efectivo', 'Transferencia', 'Tarjeta'] as const;
export type Method = (typeof METHODS)[number];

export interface Person {
  id: string;
  event_id: string;
  full_name: string;
  email: string;
  role: Role;
  profile: PersonProfile | null;
  career: string | null;
  semester: number | null;
  package_id: string | null;
  amount_due: number;
  settled_on: string | null;
  source: 'admin' | 'public';
  created_at: string;
}

export interface PersonBalance {
  person_id: string;
  paid: number;
  payments_count: number;
  last_paid_on: string | null;
}

export interface Payment {
  id: string;
  event_id: string;
  person_id: string;
  amount: number;
  paid_on: string;
  method: Method;
  received_by_name: string;
  created_at: string;
}

export interface Enrollment {
  event_id: string;
  activity_id: string;
  person_id: string;
  status: 'enrolled' | 'waitlist';
  created_at: string;
}

export interface Attendance {
  event_id: string;
  activity_id: string;
  person_id: string;
  method: 'qr' | 'manual';
  marked_by_name: string;
  created_at: string;
}

export interface Signer {
  name: string;
  title: string;
  signature_url?: string | null;
}

export interface CertificateSettings {
  event_id: string;
  body_activity: string;
  body_general: string;
  body_role: string;
  signers: Signer[];
  show_verification: boolean;
}

export interface Certificate {
  id: string;
  event_id: string;
  person_id: string;
  activity_id: string | null;
  /** attendance = por asistencia (actividad o general); role = participación por su rol */
  kind: 'attendance' | 'role';
  folio: string;
  status: 'ready' | 'sent';
  sent_at: string | null;
  created_at: string;
}

/** Evento público tal como lo devuelve get_public_event(). */
export interface PublicEvent {
  id: string;
  slug: string;
  name: string;
  acronym: string;
  organizer: string;
  description: string;
  venue: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string | null;
  start_date: string;
  end_date: string;
  status: EventStatus;
  registration_open: boolean;
  registration_closes_at: string | null;
  days: { day: string; starts_at: string; ends_at: string }[];
  packages: Pick<Package, 'id' | 'name' | 'price' | 'description' | 'includes' | 'workshop_limit'>[];
  activities: (Pick<Activity, 'id' | 'type' | 'name' | 'speaker' | 'venue' | 'day' | 'starts_at' | 'ends_at' | 'capacity'> & {
    enrolled: number;
    package_ids: string[];
  })[];
}
