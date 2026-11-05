-- Actividades sin registro previo: el QR pide nombre completo y correo y, si la persona
-- no está en el evento, la registra como participante al marcar su asistencia.

alter table public.activities add column if not exists requires_registration boolean not null default true;

-- origen «qr»: personas registradas desde el QR de asistencia
alter table public.people drop constraint if exists people_source_check;
alter table public.people add constraint people_source_check check (source in ('admin', 'public', 'qr'));

create or replace function public.get_checkin_activity(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', a.code, 'type', a.type, 'name', a.name, 'speaker', a.speaker, 'venue', a.venue,
    'day', a.day, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'requires_registration', a.requires_registration,
    'event_name', e.name, 'acronym', e.acronym, 'color_primary', e.color_primary, 'color_secondary', e.color_secondary, 'logo_url', e.logo_url
  )
  from activities a join events e on e.id = a.event_id
  where a.code = upper(trim(p_code));
$$;

drop function if exists public.checkin(text, text);

create function public.checkin(p_code text, p_email text, p_full_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  act activities;
  ev events;
  per people;
  local_now timestamp;
  is_enrolled boolean;
  is_new boolean := false;
  existing attendance;
  clean_email text := lower(trim(p_email));
  clean_name text := nullif(regexp_replace(trim(coalesce(p_full_name, '')), '\s+', ' ', 'g'), '');
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

  if clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL'; end if;

  -- si varias personas comparten el correo, se prefiere la inscrita en la actividad
  select p.* into per from people p
  where p.event_id = act.event_id and lower(p.email) = clean_email
  order by exists (select 1 from enrollments e where e.activity_id = act.id and e.person_id = p.id and e.status = 'enrolled') desc,
           p.created_at
  limit 1;

  if per.id is null then
    if act.requires_registration then raise exception 'NOT_REGISTERED'; end if;
    if clean_name is null then raise exception 'NAME_REQUIRED'; end if;
    insert into people (event_id, full_name, email, role, source)
    values (act.event_id, clean_name, clean_email, 'Participante', 'qr')
    returning * into per;
    is_new := true;
  end if;

  is_enrolled := exists (select 1 from enrollments where activity_id = act.id and person_id = per.id and status = 'enrolled');
  if act.requires_registration and act.only_registered and not is_enrolled then raise exception 'NOT_ENROLLED'; end if;

  select * into existing from attendance where activity_id = act.id and person_id = per.id;
  if existing.person_id is null then
    insert into attendance (event_id, activity_id, person_id, method)
    values (act.event_id, act.id, per.id, 'qr') returning * into existing;
  end if;

  return jsonb_build_object(
    'full_name', per.full_name,
    'at', existing.created_at,
    'local_time', to_char(existing.created_at at time zone ev.timezone, 'HH24:MI'),
    'enrolled', is_enrolled,
    'new', is_new
  );
end $$;

revoke execute on function public.checkin(text, text, text) from public;
grant execute on function public.checkin(text, text, text) to anon, authenticated;
