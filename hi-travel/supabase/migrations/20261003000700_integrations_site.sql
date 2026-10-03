-- =====================================================================
-- Connecteurs API hôtels (API01–API04), imports manuels (IMP01–IMP03),
-- demandes du site (FO04), tableau de bord (section 3)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Connecteurs : activation indépendante, configuration non secrète, journal technique
-- Les identifiants restent dans les variables d'environnement du serveur (jamais en base ni côté site).
-- ---------------------------------------------------------------------
create table public.integration_connectors (
  code          text primary key,
  label         text not null,
  kind          text not null check (kind in ('hotel_api', 'payment', 'messaging', 'fx')),
  enabled       boolean not null default false,
  mode          text not null default 'mock' check (mode in ('mock', 'test', 'live')),
  capabilities  jsonb not null default '{}'::jsonb,   -- matrice : search, book, confirm, voucher, modify, cancel
  config        jsonb not null default '{}'::jsonb,
  notes         text,
  updated_at    timestamptz not null default now()
);

create table public.api_call_logs (
  id              bigint generated always as identity primary key,
  connector_code  text not null references public.integration_connectors (code),
  operation       text not null,
  request_id      text,
  status          text not null check (status in ('success', 'error', 'timeout', 'unavailable')),
  duration_ms     int,
  request_summary jsonb,            -- données sensibles masquées
  response_summary jsonb,
  error_message   text,
  actor_id        uuid,
  created_at      timestamptz not null default now()
);
create index api_call_logs_connector_idx on public.api_call_logs (connector_code, created_at desc);

-- Réservations via API : identifiant unique de demande, aucun double envoi (API03, REC25)
create table public.hotel_booking_requests (
  id                uuid primary key default gen_random_uuid(),
  request_id        text not null unique,
  connector_code    text not null references public.integration_connectors (code),
  service_id        uuid references public.services (id),
  dossier_id        uuid references public.dossiers (id),
  provider_hotel_code text not null,
  offer_snapshot    jsonb not null,           -- offre normalisée + valeur et référence d'origine + date de consultation
  status            text not null default 'sent' check (status in ('sent', 'pending', 'confirmed', 'failed', 'to_verify', 'cancelled')),
  external_ref      text,
  amount            numeric(14,3),
  currency          char(3),
  conditions        text,
  last_error        text,
  attempts          int not null default 1,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Imports manuels : billetterie et hôtels à l'étranger
-- ---------------------------------------------------------------------
create table public.import_templates (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('ticketing', 'hotel_intl')),
  version       int not null,
  label         text not null,
  delimiter     text not null default ',',
  encoding      text not null default 'utf-8',
  date_format   text not null default 'YYYY-MM-DD',
  column_mapping jsonb not null,        -- {champ_normalisé: "Nom de colonne"}
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (kind, version)
);

create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('ticketing', 'hotel_intl')),
  template_id     uuid not null references public.import_templates (id),
  source_document_id uuid references public.documents (id),
  file_name       text not null,
  file_sha256     text not null,
  platform        text not null,
  status          text not null default 'preview' check (status in ('preview', 'committed', 'cancelled')),
  stats           jsonb not null default '{}'::jsonb,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  committed_at    timestamptz,
  committed_by    uuid
);

create table public.import_rows (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null references public.import_batches (id) on delete cascade,
  row_number      int not null,
  external_key    text,
  classification  text not null check (classification in ('new', 'duplicate', 'modified', 'invalid', 'ambiguous')),
  errors          jsonb not null default '[]'::jsonb,
  diff            jsonb,
  raw             jsonb not null,
  normalized      jsonb,
  candidate_dossier_ids uuid[] not null default '{}',
  target_dossier_id uuid references public.dossiers (id),
  decision        text not null default 'pending' check (decision in ('pending', 'apply', 'skip')),
  applied_service_id uuid references public.services (id),
  unique (batch_id, row_number)
);

-- Enregistrements externes : clé stable par plateforme et nature du mouvement (IMP03)
create table public.external_records (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  kind          text not null,
  external_key  text not null,
  service_id    uuid references public.services (id),
  ticket_id     uuid references public.tickets (id),
  last_data     jsonb not null,
  history       jsonb not null default '[]'::jsonb,
  first_batch_id uuid references public.import_batches (id),
  last_batch_id uuid references public.import_batches (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (platform, kind, external_key)
);

-- Intégration contrôlée d'un lot prévisualisé (lignes « apply » uniquement)
create or replace function public.commit_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_batch public.import_batches;
  r public.import_rows;
  v_rec public.external_records;
  v_service_id uuid;
  v_ticket_id uuid;
  v_n jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_status public.service_status;
begin
  perform public.require_perm('imports', 'validate');
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.status <> 'preview' then raise exception 'Lot déjà intégré ou annulé'; end if;

  for r in select * from public.import_rows where batch_id = p_batch_id order by row_number
  loop
    if r.decision <> 'apply' or r.classification in ('invalid', 'duplicate') or r.target_dossier_id is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_n := r.normalized;
    select * into v_rec from public.external_records
     where platform = v_batch.platform and kind = v_batch.kind and external_key = r.external_key for update;

    v_status := case
      when v_n ->> 'status' in ('cancelled', 'refunded', 'void') then 'cancelled'::public.service_status
      when v_n ->> 'status' in ('confirmed', 'issued', 'reissued') then 'confirmed'::public.service_status
      else 'option'::public.service_status end;

    if v_rec.id is null then
      -- Nouvelle ligne : prestation créée (prix de vente à compléter si absent)
      insert into public.services (dossier_id, activity, service_type, description, supplier_id, start_date, end_date,
        cost_planned, cost_confirmed, cost_currency, fx_rate, fx_rate_date, fx_rate_source, sale_price, status,
        external_provider, external_ref, room_type, board, occupancy, details)
      values (r.target_dossier_id,
        case when v_batch.kind = 'ticketing' then 'ticketing'::public.activity else 'hotel_intl'::public.activity end,
        case when v_batch.kind = 'ticketing' then 'flight'::public.service_type else 'hotel'::public.service_type end,
        coalesce(v_n ->> 'description', v_batch.kind || ' ' || r.external_key),
        nullif(v_n ->> 'supplier_id', '')::uuid,
        nullif(v_n ->> 'start_date', '')::date, nullif(v_n ->> 'end_date', '')::date,
        coalesce((v_n ->> 'cost')::numeric, 0), (v_n ->> 'cost')::numeric, coalesce(v_n ->> 'currency', 'TND'),
        coalesce((v_n ->> 'fx_rate')::numeric, 1), current_date, 'import ' || v_batch.file_name,
        coalesce((v_n ->> 'sale_price')::numeric, 0), v_status, v_batch.platform, r.external_key,
        v_n ->> 'room_type', v_n ->> 'board', v_n ->> 'occupancy',
        jsonb_build_object('import', jsonb_build_object('batch_id', p_batch_id, 'row', r.row_number), 'source', v_n))
      returning id into v_service_id;

      if v_batch.kind = 'ticketing' then
        insert into public.tickets (service_id, ticket_number, pnr, passenger_name, status, issued_at, fare, taxes,
          service_fee, currency, refund_amount)
        values (v_service_id, v_n ->> 'ticket_number', v_n ->> 'pnr', v_n ->> 'passenger_name',
          case v_n ->> 'status' when 'refunded' then 'refunded' when 'void' then 'void' when 'reissued' then 'reissued'
                                when 'refund_expected' then 'refund_expected' else 'issued' end,
          nullif(v_n ->> 'issue_date', '')::timestamptz, coalesce((v_n ->> 'fare')::numeric, 0),
          coalesce((v_n ->> 'taxes')::numeric, 0), coalesce((v_n ->> 'fees')::numeric, 0),
          coalesce(v_n ->> 'currency', 'TND'), (v_n ->> 'refund_amount')::numeric)
        returning id into v_ticket_id;
      end if;

      insert into public.external_records (platform, kind, external_key, service_id, ticket_id, last_data, history, first_batch_id, last_batch_id)
      values (v_batch.platform, v_batch.kind, r.external_key, v_service_id, v_ticket_id, v_n,
              jsonb_build_array(jsonb_build_object('batch_id', p_batch_id, 'at', now(), 'data', v_n)), p_batch_id, p_batch_id);
      v_created := v_created + 1;
    else
      -- Évolution d'une ligne existante : historique conservé, pièces comptables validées intactes
      update public.services
         set status = v_status,
             cost_confirmed = coalesce((v_n ->> 'cost')::numeric, cost_confirmed),
             start_date = coalesce(nullif(v_n ->> 'start_date', '')::date, start_date),
             end_date = coalesce(nullif(v_n ->> 'end_date', '')::date, end_date),
             details = details || jsonb_build_object('last_import', jsonb_build_object('batch_id', p_batch_id, 'row', r.row_number))
       where id = v_rec.service_id;
      if v_rec.ticket_id is not null then
        update public.tickets
           set status = case v_n ->> 'status' when 'refunded' then 'refunded' when 'void' then 'void'
                             when 'reissued' then 'reissued' when 'refund_expected' then 'refund_expected' else status end,
               refund_amount = coalesce((v_n ->> 'refund_amount')::numeric, refund_amount)
         where id = v_rec.ticket_id;
      end if;
      if v_n ->> 'status' in ('cancelled', 'refunded', 'void', 'refund_expected') then
        insert into public.alerts (kind, severity, title, dossier_id, service_id, details, dedupe_key)
        values ('import_status_change', 'orange', format('Import : %s → %s, coûts et remboursement à vérifier', r.external_key, v_n ->> 'status'),
                r.target_dossier_id, v_rec.service_id, jsonb_build_object('batch_id', p_batch_id, 'diff', r.diff),
                'import:' || v_batch.platform || ':' || r.external_key || ':' || (v_n ->> 'status'))
        on conflict (dedupe_key) do nothing;
      end if;
      update public.external_records
         set last_data = v_n, last_batch_id = p_batch_id, updated_at = now(),
             history = history || jsonb_build_array(jsonb_build_object('batch_id', p_batch_id, 'at', now(), 'data', v_n, 'diff', r.diff))
       where id = v_rec.id;
      v_service_id := v_rec.service_id;
      v_updated := v_updated + 1;
    end if;
    update public.import_rows set applied_service_id = v_service_id where id = r.id;
  end loop;

  update public.import_batches
     set status = 'committed', committed_at = now(), committed_by = auth.uid(),
         stats = stats || jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped)
   where id = p_batch_id;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- ---------------------------------------------------------------------
-- Demandes du site : création unique, affectation, idempotence (FO04, REC48)
-- ---------------------------------------------------------------------
create or replace function public.submit_site_request(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_token text := p ->> 'submission_token';
  v_existing public.leads;
  v_email text := lower(nullif(trim(p ->> 'email'), ''));
  v_phone text := nullif(trim(p ->> 'phone'), '');
  v_first text := nullif(trim(p ->> 'first_name'), '');
  v_last text := nullif(trim(p ->> 'last_name'), '');
  v_company text := nullif(trim(p ->> 'company'), '');
  v_activity public.activity;
  v_client_id uuid;
  v_dups uuid[];
  v_strong uuid[];
  v_owner uuid;
  v_lead public.leads;
  v_recent int;
begin
  if v_token is null or length(v_token) < 16 then
    raise exception 'Jeton de soumission invalide';
  end if;
  select * into v_existing from public.leads where submission_token = v_token;
  if found then
    return jsonb_build_object('reference', v_existing.reference, 'duplicate_submission', true);
  end if;

  begin
    v_activity := (p ->> 'activity')::public.activity;
  exception when others then
    raise exception 'Activité inconnue';
  end;
  if v_email is null and v_phone is null then
    raise exception 'Un e-mail ou un téléphone est requis';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if coalesce(v_last, v_first, v_company) is null then
    raise exception 'Nom requis';
  end if;
  if not coalesce((p ->> 'processing_consent')::boolean, false) then
    raise exception 'Accord nécessaire au traitement de la demande manquant';
  end if;
  if length(coalesce(p ->> 'message', '')) > 5000 then
    raise exception 'Message trop long';
  end if;

  -- Protection contre les abus : 5 demandes / heure / contact
  select count(*) into v_recent from public.leads
   where created_at > now() - interval '1 hour' and source = 'website'
     and ((v_email is not null and contact_snapshot ->> 'email' = v_email)
          or (v_phone is not null and contact_snapshot ->> 'phone' = v_phone));
  if v_recent >= 5 then
    raise exception 'Trop de demandes récentes, merci de nous contacter par téléphone';
  end if;

  -- Contact déjà connu : rattachement si e-mail ET téléphone concordent, sinon signalement sans fusion
  v_dups := public._client_duplicate_ids(v_email, v_phone);
  select array_agg(c.id) into v_strong from public.clients c
   where c.merged_into_id is null and v_email is not null and lower(c.email) = v_email
     and v_phone is not null
     and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(v_phone, '\D', '', 'g'), 8);

  if array_length(v_strong, 1) = 1 then
    v_client_id := v_strong[1];
  elsif v_dups is null then
    insert into public.clients (kind, first_name, last_name, company_name, email, phone, source, consents)
    values (case when v_activity = 'mice' and v_company is not null then 'company'::public.client_kind else 'person'::public.client_kind end,
            v_first, coalesce(v_last, case when v_company is null then v_first end), v_company, v_email, v_phone, 'website',
            jsonb_build_object('processing', true, 'marketing', coalesce((p ->> 'marketing_consent')::boolean, false),
                               'collected_at', now(), 'channel', 'website'))
    returning id into v_client_id;
  end if;

  select owner_id into v_owner from public.lead_assignment_rules where activity = v_activity;

  insert into public.leads (client_id, activity, stage, source, owner_id, offer_id, departure_id, destination,
    date_from, date_to, flexible_dates, adults, children, children_ages, budget, message, details, contact_snapshot,
    possible_duplicate_client_ids, marketing_consent, processing_consent, submission_token)
  values (v_client_id, v_activity, 'received', 'website', v_owner,
    nullif(p ->> 'offer_id', '')::uuid, nullif(p ->> 'departure_id', '')::uuid, nullif(p ->> 'destination', ''),
    nullif(p ->> 'date_from', '')::date, nullif(p ->> 'date_to', '')::date, coalesce((p ->> 'flexible_dates')::boolean, false),
    greatest(coalesce((p ->> 'adults')::int, 1), 0), greatest(coalesce((p ->> 'children')::int, 0), 0),
    coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p -> 'children_ages', '[]')) x), '{}'),
    nullif(p ->> 'budget', '')::numeric, nullif(p ->> 'message', ''),
    coalesce(p -> 'details', '{}'::jsonb),
    jsonb_build_object('first_name', v_first, 'last_name', v_last, 'company', v_company, 'email', v_email, 'phone', v_phone),
    case when v_client_id is null then coalesce(v_dups, '{}') else '{}' end,
    coalesce((p ->> 'marketing_consent')::boolean, false), true, v_token)
  on conflict (submission_token) do nothing
  returning * into v_lead;

  if v_lead.id is null then
    select * into v_lead from public.leads where submission_token = v_token;
    return jsonb_build_object('reference', v_lead.reference, 'duplicate_submission', true);
  end if;

  -- Notification interne (la demande reste conservée même si la notification échoue)
  insert into public.outbox_messages (channel, recipient, subject, body, lead_id, status, dedupe_key)
  values ('internal', coalesce(v_owner::text, 'file-a-attribuer'), 'Nouvelle demande ' || v_lead.reference,
          format('Demande %s (%s) reçue depuis le site.', v_lead.reference, v_activity), v_lead.id, 'approved',
          'lead-notify:' || v_lead.id);

  return jsonb_build_object('reference', v_lead.reference, 'duplicate_submission', false,
                            'assigned', v_owner is not null);
end;
$$;
revoke all on function public.submit_site_request(jsonb) from public;
grant execute on function public.submit_site_request(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Tableau de bord quotidien (section 3) — chaque indicateur ouvre la liste filtrée
-- ---------------------------------------------------------------------
create or replace function public.dashboard_counters()
returns jsonb
language plpgsql stable security invoker
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if public.has_perm('dossiers', 'read') then
    v := v || jsonb_build_object(
      'departures_7d', (select count(*) from public.dossiers where status in ('confirmed', 'booking', 'accepted') and start_date between current_date and current_date + 7),
      'options_to_confirm', (select count(*) from public.services where status = 'option'),
      'options_expiring_48h', (select count(*) from public.services where status = 'option' and option_deadline < now() + interval '48 hours'),
      'unconfirmed_services', (select count(*) from public.services s join public.dossiers d on d.id = s.dossier_id
                                where s.status in ('requested', 'option') and d.status not in ('cancelled', 'archived')),
      'services_to_review', (select count(*) from public.services where needs_review),
      'missing_documents', (select count(*) from public.dossier_checks where status in ('to_complete', 'blocking') and code like 'doc:%'),
      'deadlines_to_complete', (select count(*) from public.external_deadlines where due_at is null and status = 'open'),
      'ticket_issue_48h', (select count(*) from public.external_deadlines where kind = 'ticket_issue' and status = 'open' and due_at < now() + interval '48 hours'),
      'open_alerts', (select count(*) from public.alerts where status = 'to_review'));
  end if;
  if public.has_perm('crm', 'read') then
    v := v || jsonb_build_object(
      'unanswered_leads', (select count(*) from public.leads where stage = 'received'),
      'unassigned_leads', (select count(*) from public.leads where owner_id is null and stage not in ('won', 'lost')),
      'quotes_to_follow_up', (select count(*) from public.quotes q where q.status = 'sent'
                                and exists (select 1 from public.quote_versions v where v.quote_id = q.id and v.sent_at < now() - interval '3 days')));
  end if;
  if public.has_perm('tasks', 'read') then
    v := v || jsonb_build_object(
      'overdue_tasks', (select count(*) from public.tasks where status not in ('done', 'cancelled') and due_at < now()),
      'unassigned_tasks', (select count(*) from public.tasks where status not in ('done', 'cancelled') and assignee_id is null));
  end if;
  if public.has_perm('finance', 'read') then
    v := v || jsonb_build_object(
      'client_overdue_amount', (select coalesce(sum(overdue), 0) from public.dossier_financials),
      'client_due_7d', (select coalesce(sum(s.amount), 0) from public.payment_schedule_items s where s.due_date between current_date and current_date + 7),
      'supplier_due_7d', (select coalesce(sum(remaining), 0) from public.supplier_invoice_balances where status = 'validated' and due_date <= current_date + 7 and remaining > 0),
      'refunds_pending', (select count(*) from public.tickets where status = 'refund_expected'),
      'cheques_to_deposit', (select count(*) from public.payments where method in ('cheque', 'bill') and status = 'received'),
      'unallocated_payments', (select count(*) from public.payment_unallocated where unallocated > 0 and status = 'validated'));
  end if;
  return v;
end;
$$;

-- Indicateurs direction : ventes, encaissements, coûts et marges (FIN07)
create or replace function public.management_kpis(p_from date, p_to date)
returns table (
  dimension text, key text, sales_planned numeric, invoiced_net numeric, collected numeric,
  cost_planned numeric, margin_forecast numeric, provisional_count bigint)
language sql stable security invoker
as $$
  select 'activity', f.activity::text, sum(f.sale_net), sum(f.invoiced_net), sum(f.paid),
         sum(f.cost_planned), sum(f.margin_forecast), count(*) filter (where f.margin_state = 'provisional')
    from public.dossier_financials f
   where f.start_date between p_from and p_to and f.status <> 'cancelled'
   group by f.activity
  union all
  select 'owner', coalesce(s.full_name, '—'), sum(f.sale_net), sum(f.invoiced_net), sum(f.paid),
         sum(f.cost_planned), sum(f.margin_forecast), count(*) filter (where f.margin_state = 'provisional')
    from public.dossier_financials f left join public.staff_profiles s on s.id = f.owner_id
   where f.start_date between p_from and p_to and f.status <> 'cancelled'
   group by s.full_name
  union all
  select 'destination', coalesce(d.destination, '—'), sum(f.sale_net), sum(f.invoiced_net), sum(f.paid),
         sum(f.cost_planned), sum(f.margin_forecast), count(*) filter (where f.margin_state = 'provisional')
    from public.dossier_financials f join public.dossiers d on d.id = f.dossier_id
   where f.start_date between p_from and p_to and f.status <> 'cancelled'
   group by d.destination
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
create trigger connectors_audit after insert or update on public.integration_connectors for each row execute function public.tg_audit();
create trigger import_templates_audit after insert or update on public.import_templates for each row execute function public.tg_audit();
create trigger hotel_booking_requests_touch before update on public.hotel_booking_requests for each row execute function public.tg_touch_updated_at();

alter table public.integration_connectors enable row level security;
alter table public.api_call_logs enable row level security;
alter table public.hotel_booking_requests enable row level security;
alter table public.import_templates enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.external_records enable row level security;

create policy connectors_select on public.integration_connectors for select to authenticated using (public.has_perm('integrations', 'read'));
create policy connectors_write on public.integration_connectors for update to authenticated using (public.has_perm('integrations', 'update')) with check (public.has_perm('integrations', 'update'));
create policy api_logs_select on public.api_call_logs for select to authenticated using (public.has_perm('integrations', 'read'));
create policy booking_requests_select on public.hotel_booking_requests for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy booking_requests_write on public.hotel_booking_requests for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));
create policy import_templates_select on public.import_templates for select to authenticated using (public.has_perm('imports', 'read'));
create policy import_templates_write on public.import_templates for all to authenticated using (public.has_perm('imports', 'validate')) with check (public.has_perm('imports', 'validate'));
create policy import_batches_select on public.import_batches for select to authenticated using (public.has_perm('imports', 'read'));
create policy import_batches_write on public.import_batches for all to authenticated using (public.has_perm('imports', 'create')) with check (public.has_perm('imports', 'create'));
create policy import_rows_select on public.import_rows for select to authenticated using (public.has_perm('imports', 'read'));
create policy import_rows_write on public.import_rows for all to authenticated using (public.has_perm('imports', 'create')) with check (public.has_perm('imports', 'create'));
create policy external_records_select on public.external_records for select to authenticated using (public.has_perm('imports', 'read'));
