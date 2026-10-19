-- Aforo · esquema inicial
-- Eventos escolares: administradores por evento, paquetes, programa de actividades,
-- participantes con abonos, inscripción a talleres con cupo, asistencia por QR y constancias.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Perfiles (1:1 con auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Eventos
-- ─────────────────────────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  name text not null check (length(trim(name)) > 0),
  acronym text not null default '' check (length(acronym) <= 6),
  organizer text not null default '',
  description text not null default '',
  venue text not null default '',
  logo_url text,
  palette text not null default 'Cobalto',
  color_primary text not null default '#3047c8' check (color_primary ~* '^#[0-9a-f]{6}$'),
  color_secondary text check (color_secondary ~* '^#[0-9a-f]{6}$'),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'America/Hermosillo',
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  registration_open boolean not null default false,
  registration_closes_at timestamptz,
  code_prefix text not null default 'EV' check (code_prefix ~ '^[A-Z0-9]{1,8}$'),
  cert_seq integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.event_days (
  event_id uuid not null references public.events (id) on delete cascade,
  day date not null,
  starts_at time not null default '09:00',
  ends_at time not null default '18:00',
  primary key (event_id, day),
  check (ends_at > starts_at)
);

create table public.event_admins (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'admin' check (role in ('creator', 'admin')),
  permission text not null default 'full' check (permission in ('full', 'registration')),
  invited_by uuid references public.profiles (id),
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_admins_user_idx on public.event_admins (user_id);

-- Funciones de permiso (security definer para evitar recursión en RLS)
create function public.is_event_admin(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_admins where event_id = eid and user_id = auth.uid());
$$;

create function public.has_full_access(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_admins where event_id = eid and user_id = auth.uid() and permission = 'full');
$$;

create function public.is_event_creator(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_admins where event_id = eid and user_id = auth.uid() and role = 'creator');
$$;

-- Quien crea el evento queda como creador con acceso completo
create function public.add_event_creator() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into event_admins (event_id, user_id, role, permission, last_access_at)
  values (new.id, new.owner_id, 'creator', 'full', now())
  on conflict (event_id, user_id) do update set role = 'creator', permission = 'full';
  insert into certificate_settings (event_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create function public.touch_event_access(eid uuid) returns void
language sql security definer set search_path = public as $$
  update event_admins set last_access_at = now() where event_id = eid and user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Paquetes y programa
-- ─────────────────────────────────────────────────────────────────────────────
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price numeric(10, 2) not null default 0 check (price >= 0),
  description text not null default '',
  includes text[] not null default '{}',
  workshop_limit integer check (workshop_limit >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index packages_event_idx on public.packages (event_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  type text not null default 'Taller',
  name text not null check (length(trim(name)) > 0),
  speaker text not null default '',
  venue text not null default '',
  day date not null,
  starts_at time not null,
  ends_at time not null,
  capacity integer check (capacity > 0),
  code text not null default '' unique,
  qr_enabled boolean not null default true,
  qr_from time,
  qr_to time,
  only_registered boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index activities_event_idx on public.activities (event_id, day, starts_at);

create table public.activity_packages (
  activity_id uuid not null references public.activities (id) on delete cascade,
  package_id uuid not null references public.packages (id) on delete cascade,
  primary key (activity_id, package_id)
);

-- Código corto de asistencia: PREFIJO-ABC-DD (p. ej. AD26-SER-27)
create function public.activity_code_base(p_prefix text, p_name text, p_day date) returns text
language sql immutable as $$
  select p_prefix || '-' ||
    rpad(left(regexp_replace(upper(translate(p_name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z0-9]', '', 'g'), 3), 3, 'X')
    || '-' || to_char(p_day, 'DD');
$$;

create function public.set_activity_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if coalesce(new.code, '') <> '' then
    return new;
  end if;
  select activity_code_base(e.code_prefix, new.name, new.day) into base from events e where e.id = new.event_id;
  candidate := base;
  while exists (select 1 from activities where code = candidate and id <> new.id) loop
    n := n + 1;
    candidate := base || chr(64 + n); -- …-27B, …-27C
  end loop;
  new.code := candidate;
  return new;
end $$;

create trigger activities_code
  before insert on public.activities
  for each row execute function public.set_activity_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- Personas (participantes, ponentes, staff…) y pagos
-- ─────────────────────────────────────────────────────────────────────────────
create table public.people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'Participante' check (role in (
    'Organizador', 'Colaborador', 'Ponente', 'Conferencista', 'Tallerista',
    'Participante', 'Patrocinador', 'Staff')),
  profile text check (profile in ('Estudiante', 'Docente', 'Administrativo', 'Externo', 'Familiar')),
  career text,
  semester integer check (semester between 1 and 12),
  package_id uuid references public.packages (id) on delete set null,
  amount_due numeric(10, 2) not null default 0 check (amount_due >= 0),
  settled_on date,
  source text not null default 'admin' check (source in ('admin', 'public')),
  created_at timestamptz not null default now()
);
create unique index people_event_email_uq on public.people (event_id, lower(email));
create index people_event_idx on public.people (event_id, role);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'Efectivo' check (method in ('Efectivo', 'Transferencia', 'Tarjeta')),
  received_by uuid default auth.uid() references public.profiles (id) on delete set null,
  received_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index payments_person_idx on public.payments (person_id, paid_on);
create index payments_event_idx on public.payments (event_id);

-- Fecha de liquidación: el día del abono con el que el acumulado alcanzó el total
create function public.settlement_date(p_person uuid, p_due numeric) returns date
language sql stable security definer set search_path = public as $$
  select case when p_due <= 0 then null else (
    select paid_on from (
      select paid_on, sum(amount) over (order by paid_on, created_at, id) as acc
      from payments where person_id = p_person
    ) t where acc >= p_due order by paid_on limit 1
  ) end;
$$;

create function public.people_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.role <> 'Participante' then
    new.package_id := null;
    new.amount_due := 0;
  end if;
  if new.profile is distinct from 'Estudiante' then
    new.career := null;
    new.semester := null;
  end if;
  new.settled_on := settlement_date(new.id, new.amount_due);
  return new;
end $$;

create trigger people_before_write
  before insert or update on public.people
  for each row execute function public.people_before_write();

create function public.payments_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := coalesce(new.person_id, old.person_id);
begin
  -- dispara people_before_write para recalcular settled_on
  update people set amount_due = amount_due where id = pid;
  return null;
end $$;

create trigger payments_after_write
  after insert or update or delete on public.payments
  for each row execute function public.payments_after_write();

create function public.payments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from people where id = new.person_id and event_id = new.event_id) then
    raise exception 'PERSON_EVENT_MISMATCH';
  end if;
  if new.received_by_name = '' and auth.uid() is not null then
    select full_name into new.received_by_name from profiles where id = auth.uid();
    new.received_by_name := coalesce(new.received_by_name, '');
  end if;
  return new;
end $$;

create trigger payments_before_insert
  before insert on public.payments
  for each row execute function public.payments_before_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- Inscripción a actividades (con cupo) y asistencia
-- ─────────────────────────────────────────────────────────────────────────────
create table public.enrollments (
  event_id uuid not null references public.events (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null default 'enrolled' check (status in ('enrolled', 'waitlist')),
  created_at timestamptz not null default now(),
  primary key (activity_id, person_id)
);
create index enrollments_person_idx on public.enrollments (person_id);
create index enrollments_event_idx on public.enrollments (event_id);

-- Bloquea la inscripción si la actividad ya alcanzó su cupo.
-- El error ACTIVITY_FULL lo usa la interfaz para mostrar el aviso de cupo lleno.
create function public.enrollments_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  act record;
  taken integer;
begin
  select id, event_id, name, capacity into act from activities where id = new.activity_id for update;
  if act.event_id is distinct from new.event_id
     or not exists (select 1 from people where id = new.person_id and event_id = new.event_id) then
    raise exception 'ENROLLMENT_EVENT_MISMATCH';
  end if;
  if new.status = 'enrolled' and act.capacity is not null
     and (tg_op = 'INSERT' or old.status <> 'enrolled') then
    select count(*) into taken from enrollments
      where activity_id = new.activity_id and status = 'enrolled' and person_id <> new.person_id;
    if taken >= act.capacity then
      raise exception 'ACTIVITY_FULL' using detail = act.id::text, hint = act.name;
    end if;
  end if;
  return new;
end $$;

create trigger enrollments_check
  before insert or update on public.enrollments
  for each row execute function public.enrollments_check();

create table public.attendance (
  event_id uuid not null references public.events (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  method text not null default 'qr' check (method in ('qr', 'manual')),
  marked_by_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (activity_id, person_id)
);
create index attendance_event_idx on public.attendance (event_id);
create index attendance_person_idx on public.attendance (person_id);

create function public.attendance_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from activities where id = new.activity_id and event_id = new.event_id)
     or not exists (select 1 from people where id = new.person_id and event_id = new.event_id) then
    raise exception 'ATTENDANCE_EVENT_MISMATCH';
  end if;
  if new.method = 'manual' and new.marked_by_name = '' and auth.uid() is not null then
    select coalesce(full_name, '') into new.marked_by_name from profiles where id = auth.uid();
  end if;
  return new;
end $$;

create trigger attendance_before_insert
  before insert on public.attendance
  for each row execute function public.attendance_before_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- Constancias
-- ─────────────────────────────────────────────────────────────────────────────
create table public.certificate_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
  body_activity text not null default
    'Por su asistencia al {tipo} {actividad}, impartido por {ponente}, con duración de {duración}, realizado el {fecha} en el marco de {evento}.',
  body_general text not null default
    'Por su participación en {evento}, celebrado del {fechas}, en las siguientes actividades:',
  signers jsonb not null default '[]'::jsonb,
  show_verification boolean not null default true
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete cascade, -- null = constancia general
  folio text not null unique,
  status text not null default 'ready' check (status in ('ready', 'sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index certificates_person_activity_uq
  on public.certificates (person_id, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index certificates_event_idx on public.certificates (event_id);

create trigger events_add_creator
  after insert on public.events
  for each row execute function public.add_event_creator();

-- Emite (o devuelve) las constancias de quienes asistieron. Solo asistentes con registro.
create function public.issue_certificates(p_event uuid, p_activity uuid, p_people uuid[])
returns setof public.certificates
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  act record;
  pid uuid;
  seg text;
  seq integer;
begin
  if not is_event_admin(p_event) then
    raise exception 'FORBIDDEN';
  end if;
  select * into ev from events where id = p_event for update;
  if p_activity is not null then
    select * into act from activities where id = p_activity and event_id = p_event;
    if act.id is null then raise exception 'NOT_FOUND'; end if;
    seg := split_part(act.code, '-', 2);
  else
    seg := 'GEN';
  end if;

  foreach pid in array p_people loop
    if p_activity is not null then
      continue when not exists (select 1 from attendance where activity_id = p_activity and person_id = pid);
    else
      continue when not exists (select 1 from attendance where event_id = p_event and person_id = pid);
    end if;
    if not exists (
      select 1 from certificates c where c.person_id = pid
        and c.activity_id is not distinct from p_activity
    ) then
      update events set cert_seq = cert_seq + 1 where id = p_event returning cert_seq into seq;
      insert into certificates (event_id, person_id, activity_id, folio)
      values (p_event, pid, p_activity, ev.code_prefix || '-' || seg || '-' || lpad(seq::text, 4, '0'));
    end if;
  end loop;

  return query select * from certificates
    where event_id = p_event and activity_id is not distinct from p_activity and person_id = any (p_people);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vistas de agregados (respetan RLS de quien consulta)
-- ─────────────────────────────────────────────────────────────────────────────
create view public.activity_stats with (security_invoker = true) as
select a.id as activity_id, a.event_id,
  (select count(*) from enrollments e where e.activity_id = a.id and e.status = 'enrolled')::int as enrolled,
  (select count(*) from enrollments e where e.activity_id = a.id and e.status = 'waitlist')::int as waitlist,
  (select count(*) from attendance t where t.activity_id = a.id)::int as attended,
  (select count(*) from attendance t join enrollments e
     on e.activity_id = t.activity_id and e.person_id = t.person_id and e.status = 'enrolled'
   where t.activity_id = a.id)::int as attended_enrolled
from activities a;

create view public.person_balances with (security_invoker = true) as
select p.id as person_id, p.event_id,
  coalesce(sum(y.amount), 0)::numeric(10, 2) as paid,
  count(y.id)::int as payments_count,
  max(y.paid_on) as last_paid_on
from people p left join payments y on y.person_id = p.id
group by p.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_days enable row level security;
alter table public.event_admins enable row level security;
alter table public.packages enable row level security;
alter table public.activities enable row level security;
alter table public.activity_packages enable row level security;
alter table public.people enable row level security;
alter table public.payments enable row level security;
alter table public.enrollments enable row level security;
alter table public.attendance enable row level security;
alter table public.certificate_settings enable row level security;
alter table public.certificates enable row level security;

create policy "perfil propio o de coadministradores" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from event_admins a join event_admins b on a.event_id = b.event_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "editar perfil propio" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "ver eventos que administro" on public.events for select to authenticated
  using (owner_id = auth.uid() or is_event_admin(id));
create policy "crear eventos propios" on public.events for insert to authenticated
  with check (owner_id = auth.uid());
create policy "editar con acceso completo" on public.events for update to authenticated
  using (has_full_access(id)) with check (has_full_access(id));
create policy "solo creador elimina" on public.events for delete to authenticated
  using (is_event_creator(id));

create policy "ver administradores" on public.event_admins for select to authenticated
  using (is_event_admin(event_id));
create policy "creador quita administradores" on public.event_admins for delete to authenticated
  using (is_event_creator(event_id) and role <> 'creator');
create policy "creador cambia permisos" on public.event_admins for update to authenticated
  using (is_event_creator(event_id) and role <> 'creator')
  with check (is_event_creator(event_id) and role <> 'creator');

-- Configuración del programa: lectura para cualquier admin, escritura con acceso completo
do $$
declare t text;
begin
  foreach t in array array['event_days', 'packages', 'activities', 'certificate_settings'] loop
    execute format('create policy "leer" on public.%I for select to authenticated using (is_event_admin(event_id))', t);
    execute format('create policy "escribir" on public.%I for all to authenticated using (has_full_access(event_id)) with check (has_full_access(event_id))', t);
  end loop;
  -- Registro, pagos, asistencia y constancias: cualquier admin del evento
  foreach t in array array['people', 'payments', 'enrollments', 'attendance', 'certificates'] loop
    execute format('create policy "admins del evento" on public.%I for all to authenticated using (is_event_admin(event_id)) with check (is_event_admin(event_id))', t);
  end loop;
end $$;

create policy "leer" on public.activity_packages for select to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and is_event_admin(a.event_id)));
create policy "escribir" on public.activity_packages for all to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and has_full_access(a.event_id)))
  with check (exists (
    select 1 from activities a join packages p on p.event_id = a.event_id
    where a.id = activity_id and p.id = package_id and has_full_access(a.event_id)));

-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones públicas (formulario de registro, asistencia por QR, verificación)
-- ─────────────────────────────────────────────────────────────────────────────
create function public.public_activity_json(a public.activities) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'type', a.type, 'name', a.name, 'speaker', a.speaker, 'venue', a.venue,
    'day', a.day, 'starts_at', a.starts_at, 'ends_at', a.ends_at, 'capacity', a.capacity,
    'enrolled', (select count(*) from enrollments e where e.activity_id = a.id and e.status = 'enrolled'),
    'package_ids', coalesce((select jsonb_agg(package_id) from activity_packages where activity_id = a.id), '[]'::jsonb)
  );
$$;

create function public.get_public_event(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ev events;
begin
  select * into ev from events where slug = p_slug and status <> 'draft';
  if ev.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', ev.id, 'slug', ev.slug, 'name', ev.name, 'acronym', ev.acronym, 'organizer', ev.organizer,
    'description', ev.description, 'venue', ev.venue, 'logo_url', ev.logo_url,
    'color_primary', ev.color_primary, 'color_secondary', ev.color_secondary,
    'start_date', ev.start_date, 'end_date', ev.end_date, 'status', ev.status,
    'registration_open', ev.registration_open
      and (ev.registration_closes_at is null or ev.registration_closes_at > now())
      and ev.status = 'active',
    'registration_closes_at', ev.registration_closes_at,
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'starts_at', starts_at, 'ends_at', ends_at) order by day)
      from event_days where event_id = ev.id), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price,
        'description', description, 'includes', includes, 'workshop_limit', workshop_limit) order by sort_order, price)
      from packages where event_id = ev.id), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(public_activity_json(a) order by a.day, a.starts_at, a.name)
      from activities a where a.event_id = ev.id), '[]'::jsonb)
  );
end $$;

create function public.public_register(
  p_slug text, p_person jsonb, p_package_id uuid, p_activity_ids uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev events;
  pkg packages;
  pid uuid;
  aid uuid;
begin
  select * into ev from events where slug = p_slug;
  if ev.id is null or ev.status <> 'active' or not ev.registration_open
     or (ev.registration_closes_at is not null and ev.registration_closes_at <= now()) then
    raise exception 'REGISTRATION_CLOSED';
  end if;
  if p_package_id is not null then
    select * into pkg from packages where id = p_package_id and event_id = ev.id;
    if pkg.id is null then raise exception 'PACKAGE_NOT_FOUND'; end if;
  end if;
  if exists (select 1 from people where event_id = ev.id and lower(email) = lower(trim(p_person ->> 'email'))) then
    raise exception 'ALREADY_REGISTERED';
  end if;

  insert into people (event_id, full_name, email, role, profile, career, semester, package_id, amount_due, source)
  values (
    ev.id, trim(p_person ->> 'full_name'), p_person ->> 'email', 'Participante',
    nullif(p_person ->> 'profile', ''), nullif(p_person ->> 'career', ''),
    nullif(p_person ->> 'semester', '')::int, pkg.id, coalesce(pkg.price, 0), 'public'
  ) returning id into pid;

  if p_activity_ids is not null then
    foreach aid in array p_activity_ids loop
      if pkg.id is not null and not exists (
        select 1 from activity_packages ap join activities a on a.id = ap.activity_id
        where ap.activity_id = aid and ap.package_id = pkg.id and a.event_id = ev.id
      ) then
        raise exception 'ACTIVITY_NOT_IN_PACKAGE';
      end if;
      insert into enrollments (event_id, activity_id, person_id) values (ev.id, aid, pid);
    end loop;
  end if;

  return jsonb_build_object('person_id', pid, 'amount_due', coalesce(pkg.price, 0));
end $$;

create function public.get_checkin_activity(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', a.code, 'type', a.type, 'name', a.name, 'speaker', a.speaker, 'venue', a.venue,
    'day', a.day, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'event_name', e.name, 'acronym', e.acronym, 'color_primary', e.color_primary, 'logo_url', e.logo_url
  )
  from activities a join events e on e.id = a.event_id
  where a.code = upper(trim(p_code));
$$;

create function public.checkin(p_code text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  act activities;
  ev events;
  per people;
  local_now timestamp;
  is_enrolled boolean;
  existing attendance;
begin
  select * into act from activities where code = upper(trim(p_code));
  if act.id is null then raise exception 'NOT_FOUND'; end if;
  select * into ev from events where id = act.event_id;
  local_now := now() at time zone ev.timezone;

  if not act.qr_enabled or ev.status = 'draft'
     or (act.qr_from is not null and (local_now::date <> act.day or local_now::time < act.qr_from))
     or (act.qr_to is not null and (local_now::date <> act.day or local_now::time > act.qr_to)) then
    raise exception 'QR_INACTIVE';
  end if;

  select * into per from people where event_id = act.event_id and lower(email) = lower(trim(p_email));
  if per.id is null then raise exception 'NOT_REGISTERED'; end if;

  is_enrolled := exists (select 1 from enrollments where activity_id = act.id and person_id = per.id and status = 'enrolled');
  if act.only_registered and not is_enrolled then raise exception 'NOT_ENROLLED'; end if;

  select * into existing from attendance where activity_id = act.id and person_id = per.id;
  if existing.person_id is null then
    insert into attendance (event_id, activity_id, person_id, method)
    values (act.event_id, act.id, per.id, 'qr') returning * into existing;
  end if;

  return jsonb_build_object(
    'full_name', per.full_name,
    'at', existing.created_at,
    'local_time', to_char(existing.created_at at time zone ev.timezone, 'HH24:MI'),
    'enrolled', is_enrolled
  );
end $$;

create function public.verify_certificate(p_folio text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'folio', c.folio, 'status', c.status, 'issued_at', c.created_at,
    'person', jsonb_build_object('full_name', p.full_name),
    'event', jsonb_build_object('name', e.name, 'acronym', e.acronym, 'organizer', e.organizer,
      'logo_url', e.logo_url, 'color_primary', e.color_primary, 'start_date', e.start_date, 'end_date', e.end_date),
    'activity', case when a.id is null then null else jsonb_build_object(
      'type', a.type, 'name', a.name, 'speaker', a.speaker, 'day', a.day,
      'starts_at', a.starts_at, 'ends_at', a.ends_at) end,
    'attended', case when a.id is not null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('type', x.type, 'name', x.name, 'day', x.day,
        'starts_at', x.starts_at, 'ends_at', x.ends_at) order by x.day, x.starts_at), '[]'::jsonb)
      from attendance t join activities x on x.id = t.activity_id where t.person_id = p.id) end,
    'settings', jsonb_build_object('body_activity', s.body_activity, 'body_general', s.body_general,
      'signers', s.signers, 'show_verification', s.show_verification)
  )
  from certificates c
  join people p on p.id = c.person_id
  join events e on e.id = c.event_id
  left join activities a on a.id = c.activity_id
  left join certificate_settings s on s.event_id = c.event_id
  where c.folio = upper(trim(p_folio));
$$;

revoke execute on function public.get_public_event(text), public.public_register(text, jsonb, uuid, uuid[]),
  public.get_checkin_activity(text), public.checkin(text, text), public.verify_certificate(text) from public;
grant execute on function public.get_public_event(text), public.public_register(text, jsonb, uuid, uuid[]),
  public.get_checkin_activity(text), public.checkin(text, text), public.verify_certificate(text) to anon, authenticated;
revoke execute on function public.issue_certificates(uuid, uuid, uuid[]), public.touch_event_access(uuid) from public, anon;
grant execute on function public.issue_certificates(uuid, uuid, uuid[]), public.touch_event_access(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Almacenamiento: logos y firmas (bucket público de lectura, escritura por admins)
-- Ruta: <event_id>/logo.png · <event_id>/firmas/<archivo>
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('event-assets', 'event-assets', true)
  on conflict (id) do nothing;

create policy "admins suben archivos del evento" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and has_full_access(((storage.foldername(name))[1])::uuid));
create policy "admins actualizan archivos del evento" on storage.objects for update to authenticated
  using (bucket_id = 'event-assets' and has_full_access(((storage.foldername(name))[1])::uuid));
create policy "admins borran archivos del evento" on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and has_full_access(((storage.foldername(name))[1])::uuid));
