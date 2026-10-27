-- Entrega del kit de bienvenida: fecha en que se entregó (null = pendiente)
alter table public.people add column if not exists kit_delivered_on date;
