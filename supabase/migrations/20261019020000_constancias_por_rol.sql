-- Constancias de participación por rol (organizadores, colaboradores, staff, talleristas,
-- conferencistas, ponentes, patrocinadores y participantes), además de las de asistencia.

alter table public.certificates
  add column if not exists kind text not null default 'attendance' check (kind in ('attendance', 'role'));

drop index if exists public.certificates_person_activity_uq;
create unique index if not exists certificates_person_kind_activity_uq
  on public.certificates (person_id, kind, coalesce(activity_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.certificate_settings
  add column if not exists body_role text not null default
    'Por su valiosa participación como {rol} en {evento}, celebrado del {fechas}.';

-- issue_certificates ahora recibe el tipo: 'attendance' (requiere asistencia) o 'role' (por su rol)
drop function if exists public.issue_certificates(uuid, uuid, uuid[]);

create function public.issue_certificates(p_event uuid, p_activity uuid, p_people uuid[], p_kind text default 'attendance')
returns setof public.certificates
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  act record;
  per record;
  pid uuid;
  seg text;
  seq integer;
begin
  if not is_event_admin(p_event) then
    raise exception 'FORBIDDEN';
  end if;
  if p_kind not in ('attendance', 'role') then
    raise exception 'INVALID_KIND';
  end if;
  select * into ev from events where id = p_event for update;
  if p_kind = 'attendance' and p_activity is not null then
    select * into act from activities where id = p_activity and event_id = p_event;
    if act.id is null then raise exception 'NOT_FOUND'; end if;
  end if;

  foreach pid in array p_people loop
    select * into per from people where id = pid and event_id = p_event;
    continue when per.id is null;
    if p_kind = 'attendance' then
      if p_activity is not null then
        continue when not exists (select 1 from attendance where activity_id = p_activity and person_id = pid);
        seg := split_part(act.code, '-', 2);
      else
        continue when not exists (select 1 from attendance where event_id = p_event and person_id = pid);
        seg := 'GEN';
      end if;
    else
      seg := rpad(left(upper(translate(per.role, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')), 3), 3, 'X');
    end if;
    if not exists (
      select 1 from certificates c
      where c.person_id = pid and c.kind = p_kind
        and c.activity_id is not distinct from (case when p_kind = 'attendance' then p_activity end)
    ) then
      update events set cert_seq = cert_seq + 1 where id = p_event returning cert_seq into seq;
      insert into certificates (event_id, person_id, activity_id, kind, folio)
      values (p_event, pid, case when p_kind = 'attendance' then p_activity end, p_kind,
              ev.code_prefix || '-' || seg || '-' || lpad(seq::text, 4, '0'));
    end if;
  end loop;

  return query select * from certificates c
    where c.event_id = p_event and c.kind = p_kind and c.person_id = any (p_people)
      and c.activity_id is not distinct from (case when p_kind = 'attendance' then p_activity end);
end $$;

revoke execute on function public.issue_certificates(uuid, uuid, uuid[], text) from public, anon;
grant execute on function public.issue_certificates(uuid, uuid, uuid[], text) to authenticated;

-- Verificación pública: incluye tipo, rol y actividades impartidas (por nombre del ponente)
create or replace function public.verify_certificate(p_folio text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'folio', c.folio, 'status', c.status, 'issued_at', c.created_at, 'kind', c.kind,
    'person', jsonb_build_object('full_name', p.full_name, 'role', p.role),
    'event', jsonb_build_object('name', e.name, 'acronym', e.acronym, 'organizer', e.organizer,
      'logo_url', e.logo_url, 'color_primary', e.color_primary, 'start_date', e.start_date, 'end_date', e.end_date),
    'activity', case when a.id is null then null else jsonb_build_object(
      'type', a.type, 'name', a.name, 'speaker', a.speaker, 'day', a.day,
      'starts_at', a.starts_at, 'ends_at', a.ends_at) end,
    'attended', case when c.kind <> 'attendance' or a.id is not null then null else (
      select coalesce(jsonb_agg(jsonb_build_object('type', x.type, 'name', x.name, 'day', x.day,
        'starts_at', x.starts_at, 'ends_at', x.ends_at) order by x.day, x.starts_at), '[]'::jsonb)
      from attendance t join activities x on x.id = t.activity_id where t.person_id = p.id) end,
    'given', case when c.kind <> 'role' then null else (
      select coalesce(jsonb_agg(jsonb_build_object('type', x.type, 'name', x.name, 'day', x.day,
        'starts_at', x.starts_at, 'ends_at', x.ends_at) order by x.day, x.starts_at), '[]'::jsonb)
      from activities x where x.event_id = c.event_id and x.speaker <> ''
        and lower(x.speaker) like '%' || lower(p.full_name) || '%') end,
    'settings', jsonb_build_object('body_activity', s.body_activity, 'body_general', s.body_general,
      'body_role', s.body_role, 'signers', s.signers, 'show_verification', s.show_verification)
  )
  from certificates c
  join people p on p.id = c.person_id
  join events e on e.id = c.event_id
  left join activities a on a.id = c.activity_id
  left join certificate_settings s on s.event_id = c.event_id
  where c.folio = upper(trim(p_folio));
$$;
