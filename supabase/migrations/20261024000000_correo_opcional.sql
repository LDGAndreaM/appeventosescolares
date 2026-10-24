-- El correo de las personas pasa a ser opcional y puede repetirse dentro del evento
-- (p. ej. listas importadas donde varias personas comparten un correo genérico).
-- El registro público sigue rechazando un correo que ya esté registrado.

drop index if exists public.people_event_email_uq;
create index if not exists people_event_email_idx on public.people (event_id, lower(email));

alter table public.people alter column email drop not null;

create or replace function public.people_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
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

-- Asistencia por QR: si varias personas comparten el correo, se prefiere la inscrita en la actividad
create or replace function public.checkin(p_code text, p_email text) returns jsonb
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

  select p.* into per from people p
  where p.event_id = act.event_id and lower(p.email) = lower(trim(p_email))
  order by exists (select 1 from enrollments e where e.activity_id = act.id and e.person_id = p.id and e.status = 'enrolled') desc,
           p.created_at
  limit 1;
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
