-- =====================================================================
-- CRM : clients, entreprises, contacts, voyageurs, demandes, échanges
-- Chaîne : client/entreprise → contacts et voyageurs → demande → devis → dossier
-- =====================================================================

create type public.client_kind as enum ('person', 'company');
create type public.lead_stage as enum ('received', 'qualification', 'quote', 'follow_up', 'won', 'lost');
create type public.lead_source as enum ('website', 'phone', 'walk_in', 'email', 'whatsapp', 'social', 'referral', 'import', 'other');

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  kind              public.client_kind not null default 'person',
  first_name        text,
  last_name         text,
  company_name      text,
  tax_id            text,
  email             text,
  phone             text,
  address           text,
  city              text,
  country           text default 'TN',
  language          text not null default 'fr' check (language in ('fr', 'en', 'ar')),
  source            public.lead_source not null default 'other',
  commercial_terms  text,
  consents          jsonb not null default '{}'::jsonb,
  notes             text,
  owner_id          uuid references public.staff_profiles (id),
  merged_into_id    uuid references public.clients (id),
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint clients_identity_chk check (
    (kind = 'person' and coalesce(last_name, first_name) is not null)
    or (kind = 'company' and company_name is not null)
  )
);
alter table public.clients add column display_name text generated always as (
  case when kind = 'company' then company_name
       else trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) end
) stored;
create index clients_email_idx on public.clients (lower(email));
create index clients_phone_idx on public.clients (regexp_replace(coalesce(phone, ''), '\D', '', 'g'));
create index clients_name_idx on public.clients (lower(display_name));

create table public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  full_name   text not null,
  role        text,
  email       text,
  phone       text,
  is_decision_maker boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Voyageurs : distincts du contact payeur
create table public.travellers (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients (id) on delete set null,
  first_name    text not null,
  last_name     text not null,
  birth_date    date,
  gender        text,
  nationality   text,
  pax_type      text not null default 'adult' check (pax_type in ('adult', 'child', 'infant')),
  email         text,
  phone         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pièces d'identité : données sensibles, accès restreint (module « identity »)
create table public.traveller_identity_documents (
  id               uuid primary key default gen_random_uuid(),
  traveller_id     uuid not null references public.travellers (id) on delete cascade,
  doc_type         text not null default 'passport' check (doc_type in ('passport', 'national_id', 'other')),
  passport_number  text not null,
  issuing_country  text,
  issue_date       date,
  expiry_date      date,
  created_at       timestamptz not null default now()
);

-- Demandes commerciales (pipeline configurable)
create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique default public.next_number('LEAD'),
  client_id         uuid references public.clients (id),
  activity          public.activity not null,
  stage             public.lead_stage not null default 'received',
  source            public.lead_source not null default 'other',
  owner_id          uuid references public.staff_profiles (id),
  offer_id          uuid,
  departure_id      uuid,
  destination       text,
  date_from         date,
  date_to           date,
  flexible_dates    boolean not null default false,
  adults            int not null default 1 check (adults >= 0),
  children          int not null default 0 check (children >= 0),
  children_ages     int[] not null default '{}',
  budget            numeric(14,3),
  currency          char(3) not null default 'TND',
  message           text,
  details           jsonb not null default '{}'::jsonb,
  contact_snapshot  jsonb not null default '{}'::jsonb,
  possible_duplicate_client_ids uuid[] not null default '{}',
  marketing_consent boolean not null default false,
  processing_consent boolean not null default false,
  submission_token  text unique,
  lost_reason       text,
  next_action       text,
  next_action_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index leads_stage_idx on public.leads (stage, owner_id);

create table public.interactions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients (id) on delete cascade,
  lead_id     uuid references public.leads (id) on delete cascade,
  dossier_id  uuid,
  channel     text not null default 'note' check (channel in ('note', 'phone', 'email', 'whatsapp', 'meeting', 'site')),
  direction   text check (direction in ('in', 'out')),
  summary     text not null,
  author_id   uuid references public.staff_profiles (id) default auth.uid(),
  occurred_at timestamptz not null default now()
);

-- Règle d'affectation des demandes du site par activité (sinon file « à attribuer »)
create table public.lead_assignment_rules (
  activity   public.activity primary key,
  owner_id   uuid references public.staff_profiles (id)
);

-- ---------------------------------------------------------------------
-- Détection de doublons avant création (aucune fusion aveugle)
-- ---------------------------------------------------------------------
create or replace function public.find_client_duplicates(p_email text, p_phone text, p_name text default null)
returns table (id uuid, display_name text, email text, phone text, match_reason text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.display_name, c.email, c.phone,
         concat_ws(', ',
           case when p_email is not null and lower(c.email) = lower(p_email) then 'e-mail identique' end,
           case when nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
                 and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
                then 'téléphone identique' end,
           case when p_name is not null and lower(c.display_name) = lower(p_name) then 'nom identique' end
         ) as match_reason
  from public.clients c
  where c.merged_into_id is null
    and (
      (p_email is not null and lower(c.email) = lower(p_email))
      or (nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
          and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8))
      or (p_name is not null and lower(c.display_name) = lower(p_name))
    )
  limit 10
$$;

-- Fusion contrôlée : conserve historique et liens
create or replace function public.merge_clients(p_keep uuid, p_merge uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_perm('crm', 'validate');
  if p_keep = p_merge then
    raise exception 'Impossible de fusionner un client avec lui-même';
  end if;
  perform set_config('app.change_reason', coalesce(p_reason, 'fusion de clients'), true);
  update public.leads set client_id = p_keep where client_id = p_merge;
  update public.travellers set client_id = p_keep where client_id = p_merge;
  update public.interactions set client_id = p_keep where client_id = p_merge;
  update public.client_contacts set client_id = p_keep where client_id = p_merge;
  update public.clients set merged_into_id = p_keep, archived_at = now() where id = p_merge;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger clients_touch before update on public.clients for each row execute function public.tg_touch_updated_at();
create trigger travellers_touch before update on public.travellers for each row execute function public.tg_touch_updated_at();
create trigger leads_touch before update on public.leads for each row execute function public.tg_touch_updated_at();
create trigger clients_audit after insert or update or delete on public.clients for each row execute function public.tg_audit();
create trigger travellers_audit after insert or update or delete on public.travellers for each row execute function public.tg_audit();
create trigger leads_audit after insert or update or delete on public.leads for each row execute function public.tg_audit();
create trigger identity_audit after insert or update or delete on public.traveller_identity_documents for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.travellers enable row level security;
alter table public.traveller_identity_documents enable row level security;
alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.lead_assignment_rules enable row level security;

create policy clients_select on public.clients for select to authenticated using (public.has_perm('crm', 'read'));
create policy clients_insert on public.clients for insert to authenticated with check (public.has_perm('crm', 'create'));
create policy clients_update on public.clients for update to authenticated using (public.has_perm('crm', 'update')) with check (public.has_perm('crm', 'update'));

create policy contacts_select on public.client_contacts for select to authenticated using (public.has_perm('crm', 'read'));
create policy contacts_write on public.client_contacts for all to authenticated using (public.has_perm('crm', 'update')) with check (public.has_perm('crm', 'update'));

create policy travellers_select on public.travellers for select to authenticated using (public.has_perm('crm', 'read') or public.has_perm('dossiers', 'read'));
create policy travellers_insert on public.travellers for insert to authenticated with check (public.has_perm('crm', 'create') or public.has_perm('dossiers', 'create'));
create policy travellers_update on public.travellers for update to authenticated using (public.has_perm('crm', 'update') or public.has_perm('dossiers', 'update')) with check (true);

-- Passeports : rôles autorisés uniquement, y compris en accès direct (REC06)
create policy identity_select on public.traveller_identity_documents for select to authenticated using (public.has_perm('identity', 'read'));
create policy identity_write on public.traveller_identity_documents for all to authenticated using (public.has_perm('identity', 'update')) with check (public.has_perm('identity', 'update'));

create policy leads_select on public.leads for select to authenticated using (public.has_perm('crm', 'read'));
create policy leads_insert on public.leads for insert to authenticated with check (public.has_perm('crm', 'create'));
create policy leads_update on public.leads for update to authenticated using (public.has_perm('crm', 'update')) with check (public.has_perm('crm', 'update'));

create policy interactions_select on public.interactions for select to authenticated using (public.has_perm('crm', 'read'));
create policy interactions_insert on public.interactions for insert to authenticated with check (public.has_perm('crm', 'create') or public.has_perm('dossiers', 'update'));

create policy lead_rules_select on public.lead_assignment_rules for select to authenticated using (public.is_staff());
create policy lead_rules_admin on public.lead_assignment_rules for all to authenticated using (public.has_perm('settings', 'update')) with check (public.has_perm('settings', 'update'));
