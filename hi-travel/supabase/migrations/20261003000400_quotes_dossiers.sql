-- =====================================================================
-- Devis versionnés, dossiers, prestations, voyageurs, places, opérations
-- =====================================================================

create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded');
create type public.service_type as enum (
  'flight', 'hotel', 'transfer', 'excursion', 'visa', 'transport', 'circuit',
  'package', 'event_item', 'insurance', 'fee', 'other'
);
create type public.service_status as enum ('requested', 'option', 'confirmed', 'cancelled');
create type public.pax_type as enum ('adult', 'child', 'infant', 'all');
create type public.dossier_status as enum (
  'request', 'quote_prepared', 'quote_sent', 'accepted', 'booking',
  'confirmed', 'travelling', 'completed', 'archived', 'cancelled'
);

-- ---------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------
create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique default public.next_number('QUOTE'),
  lead_id       uuid references public.leads (id),
  client_id     uuid not null references public.clients (id),
  activity      public.activity not null,
  title         text not null,
  owner_id      uuid references public.staff_profiles (id) default auth.uid(),
  offer_id      uuid references public.offers (id),
  departure_id  uuid references public.departures (id),
  status        public.quote_status not null default 'draft',
  lost_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.quote_versions (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes (id) on delete cascade,
  version_no      int not null,
  label           text,
  language        text not null default 'fr' check (language in ('fr', 'en')),
  start_date      date,
  end_date        date,
  adults          int not null default 1 check (adults >= 0),
  children        int not null default 0 check (children >= 0),
  infants         int not null default 0 check (infants >= 0),
  currency        char(3) not null default 'TND',
  valid_until     date,
  program         jsonb not null default '[]'::jsonb,
  inclusions      text[] not null default '{}',
  exclusions      text[] not null default '{}',
  payment_terms   jsonb not null default '[]'::jsonb,  -- [{label, kind, amount|percent, due_date|days_before_departure}]
  client_notes    text,
  internal_notes  text,
  status          public.quote_status not null default 'draft',
  sent_at         timestamptz,
  sent_via        text,
  responded_at    timestamptz,
  response_note   text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (quote_id, version_no)
);

create table public.quote_lines (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.quote_versions (id) on delete cascade,
  position        int not null default 0,
  activity        public.activity not null,
  service_type    public.service_type not null,
  description     text not null,
  supplier_id     uuid references public.suppliers (id),
  hotel_id        uuid references public.hotels (id),
  start_date      date,
  end_date        date,
  pax_type        public.pax_type not null default 'all',
  quantity        numeric(10,2) not null default 1 check (quantity > 0),
  unit_cost       numeric(14,3) not null default 0 check (unit_cost >= 0),
  cost_currency   char(3) not null default 'TND',
  fx_rate         numeric(14,6) not null default 1 check (fx_rate > 0),
  unit_price      numeric(14,3) not null default 0 check (unit_price >= 0),
  is_optional     boolean not null default false,
  option_selected boolean not null default false,
  is_mandatory    boolean not null default true,
  details         jsonb not null default '{}'::jsonb
);

-- Totaux d'une version : prix client et coûts internes séparés
create view public.quote_version_totals
with (security_invoker = true)
as
select v.id as version_id,
       v.quote_id,
       coalesce(sum(round(l.unit_price * l.quantity, 3)) filter (where not l.is_optional or l.option_selected), 0) as total_price,
       coalesce(sum(round(l.unit_cost * l.fx_rate * l.quantity, 3)) filter (where not l.is_optional or l.option_selected), 0) as total_cost_tnd,
       coalesce(sum(round(l.unit_price * l.quantity, 3)) filter (where l.is_optional and not l.option_selected), 0) as optional_total
from public.quote_versions v
left join public.quote_lines l on l.version_id = v.id
group by v.id, v.quote_id;

-- Une version envoyée est figée : toute modification passe par une nouvelle version
create or replace function public.tg_quote_lines_frozen()
returns trigger
language plpgsql
as $$
declare
  v_status public.quote_status;
begin
  select status into v_status from public.quote_versions
   where id = coalesce(new.version_id, old.version_id);
  if v_status is distinct from 'draft' then
    raise exception 'Version de devis figée (statut %) : créer une nouvelle version', v_status;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger quote_lines_frozen before insert or update or delete on public.quote_lines
  for each row execute function public.tg_quote_lines_frozen();

-- ---------------------------------------------------------------------
-- Dossiers
-- ---------------------------------------------------------------------
create table public.dossiers (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique default public.next_number('DOSSIER'),
  client_id             uuid not null references public.clients (id),
  lead_id               uuid references public.leads (id),
  quote_id              uuid unique references public.quotes (id),
  accepted_version_id   uuid references public.quote_versions (id),
  activity              public.activity not null,
  is_omra               boolean not null default false,
  title                 text not null,
  destination           text,
  start_date            date,
  end_date              date,
  owner_id              uuid references public.staff_profiles (id),
  departure_id          uuid references public.departures (id),
  status                public.dossier_status not null default 'accepted',
  total_price           numeric(14,3) not null default 0,
  currency              char(3) not null default 'TND',
  adults                int not null default 1,
  children              int not null default 0,
  infants               int not null default 0,
  derogation_reason     text,
  derogation_by         uuid references public.staff_profiles (id),
  derogation_at         timestamptz,
  financial_status      text not null default 'open' check (financial_status in ('open', 'follow_up', 'closed', 'closed_with_exception')),
  financial_closed_at   timestamptz,
  financial_closed_by   uuid references public.staff_profiles (id),
  financial_close_note  text,
  cancelled_reason      text,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index dossiers_status_idx on public.dossiers (status, start_date);
create index dossiers_client_idx on public.dossiers (client_id);

alter table public.interactions
  add constraint interactions_dossier_fk foreign key (dossier_id) references public.dossiers (id) on delete cascade;

create table public.dossier_travellers (
  dossier_id    uuid not null references public.dossiers (id) on delete cascade,
  traveller_id  uuid not null references public.travellers (id),
  is_lead       boolean not null default false,
  room_label    text,
  special_requests text,
  primary key (dossier_id, traveller_id)
);

-- Prestations : chaque prestation garde son module d'origine, son fournisseur et son statut
create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  dossier_id         uuid not null references public.dossiers (id) on delete cascade,
  quote_line_id      uuid references public.quote_lines (id),
  activity           public.activity not null,
  service_type       public.service_type not null,
  description        text not null,
  supplier_id        uuid references public.suppliers (id),
  hotel_id           uuid references public.hotels (id),
  start_at           timestamptz,
  end_at             timestamptz,
  start_date         date,
  end_date           date,
  local_timezone     text not null default 'Africa/Tunis',
  pax_type           public.pax_type not null default 'all',
  quantity           numeric(10,2) not null default 1,
  -- Hôtel : nuitées calculées à partir des dates de séjour (≠ durée du voyage)
  nights             int generated always as (
                       case when service_type = 'hotel' and start_date is not null and end_date is not null
                            then end_date - start_date end) stored,
  room_type          text,
  board              text,
  occupancy          text,
  cost_planned       numeric(14,3) not null default 0,
  cost_confirmed     numeric(14,3),
  cost_currency      char(3) not null default 'TND',
  fx_rate            numeric(14,6) not null default 1 check (fx_rate > 0),
  fx_rate_date       date,
  fx_rate_source     text,
  sale_price         numeric(14,3) not null default 0,
  is_mandatory       boolean not null default true,
  status             public.service_status not null default 'requested',
  option_deadline    timestamptz,
  confirmation_ref   text,
  confirmed_at       timestamptz,
  confirmation_document_id uuid,
  external_provider  text,
  external_ref       text,
  cancellation_terms text,
  linked_service_id  uuid references public.services (id) on delete set null,
  needs_review       boolean not null default false,
  review_reason      text,
  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index services_dossier_idx on public.services (dossier_id);
create index services_external_idx on public.services (external_provider, external_ref);

-- Billetterie : segments et billets
create table public.flight_segments (
  id            uuid primary key default gen_random_uuid(),
  service_id    uuid not null references public.services (id) on delete cascade,
  seq           int not null default 1,
  carrier       text not null,
  flight_number text not null,
  from_airport  char(3) not null,
  to_airport    char(3) not null,
  departs_at    timestamptz not null,
  departs_tz    text not null default 'Africa/Tunis',
  arrives_at    timestamptz not null,
  arrives_tz    text not null default 'Africa/Tunis',
  pnr           text,
  baggage       text,
  check (arrives_at > departs_at)
);

create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services (id) on delete cascade,
  traveller_id    uuid references public.travellers (id),
  ticket_number   text,
  pnr             text,
  passenger_name  text,
  status          text not null default 'pending' check (status in ('pending', 'issued', 'reissued', 'void', 'refund_expected', 'refunded')),
  issue_deadline  timestamptz,
  issued_at       timestamptz,
  fare            numeric(14,3) not null default 0,
  taxes           numeric(14,3) not null default 0,
  service_fee     numeric(14,3) not null default 0,
  sale_price      numeric(14,3) not null default 0,
  penalty         numeric(14,3) not null default 0,
  refund_amount   numeric(14,3),
  currency        char(3) not null default 'TND',
  reissue_of_id   uuid references public.tickets (id),
  created_at      timestamptz not null default now()
);
create unique index tickets_number_uq on public.tickets (ticket_number) where ticket_number is not null;

-- Visa : un dossier par voyageur et destination
create table public.visa_applications (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services (id) on delete cascade,
  traveller_id    uuid references public.travellers (id),
  destination     text not null,
  visa_type       text not null default 'tourism',
  checklist_version text,
  checklist       jsonb not null default '[]'::jsonb,   -- [{code, label, received:boolean}]
  appointment_at  timestamptz,
  submitted_at    timestamptz,
  status          text not null default 'collecting' check (status in ('collecting', 'ready', 'appointment', 'submitted', 'decision_received', 'passport_returned', 'cancelled')),
  decision        text check (decision in ('granted', 'refused', 'pending')),
  consular_fee    numeric(14,3) not null default 0,
  center_fee      numeric(14,3) not null default 0,
  agency_fee      numeric(14,3) not null default 0,
  passport_returned_at timestamptz,
  expiry_date     date,
  notes           text,
  created_at      timestamptz not null default now()
);

-- MICE : participants
create table public.event_participants (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.dossiers (id) on delete cascade,
  full_name       text not null,
  company         text,
  group_label     text,
  email           text,
  phone           text,
  attendance      text not null default 'invited' check (attendance in ('invited', 'registered', 'confirmed', 'cancelled', 'attended')),
  arrival_at      timestamptz,
  departure_at    timestamptz,
  room_needs      text,
  constraints     text,
  created_at      timestamptz not null default now()
);
create unique index event_participants_email_uq on public.event_participants (dossier_id, lower(email)) where email is not null;

-- Échéancier client librement paramétrable par dossier
create table public.payment_schedule_items (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.dossiers (id) on delete cascade,
  seq         int not null,
  label       text not null,
  kind        text not null default 'installment' check (kind in ('deposit', 'installment', 'balance')),
  amount      numeric(14,3) not null check (amount > 0),
  due_date    date,
  created_at  timestamptz not null default now(),
  unique (dossier_id, seq)
);

-- ---------------------------------------------------------------------
-- Départs : options et places confirmées sans survente (REC03)
-- ---------------------------------------------------------------------
create table public.departure_holds (
  id            uuid primary key default gen_random_uuid(),
  departure_id  uuid not null references public.departures (id),
  dossier_id    uuid references public.dossiers (id),
  lead_id       uuid references public.leads (id),
  seats         int not null check (seats > 0),
  kind          text not null check (kind in ('option', 'confirmed')),
  status        text not null default 'active' check (status in ('active', 'released', 'expired', 'converted')),
  expires_at    timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  released_at   timestamptz
);
create index departure_holds_active_idx on public.departure_holds (departure_id) where status = 'active';

create or replace function public.hold_departure_seats(
  p_departure_id uuid, p_seats int, p_kind text, p_dossier_id uuid default null,
  p_lead_id uuid default null, p_expires_at timestamptz default null)
returns public.departure_holds
language plpgsql security definer set search_path = public
as $$
declare
  v_dep public.departures;
  v_hold public.departure_holds;
  v_available int;
begin
  perform public.require_perm('departures', 'update');
  -- Verrou de ligne : sérialise les réservations simultanées sur le même départ
  select * into v_dep from public.departures where id = p_departure_id for update;
  if not found then raise exception 'Départ introuvable'; end if;
  if v_dep.status <> 'open' then raise exception 'Départ % fermé', v_dep.code; end if;
  if p_kind not in ('option', 'confirmed') then raise exception 'Type de réservation invalide'; end if;

  v_available := v_dep.capacity - v_dep.seats_confirmed - v_dep.seats_on_option;
  if p_seats > v_available then
    raise exception 'Capacité insuffisante sur % : % place(s) disponible(s), % demandée(s)',
      v_dep.code, v_available, p_seats using errcode = 'P0001';
  end if;

  insert into public.departure_holds (departure_id, dossier_id, lead_id, seats, kind, expires_at)
  values (p_departure_id, p_dossier_id, p_lead_id, p_seats, p_kind,
          case when p_kind = 'option' then coalesce(p_expires_at, now() + make_interval(hours => v_dep.option_hold_hours)) end)
  returning * into v_hold;

  update public.departures
     set seats_confirmed = seats_confirmed + case when p_kind = 'confirmed' then p_seats else 0 end,
         seats_on_option = seats_on_option + case when p_kind = 'option' then p_seats else 0 end
   where id = p_departure_id;
  return v_hold;
end;
$$;

create or replace function public.release_departure_hold(p_hold_id uuid, p_new_status text default 'released')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hold public.departure_holds;
begin
  perform public.require_perm('departures', 'update');
  select * into v_hold from public.departure_holds where id = p_hold_id for update;
  if not found or v_hold.status <> 'active' then return; end if;
  perform 1 from public.departures where id = v_hold.departure_id for update;
  update public.departure_holds set status = p_new_status, released_at = now() where id = p_hold_id;
  update public.departures
     set seats_confirmed = seats_confirmed - case when v_hold.kind = 'confirmed' then v_hold.seats else 0 end,
         seats_on_option = seats_on_option - case when v_hold.kind = 'option' then v_hold.seats else 0 end
   where id = v_hold.departure_id;
end;
$$;

-- Option → place confirmée (dans la même transaction, sans repasser par la disponibilité)
create or replace function public.confirm_departure_hold(p_hold_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_hold public.departure_holds;
begin
  perform public.require_perm('departures', 'update');
  select * into v_hold from public.departure_holds where id = p_hold_id for update;
  if not found or v_hold.status <> 'active' or v_hold.kind <> 'option' then
    raise exception 'Option inactive ou déjà confirmée';
  end if;
  perform 1 from public.departures where id = v_hold.departure_id for update;
  update public.departure_holds set kind = 'confirmed', expires_at = null where id = p_hold_id;
  update public.departures
     set seats_on_option = seats_on_option - v_hold.seats,
         seats_confirmed = seats_confirmed + v_hold.seats
   where id = v_hold.departure_id;
end;
$$;

-- Expiration des options selon la règle configurée (appel planifié)
create or replace function public.expire_departure_options()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.departure_holds
            where status = 'active' and kind = 'option' and expires_at < now()
  loop
    perform public.release_departure_hold(r.id, 'expired');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- Acceptation d'un devis → dossier, sans ressaisie, idempotente (REC01)
-- ---------------------------------------------------------------------
create or replace function public.accept_quote_version(p_version_id uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_version public.quote_versions;
  v_quote public.quotes;
  v_lead public.leads;
  v_dossier_id uuid;
  v_total numeric(14,3);
  v_term jsonb;
  v_seq int := 0;
  v_amount numeric(14,3);
  v_offer public.offers;
begin
  perform public.require_perm('quotes', 'validate');

  select * into v_version from public.quote_versions where id = p_version_id for update;
  if not found then raise exception 'Version de devis introuvable'; end if;
  select * into v_quote from public.quotes where id = v_version.quote_id for update;

  -- Idempotence : un devis accepté ne produit qu'un seul dossier
  select id into v_dossier_id from public.dossiers where quote_id = v_quote.id;
  if v_dossier_id is not null then
    if v_version.status = 'accepted' then
      return v_dossier_id;
    end if;
    raise exception 'Le devis % est déjà converti avec une autre version', v_quote.reference;
  end if;

  if v_version.status not in ('draft', 'sent') then
    raise exception 'Version % non acceptable (statut %)', v_version.version_no, v_version.status;
  end if;

  select total_price into v_total from public.quote_version_totals where version_id = p_version_id;
  if coalesce(v_total, 0) <= 0 then
    raise exception 'Le devis ne contient aucune prestation chiffrée';
  end if;

  update public.quote_versions
     set status = 'accepted', responded_at = now(), response_note = p_note
   where id = p_version_id;
  update public.quote_versions set status = 'superseded'
   where quote_id = v_quote.id and id <> p_version_id and status in ('draft', 'sent');
  update public.quotes set status = 'accepted' where id = v_quote.id;

  if v_quote.offer_id is not null then
    select * into v_offer from public.offers where id = v_quote.offer_id;
  end if;

  insert into public.dossiers (
    client_id, lead_id, quote_id, accepted_version_id, activity, is_omra, title, destination,
    start_date, end_date, owner_id, departure_id, status, total_price, currency, adults, children, infants)
  values (
    v_quote.client_id, v_quote.lead_id, v_quote.id, p_version_id, v_quote.activity, coalesce(v_offer.is_omra, false),
    v_quote.title, coalesce(v_offer.destination, (select destination from public.leads where id = v_quote.lead_id)),
    v_version.start_date, v_version.end_date, coalesce(v_quote.owner_id, auth.uid()), v_quote.departure_id,
    'accepted', v_total, v_version.currency, v_version.adults, v_version.children, v_version.infants)
  returning id into v_dossier_id;

  -- Prestations reprises des lignes acceptées (options non retenues exclues)
  insert into public.services (
    dossier_id, quote_line_id, activity, service_type, description, supplier_id, hotel_id,
    start_date, end_date, pax_type, quantity, room_type, board, cost_planned, cost_currency,
    fx_rate, fx_rate_date, fx_rate_source, sale_price, is_mandatory, status, details)
  select v_dossier_id, l.id, l.activity, l.service_type, l.description, l.supplier_id, l.hotel_id,
         l.start_date, l.end_date, l.pax_type, l.quantity, l.details ->> 'room_type', l.details ->> 'board',
         round(l.unit_cost * l.quantity, 3), l.cost_currency, l.fx_rate, current_date, 'devis',
         round(l.unit_price * l.quantity, 3), l.is_mandatory, 'requested', l.details
    from public.quote_lines l
   where l.version_id = p_version_id and (not l.is_optional or l.option_selected)
   order by l.position;

  -- Échéancier convenu
  for v_term in select * from jsonb_array_elements(v_version.payment_terms)
  loop
    v_seq := v_seq + 1;
    v_amount := coalesce((v_term ->> 'amount')::numeric, round(v_total * (v_term ->> 'percent')::numeric / 100, 3));
    insert into public.payment_schedule_items (dossier_id, seq, label, kind, amount, due_date)
    values (v_dossier_id, v_seq, coalesce(v_term ->> 'label', 'Échéance ' || v_seq),
            coalesce(v_term ->> 'kind', 'installment'), v_amount,
            coalesce((v_term ->> 'due_date')::date,
                     v_version.start_date - coalesce((v_term ->> 'days_before_departure')::int, 0)));
  end loop;

  if v_quote.lead_id is not null then
    update public.leads set stage = 'won', client_id = coalesce(client_id, v_quote.client_id)
     where id = v_quote.lead_id;
  end if;

  insert into public.interactions (client_id, lead_id, dossier_id, channel, summary)
  values (v_quote.client_id, v_quote.lead_id, v_dossier_id, 'note',
          format('Devis %s v%s accepté, dossier créé', v_quote.reference, v_version.version_no));

  return v_dossier_id;
end;
$$;

-- Nouvelle version de devis (copie de la précédente, modifiable)
create or replace function public.create_quote_version(p_quote_id uuid, p_from_version_id uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_new_id uuid;
  v_src public.quote_versions;
  v_no int;
begin
  perform public.require_perm('quotes', 'update');
  if exists (select 1 from public.quotes where id = p_quote_id and status = 'accepted') then
    raise exception 'Devis déjà accepté : les modifications passent par le dossier';
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from public.quote_versions where quote_id = p_quote_id;
  if p_from_version_id is null then
    select * into v_src from public.quote_versions where quote_id = p_quote_id order by version_no desc limit 1;
  else
    select * into v_src from public.quote_versions where id = p_from_version_id and quote_id = p_quote_id;
  end if;

  insert into public.quote_versions (quote_id, version_no, label, language, start_date, end_date, adults, children,
    infants, currency, valid_until, program, inclusions, exclusions, payment_terms, client_notes, internal_notes)
  values (p_quote_id, v_no, v_src.label, coalesce(v_src.language, 'fr'), v_src.start_date, v_src.end_date,
    coalesce(v_src.adults, 1), coalesce(v_src.children, 0), coalesce(v_src.infants, 0), coalesce(v_src.currency, 'TND'),
    v_src.valid_until, coalesce(v_src.program, '[]'), coalesce(v_src.inclusions, '{}'), coalesce(v_src.exclusions, '{}'),
    coalesce(v_src.payment_terms, '[]'), v_src.client_notes, v_src.internal_notes)
  returning id into v_new_id;

  if v_src.id is not null then
    insert into public.quote_lines (version_id, position, activity, service_type, description, supplier_id, hotel_id,
      start_date, end_date, pax_type, quantity, unit_cost, cost_currency, fx_rate, unit_price, is_optional,
      option_selected, is_mandatory, details)
    select v_new_id, position, activity, service_type, description, supplier_id, hotel_id, start_date, end_date,
           pax_type, quantity, unit_cost, cost_currency, fx_rate, unit_price, is_optional, option_selected,
           is_mandatory, details
      from public.quote_lines where version_id = v_src.id;
  end if;
  return v_new_id;
end;
$$;

-- Envoi enregistré : la version devient figée
create or replace function public.mark_quote_version_sent(p_version_id uuid, p_via text default 'email')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_quote_id uuid;
begin
  perform public.require_perm('quotes', 'update');
  update public.quote_versions set status = 'sent', sent_at = now(), sent_via = p_via
   where id = p_version_id and status = 'draft'
   returning quote_id into v_quote_id;
  if v_quote_id is null then raise exception 'Seule une version brouillon peut être envoyée'; end if;
  update public.quotes set status = 'sent' where id = v_quote_id and status = 'draft';
  update public.leads set stage = 'follow_up'
   where id = (select lead_id from public.quotes where id = v_quote_id) and stage in ('received', 'qualification', 'quote');
end;
$$;
