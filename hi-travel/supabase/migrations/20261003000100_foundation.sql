-- =====================================================================
-- HI Travel — Phase 1 · Fondations : rôles, permissions, audit, numérotation
-- Montants : numeric(14,3) (TND, 3 décimales). Dates : timestamptz.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Énumérations transverses
-- ---------------------------------------------------------------------
create type public.app_role as enum ('direction', 'commercial', 'operations', 'finance', 'site');

create type public.perm_action as enum ('read', 'create', 'update', 'export', 'validate', 'archive');

-- Les neuf modules métiers (Omra = catégorie de programme, pas un module)
create type public.activity as enum (
  'hotel_tn', 'hotel_intl', 'tailor_made', 'organized_trip',
  'visa', 'ticketing', 'circuit', 'transport', 'mice'
);

-- ---------------------------------------------------------------------
-- Profils collaborateurs et matrice de droits configurable
-- ---------------------------------------------------------------------
create table public.staff_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        public.app_role not null,
  backup_id   uuid references public.staff_profiles (id),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.staff_profiles is 'Comptes individuels des collaborateurs HI Travel.';

create table public.role_permissions (
  role    public.app_role not null,
  module  text not null,
  action  public.perm_action not null,
  primary key (role, module, action)
);
comment on table public.role_permissions is
  'Permissions par module et par action (lire, créer, modifier, exporter, valider, archiver).';

-- Rôle du collaborateur connecté (null si client ou anonyme)
create or replace function public.current_staff_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.staff_profiles where id = auth.uid() and active
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.staff_profiles where id = auth.uid() and active)
$$;

create or replace function public.has_perm(p_module text, p_action public.perm_action)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles s
    join public.role_permissions rp on rp.role = s.role
    where s.id = auth.uid() and s.active
      and rp.module = p_module and rp.action = p_action
  )
$$;

-- Contrôle serveur utilisé par toutes les fonctions métier
create or replace function public.require_perm(p_module text, p_action public.perm_action)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  -- Le rôle service (traitements serveur internes, webhooks) est autorisé
  if coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return;
  end if;
  if not public.has_perm(p_module, p_action) then
    raise exception 'Accès refusé : %.%', p_module, p_action using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Journal d'audit : auteur, date, ancienne valeur, nouvelle valeur, justification
-- La justification est transmise par `set_config('app.change_reason', ..., true)`.
-- ---------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    uuid,
  action       text not null,
  changed      jsonb,
  old_values   jsonb,
  new_values   jsonb,
  reason       text,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_id, created_at desc);

create or replace function public.tg_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed jsonb;
  v_ignored text[] := coalesce(tg_argv::text[], '{}');
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('old', v_old -> key, 'new', value))
      into v_changed
      from jsonb_each(v_new)
     where (v_old -> key) is distinct from value
       and key <> 'updated_at'
       and not key = any (v_ignored);
    if v_changed is null then
      return new;
    end if;
  end if;

  -- Masquage des données sensibles dans le journal
  v_old := v_old - 'passport_number';
  v_new := v_new - 'passport_number';

  insert into public.audit_log (table_name, record_id, action, changed, old_values, new_values, reason, actor_id)
  values (
    tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    lower(tg_op),
    v_changed,
    v_old,
    v_new,
    nullif(current_setting('app.change_reason', true), ''),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Séries de numérotation paramétrables (devis, dossiers, factures, avoirs…)
-- ---------------------------------------------------------------------
create table public.number_series (
  code        text primary key,
  prefix      text not null,
  per_year    boolean not null default true,
  padding     int not null default 5,
  label       text not null
);

create table public.number_counters (
  code    text not null references public.number_series (code),
  year    int not null,
  value   int not null default 0,
  primary key (code, year)
);

create or replace function public.next_number(p_code text, p_date date default current_date)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_series public.number_series;
  v_year int := case when p_date is null then extract(year from current_date)::int else extract(year from p_date)::int end;
  v_value int;
begin
  select * into v_series from public.number_series where code = p_code;
  if not found then
    raise exception 'Série de numérotation inconnue : %', p_code;
  end if;
  if not v_series.per_year then
    v_year := 0;
  end if;
  insert into public.number_counters (code, year, value) values (p_code, v_year, 1)
  on conflict (code, year) do update set value = public.number_counters.value + 1
  returning value into v_value;

  return v_series.prefix
    || case when v_series.per_year then '-' || v_year::text else '' end
    || '-' || lpad(v_value::text, v_series.padding, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Paramètres applicatifs (seuils, coordonnées, règles) avec historique via audit
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,
  updated_at  timestamptz not null default now()
);
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.tg_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS fondations
-- ---------------------------------------------------------------------
alter table public.staff_profiles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.number_series enable row level security;
alter table public.number_counters enable row level security;
alter table public.app_settings enable row level security;

create policy staff_profiles_read on public.staff_profiles
  for select to authenticated using (public.is_staff());
create policy staff_profiles_admin on public.staff_profiles
  for all to authenticated using (public.has_perm('settings', 'update'))
  with check (public.has_perm('settings', 'update'));

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (public.is_staff());
create policy role_permissions_admin on public.role_permissions
  for all to authenticated using (public.has_perm('settings', 'update'))
  with check (public.has_perm('settings', 'update'));

create policy audit_log_read on public.audit_log
  for select to authenticated using (public.has_perm('reports', 'read'));

create policy number_series_read on public.number_series
  for select to authenticated using (public.is_staff());
create policy number_series_admin on public.number_series
  for all to authenticated using (public.has_perm('settings', 'update'))
  with check (public.has_perm('settings', 'update'));

create policy app_settings_public on public.app_settings
  for select to anon, authenticated using (is_public or public.is_staff());
create policy app_settings_admin on public.app_settings
  for all to authenticated using (public.has_perm('settings', 'update'))
  with check (public.has_perm('settings', 'update'));

create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.tg_audit();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function public.tg_audit();
