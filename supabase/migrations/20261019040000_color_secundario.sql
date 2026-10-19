-- El color secundario (acento) también llega a la página de asistencia por QR y a la verificación de constancias.

create or replace function public.get_checkin_activity(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', a.code, 'type', a.type, 'name', a.name, 'speaker', a.speaker, 'venue', a.venue,
    'day', a.day, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
    'event_name', e.name, 'acronym', e.acronym, 'color_primary', e.color_primary, 'color_secondary', e.color_secondary, 'logo_url', e.logo_url
  )
  from activities a join events e on e.id = a.event_id
  where a.code = upper(trim(p_code));
$$;

create or replace function public.verify_certificate(p_folio text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'folio', c.folio, 'status', c.status, 'issued_at', c.created_at, 'kind', c.kind,
    'person', jsonb_build_object('full_name', p.full_name, 'role', p.role),
    'event', jsonb_build_object('name', e.name, 'acronym', e.acronym, 'organizer', e.organizer,
      'logo_url', e.logo_url, 'color_primary', e.color_primary, 'color_secondary', e.color_secondary, 'start_date', e.start_date, 'end_date', e.end_date),
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
    'settings', coalesce(to_jsonb(s) - 'event_id', '{}'::jsonb)
  )
  from certificates c
  join people p on p.id = c.person_id
  join events e on e.id = c.event_id
  left join activities a on a.id = c.activity_id
  left join certificate_settings s on s.event_id = c.event_id
  where c.folio = upper(trim(p_folio));
$$;
