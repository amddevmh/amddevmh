-- =====================================================================
-- Référentiels et catalogue : fournisseurs, hôtels, offres, départs, site
-- =====================================================================

create type public.supplier_kind as enum (
  'hotel', 'hotel_platform', 'airline', 'ticketing_platform', 'transport', 'guide',
  'restaurant', 'venue', 'event_service', 'visa_center', 'insurance', 'other'
);

create table public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          public.supplier_kind not null default 'other',
  country       text default 'TN',
  city          text,
  currency      char(3) not null default 'TND',
  tax_id        text,
  email         text,
  phone         text,
  contacts      jsonb not null default '[]'::jsonb,
  destinations  text[] not null default '{}',
  conditions    text,
  payment_terms text,
  withholding_applicable boolean not null default false,
  account_code  text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.supplier_contracts (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers (id) on delete cascade,
  title         text not null,
  valid_from    date,
  valid_to      date,
  currency      char(3) not null default 'TND',
  terms         jsonb not null default '{}'::jsonb,
  child_rules   text,
  free_places   text,
  penalties     text,
  document_id   uuid,
  created_at    timestamptz not null default now()
);

-- Référentiel hôtels (Tunisie et étranger) et correspondance avec les API fournisseurs
create table public.hotels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  country      text not null default 'TN',
  city         text not null,
  category     int check (category between 1 and 5),
  address      text,
  supplier_id  uuid references public.suppliers (id),
  room_types   text[] not null default '{}',
  boards       text[] not null default '{}',
  child_rules  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.hotel_rates (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,
  season        text not null,
  valid_from    date not null,
  valid_to      date not null,
  room_type     text not null,
  board         text not null,
  rate_kind     text not null default 'contract' check (rate_kind in ('contract', 'spot')),
  price_per_night numeric(14,3) not null check (price_per_night >= 0),
  single_supplement numeric(14,3) not null default 0,
  child_discount_pct numeric(5,2) not null default 0,
  currency      char(3) not null default 'TND',
  check (valid_to >= valid_from)
);

create table public.hotel_mappings (
  id                 uuid primary key default gen_random_uuid(),
  hotel_id           uuid not null references public.hotels (id) on delete cascade,
  provider           text not null,
  provider_hotel_code text not null,
  provider_hotel_name text,
  status             text not null default 'validated' check (status in ('proposed', 'validated', 'rejected')),
  validated_by       uuid references public.staff_profiles (id),
  created_at         timestamptz not null default now(),
  unique (provider, provider_hotel_code)
);

-- ---------------------------------------------------------------------
-- Offres (modèle de voyage) et départs datés
-- ---------------------------------------------------------------------
create type public.publication_status as enum ('draft', 'review', 'published', 'hidden', 'archived');
create type public.price_basis as enum ('per_person', 'total', 'from');

create table public.offers (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title             text not null,
  activity          public.activity not null,
  is_omra           boolean not null default false,
  destination       text not null,
  country           text,
  duration_days     int check (duration_days > 0),
  nights            int check (nights >= 0),
  summary           text,
  program           jsonb not null default '[]'::jsonb,   -- [{day, title, description}]
  hotels            jsonb not null default '[]'::jsonb,   -- [{name, city, nights, board}]
  board             text,
  indicative_flights text,
  inclusions        text[] not null default '{}',
  exclusions        text[] not null default '{}',
  conditions        text,
  photos            jsonb not null default '[]'::jsonb,   -- [{url, alt}]
  price_amount      numeric(14,3),
  price_basis       public.price_basis not null default 'from',
  occupancy_basis   text,
  deposit_amount    numeric(14,3),
  currency          char(3) not null default 'TND',
  cta_label         text not null default 'Demander un devis',
  featured          boolean not null default false,
  sort_order        int not null default 0,
  status            public.publication_status not null default 'draft',
  publish_at        timestamptz,
  unpublish_at      timestamptz,
  published_by      uuid references public.staff_profiles (id),
  seo_title         text,
  seo_description   text,
  -- Note interne : jamais exposée au site public (coûts dans offer_costings)
  internal_notes    text,
  owner_id          uuid references public.staff_profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Coûts estimés d'une offre : invisibles pour le profil « gestion du site »
create table public.offer_costings (
  offer_id        uuid primary key references public.offers (id) on delete cascade,
  estimated_cost  numeric(14,3),
  target_margin_pct numeric(5,2),
  notes           text,
  updated_at      timestamptz not null default now()
);

create type public.departure_status as enum ('open', 'closed', 'cancelled');

create table public.departures (
  id                 uuid primary key default gen_random_uuid(),
  offer_id           uuid not null references public.offers (id) on delete cascade,
  code               text not null unique,
  start_date         date not null,
  end_date           date not null,
  capacity           int not null check (capacity >= 0),
  seats_confirmed    int not null default 0,
  seats_on_option    int not null default 0,
  allotments         jsonb not null default '[]'::jsonb,   -- [{supplier_id, kind, quantity, release_date}]
  price_adult        numeric(14,3),
  price_child        numeric(14,3),
  price_infant       numeric(14,3),
  single_supplement  numeric(14,3),
  deposit_amount     numeric(14,3),
  currency           char(3) not null default 'TND',
  booking_deadline   date,
  supplier_option_deadline date,
  option_hold_hours  int not null default 72 check (option_hold_hours > 0),
  min_participants   int,
  guide_notes        text,
  status             public.departure_status not null default 'open',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date >= start_date),
  -- Garde-fou ultime contre la survente (REC03)
  constraint departures_capacity_chk check (
    seats_confirmed >= 0 and seats_on_option >= 0 and seats_confirmed + seats_on_option <= capacity
  )
);
create index departures_offer_idx on public.departures (offer_id, start_date);

alter table public.leads
  add constraint leads_offer_fk foreign key (offer_id) references public.offers (id),
  add constraint leads_departure_fk foreign key (departure_id) references public.departures (id);

-- ---------------------------------------------------------------------
-- Contenus du site : pages, redirections
-- ---------------------------------------------------------------------
create table public.site_pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  body            text not null default '',
  seo_title       text,
  seo_description text,
  status          public.publication_status not null default 'draft',
  updated_at      timestamptz not null default now()
);

create table public.site_redirects (
  from_path   text primary key,
  to_path     text not null,
  permanent   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Une offre est publique si publiée et dans sa fenêtre de publication
create or replace function public.offer_is_public(o public.offers)
returns boolean
language sql stable
as $$
  select o.status = 'published'
     and (o.publish_at is null or o.publish_at <= now())
     and (o.unpublish_at is null or o.unpublish_at > now())
$$;

-- Validation de publication : seul un profil habilité publie (FO02)
create or replace function public.tg_offers_publication()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if not (coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')
            or public.has_perm('site', 'validate')) then
      raise exception 'Publication réservée à un utilisateur habilité' using errcode = '42501';
    end if;
    new.published_by := coalesce(auth.uid(), new.published_by);
    if new.price_amount is null then
      raise exception 'Une offre publiée doit avoir un prix affiché';
    end if;
  end if;
  return new;
end;
$$;
create trigger offers_publication before insert or update on public.offers
  for each row execute function public.tg_offers_publication();

-- ---------------------------------------------------------------------
-- Vues publiques : uniquement des colonnes sûres (aucun coût, marge, note interne)
-- ---------------------------------------------------------------------
create view public.site_offers
with (security_barrier = true)
as
select o.id, o.slug, o.title, o.activity, o.is_omra, o.destination, o.country,
       o.duration_days, o.nights, o.summary, o.program, o.hotels, o.board,
       o.indicative_flights, o.inclusions, o.exclusions, o.conditions, o.photos,
       o.price_amount, o.price_basis, o.occupancy_basis, o.deposit_amount, o.currency,
       o.cta_label, o.featured, o.sort_order, o.seo_title, o.seo_description, o.updated_at,
       (select min(d.start_date) from public.departures d
         where d.offer_id = o.id and d.status = 'open' and d.start_date > current_date) as next_departure
from public.offers o
where public.offer_is_public(o);

create view public.site_departures
with (security_barrier = true)
as
select d.id, d.offer_id, d.code, d.start_date, d.end_date,
       d.price_adult, d.price_child, d.price_infant, d.single_supplement, d.deposit_amount, d.currency,
       d.booking_deadline,
       greatest(d.capacity - d.seats_confirmed - d.seats_on_option, 0) as seats_available,
       case
         when d.status <> 'open' then 'closed'
         when d.start_date <= current_date or (d.booking_deadline is not null and d.booking_deadline < current_date) then 'expired'
         when d.capacity - d.seats_confirmed - d.seats_on_option <= 0 then 'full'
         else 'bookable'
       end as availability
from public.departures d
join public.offers o on o.id = d.offer_id
where public.offer_is_public(o) and d.status <> 'cancelled';

create view public.site_public_pages
with (security_barrier = true)
as
select slug, title, body, seo_title, seo_description, updated_at
from public.site_pages where status = 'published';

grant select on public.site_offers, public.site_departures, public.site_public_pages to anon, authenticated;
grant select on public.site_redirects to anon;

-- ---------------------------------------------------------------------
-- Triggers & RLS
-- ---------------------------------------------------------------------
create trigger suppliers_touch before update on public.suppliers for each row execute function public.tg_touch_updated_at();
create trigger offers_touch before update on public.offers for each row execute function public.tg_touch_updated_at();
create trigger departures_touch before update on public.departures for each row execute function public.tg_touch_updated_at();
create trigger site_pages_touch before update on public.site_pages for each row execute function public.tg_touch_updated_at();
create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function public.tg_audit();
create trigger offers_audit after insert or update or delete on public.offers for each row execute function public.tg_audit();
create trigger departures_audit after insert or update or delete on public.departures for each row execute function public.tg_audit();
create trigger hotel_rates_audit after insert or update or delete on public.hotel_rates for each row execute function public.tg_audit();

alter table public.suppliers enable row level security;
alter table public.supplier_contracts enable row level security;
alter table public.hotels enable row level security;
alter table public.hotel_rates enable row level security;
alter table public.hotel_mappings enable row level security;
alter table public.offers enable row level security;
alter table public.departures enable row level security;
alter table public.offer_costings enable row level security;
create policy offer_costings_all on public.offer_costings for all to authenticated
  using (public.has_perm('margins', 'read')) with check (public.has_perm('margins', 'read') and public.has_perm('departures', 'update'));
alter table public.site_pages enable row level security;
alter table public.site_redirects enable row level security;

create policy suppliers_select on public.suppliers for select to authenticated using (public.has_perm('suppliers', 'read'));
create policy suppliers_write on public.suppliers for all to authenticated using (public.has_perm('suppliers', 'update')) with check (public.has_perm('suppliers', 'update'));
create policy contracts_select on public.supplier_contracts for select to authenticated using (public.has_perm('suppliers', 'read'));
create policy contracts_write on public.supplier_contracts for all to authenticated using (public.has_perm('suppliers', 'update')) with check (public.has_perm('suppliers', 'update'));

create policy hotels_select on public.hotels for select to authenticated using (public.has_perm('suppliers', 'read') or public.has_perm('site', 'read'));
create policy hotels_write on public.hotels for all to authenticated using (public.has_perm('suppliers', 'update')) with check (public.has_perm('suppliers', 'update'));
-- Tarifs = coûts : jamais pour le profil site
create policy hotel_rates_select on public.hotel_rates for select to authenticated using (public.has_perm('suppliers', 'read'));
create policy hotel_rates_write on public.hotel_rates for all to authenticated using (public.has_perm('suppliers', 'update')) with check (public.has_perm('suppliers', 'update'));
create policy hotel_mappings_select on public.hotel_mappings for select to authenticated using (public.has_perm('suppliers', 'read'));
create policy hotel_mappings_write on public.hotel_mappings for all to authenticated using (public.has_perm('integrations', 'update')) with check (public.has_perm('integrations', 'update'));

create policy offers_select on public.offers for select to authenticated using (public.has_perm('site', 'read') or public.has_perm('departures', 'read'));
create policy offers_insert on public.offers for insert to authenticated with check (public.has_perm('site', 'create'));
create policy offers_update on public.offers for update to authenticated using (public.has_perm('site', 'update')) with check (public.has_perm('site', 'update'));

create policy departures_select on public.departures for select to authenticated using (public.has_perm('departures', 'read') or public.has_perm('site', 'read'));
create policy departures_write on public.departures for all to authenticated using (public.has_perm('departures', 'update')) with check (public.has_perm('departures', 'update'));

create policy site_pages_select on public.site_pages for select to authenticated using (public.has_perm('site', 'read'));
create policy site_pages_write on public.site_pages for all to authenticated using (public.has_perm('site', 'update')) with check (public.has_perm('site', 'update'));
create policy site_redirects_public on public.site_redirects for select to anon, authenticated using (true);
create policy site_redirects_write on public.site_redirects for all to authenticated using (public.has_perm('site', 'update')) with check (public.has_perm('site', 'update'));
