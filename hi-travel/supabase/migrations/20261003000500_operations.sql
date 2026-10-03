-- =====================================================================
-- Opérations : documents, tâches, échéances, contrôles avant départ,
-- incidents, alertes, messages sortants, espace client, règles de confirmation
-- =====================================================================

-- ---------------------------------------------------------------------
-- Espace client : lien compte authentifié ↔ fiche client
-- ---------------------------------------------------------------------
create table public.client_accounts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  client_id   uuid not null references public.clients (id),
  created_at  timestamptz not null default now()
);

create or replace function public.portal_client_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select client_id from public.client_accounts where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Documents (fichiers dans le bucket privé « documents »)
-- ---------------------------------------------------------------------
create type public.document_kind as enum (
  'passport', 'id_card', 'visa', 'photo', 'voucher', 'ticket', 'program', 'quote_pdf', 'invoice_pdf',
  'receipt', 'contract', 'supplier_confirmation', 'supplier_invoice', 'payment_proof', 'import_source', 'other'
);

create table public.documents (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.document_kind not null default 'other',
  title               text not null,
  storage_path        text not null unique,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes > 0 and size_bytes <= 15 * 1024 * 1024),
  sensitive           boolean not null default false,
  client_id           uuid references public.clients (id),
  dossier_id          uuid references public.dossiers (id) on delete cascade,
  service_id          uuid references public.services (id) on delete set null,
  traveller_id        uuid references public.travellers (id),
  supplier_id         uuid references public.suppliers (id),
  published_to_client boolean not null default false,
  uploaded_via        text not null default 'backoffice' check (uploaded_via in ('backoffice', 'portal', 'import', 'system')),
  uploaded_by         uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  constraint documents_mime_chk check (mime_type in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
);
create index documents_dossier_idx on public.documents (dossier_id);

-- Les pièces d'identité sont toujours sensibles
create or replace function public.tg_documents_sensitive()
returns trigger
language plpgsql
as $$
begin
  if new.kind in ('passport', 'id_card', 'visa', 'photo') then
    new.sensitive := true;
  end if;
  if new.sensitive and new.published_to_client and new.uploaded_via <> 'portal' then
    -- Un document sensible n'est jamais publié automatiquement
    new.published_to_client := false;
  end if;
  return new;
end;
$$;
create trigger documents_sensitive before insert or update on public.documents
  for each row execute function public.tg_documents_sensitive();

create table public.document_access_log (
  id           bigint generated always as identity primary key,
  document_id  uuid not null references public.documents (id) on delete cascade,
  user_id      uuid,
  action       text not null check (action in ('view', 'download', 'upload', 'publish', 'unpublish')),
  created_at   timestamptz not null default now()
);

alter table public.services
  add constraint services_confirmation_doc_fk foreign key (confirmation_document_id) references public.documents (id);
alter table public.supplier_contracts
  add constraint supplier_contracts_doc_fk foreign key (document_id) references public.documents (id);

-- Accès à un document (utilisé aussi par les règles du stockage)
create or replace function public.can_read_document(p_doc public.documents)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_staff() then
      public.has_perm('documents', 'read') and (not p_doc.sensitive or public.has_perm('identity', 'read'))
    else
      p_doc.client_id is not null and p_doc.client_id = public.portal_client_id()
      and (p_doc.published_to_client or p_doc.uploaded_via = 'portal')
  end
$$;

-- ---------------------------------------------------------------------
-- Échéances externes contractuelles (jamais inventées — DEL01/DEL02)
-- ---------------------------------------------------------------------
create table public.external_deadlines (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.dossiers (id) on delete cascade,
  service_id      uuid references public.services (id) on delete cascade,
  kind            text not null check (kind in ('ticket_issue', 'option_expiry', 'hotel_payment', 'supplier_payment', 'visa_appointment', 'rooming_list', 'other')),
  label           text not null,
  due_at          timestamptz,              -- null = « délai à compléter »
  timezone        text not null default 'Africa/Tunis',
  source          text check (source in ('supplier', 'api', 'report', 'manual')),
  source_note     text,
  received_at     timestamptz,
  needs_recheck   boolean not null default false,
  status          text not null default 'open' check (status in ('open', 'met', 'missed', 'cancelled')),
  created_at      timestamptz not null default now(),
  constraint external_deadlines_source_chk check (due_at is null or source is not null)
);

-- ---------------------------------------------------------------------
-- Tâches (affectation manuelle en phase 1)
-- ---------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'waiting_client', 'waiting_supplier', 'blocked', 'done', 'cancelled');

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  dossier_id        uuid references public.dossiers (id) on delete cascade,
  service_id        uuid references public.services (id) on delete set null,
  deadline_id       uuid references public.external_deadlines (id) on delete set null,
  activity          public.activity,
  assignee_id       uuid references public.staff_profiles (id),
  created_by        uuid default auth.uid(),
  status            public.task_status not null default 'todo',
  due_at            timestamptz,
  financial_risk    boolean not null default false,
  manual_priority   text check (manual_priority in ('red', 'orange', 'planned')),
  manual_priority_reason text,
  waiting_reason    text,
  last_action_at    timestamptz,
  next_follow_up_at timestamptz,
  completion_note   text,
  proof_document_id uuid references public.documents (id),
  dedupe_key        text unique,
  source            text not null default 'manual',
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tasks_manual_priority_reason_chk check (manual_priority is null or manual_priority_reason is not null),
  constraint tasks_waiting_reason_chk check (status not in ('waiting_client', 'waiting_supplier', 'blocked') or waiting_reason is not null),
  constraint tasks_done_proof_chk check (status <> 'done' or completion_note is not null or proof_document_id is not null)
);
create index tasks_assignee_idx on public.tasks (assignee_id, status, due_at);

-- Priorité explicable par règles vérifiables (JOU02) — fonctionne sans IA
create or replace function public.task_priority(t public.tasks, p_now timestamptz default now())
returns table (level text, reason text)
language plpgsql stable
as $$
declare
  v_red_hours int := coalesce((select (value ->> 'red_hours')::int from public.app_settings where key = 'priority_thresholds'), 4);
  v_dep_date date;
begin
  if t.status in ('done', 'cancelled') then
    return query select 'done'::text, 'Terminée'::text; return;
  end if;
  if t.manual_priority is not null then
    return query select t.manual_priority, 'Priorité manuelle : ' || t.manual_priority_reason; return;
  end if;
  if t.due_at is null then
    if t.deadline_id is not null then
      return query select 'orange'::text, 'Délai fournisseur à compléter'::text; return;
    end if;
    return query select 'planned'::text, 'Sans échéance'::text; return;
  end if;
  if t.due_at < p_now then
    return query select 'red'::text, 'Échéance dépassée'::text; return;
  end if;
  if t.due_at < p_now + make_interval(hours => v_red_hours) then
    return query select 'red'::text, format('Échéance dans moins de %s h', v_red_hours); return;
  end if;
  if t.dossier_id is not null then
    select start_date into v_dep_date from public.dossiers where id = t.dossier_id;
    if v_dep_date is not null and v_dep_date <= (p_now at time zone 'Africa/Tunis')::date + 1 then
      return query select 'red'::text, 'Départ demain ou aujourd''hui'::text; return;
    end if;
  end if;
  if (t.due_at at time zone 'Africa/Tunis')::date <= (p_now at time zone 'Africa/Tunis')::date then
    return query select 'orange'::text, case when t.financial_risk then 'À faire aujourd''hui — risque financier' else 'À faire aujourd''hui' end; return;
  end if;
  if t.financial_risk and t.due_at < p_now + interval '2 days' then
    return query select 'orange'::text, 'Risque financier approchant'::text; return;
  end if;
  return query select 'planned'::text, 'Tâche future sans risque identifié'::text;
end;
$$;

create view public.task_board
with (security_invoker = true)
as
select t.*, p.level as priority, p.reason as priority_reason,
       d.reference as dossier_reference, d.start_date as dossier_start_date,
       c.display_name as client_name, s.full_name as assignee_name,
       case p.level when 'red' then 1 when 'orange' then 2 when 'planned' then 3 else 4 end as priority_rank
from public.tasks t
cross join lateral public.task_priority(t) p
left join public.dossiers d on d.id = t.dossier_id
left join public.clients c on c.id = d.client_id
left join public.staff_profiles s on s.id = t.assignee_id;

create or replace function public.tg_tasks_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.last_action_at := now();
    if new.status = 'done' then new.completed_at := now(); end if;
  end if;
  return new;
end;
$$;
create trigger tasks_status before update on public.tasks for each row execute function public.tg_tasks_status();

-- ---------------------------------------------------------------------
-- Contrôle avant départ (DEP01) et incidents
-- ---------------------------------------------------------------------
create table public.dossier_checks (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.dossiers (id) on delete cascade,
  service_id    uuid references public.services (id) on delete cascade,
  category      text not null check (category in ('operations', 'finance')),
  code          text not null,
  label         text not null,
  status        text not null default 'to_complete' check (status in ('ok', 'to_complete', 'blocking', 'na')),
  owner_id      uuid references public.staff_profiles (id),
  proof_document_id uuid references public.documents (id),
  note          text,
  updated_at    timestamptz not null default now(),
  unique (dossier_id, code)
);

create table public.incidents (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid references public.dossiers (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id),
  kind          text not null default 'incident' check (kind in ('incident', 'complaint', 'modification', 'cancellation')),
  title         text not null,
  description   text,
  owner_id      uuid references public.staff_profiles (id),
  due_at        timestamptz,
  cost_impact   numeric(14,3),
  status        text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  resolution    text,
  created_at    timestamptz not null default now()
);

-- Anomalies (file simple en phase 1 ; centre de contrôle complet en phase 2)
create table public.alerts (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  severity      text not null default 'orange' check (severity in ('red', 'orange', 'info')),
  title         text not null,
  details       jsonb not null default '{}'::jsonb,
  dossier_id    uuid references public.dossiers (id) on delete cascade,
  service_id    uuid references public.services (id) on delete cascade,
  owner_id      uuid references public.staff_profiles (id),
  status        text not null default 'to_review' check (status in ('to_review', 'justified', 'corrected', 'resolved')),
  resolution_note text,
  resolved_by   uuid,
  dedupe_key    text unique,
  created_at    timestamptz not null default now(),
  constraint alerts_justified_chk check (status <> 'justified' or resolution_note is not null)
);

-- Messages sortants : préparés et relus, jamais envoyés automatiquement tant que le canal n'est pas activé
create table public.outbox_messages (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('email', 'whatsapp', 'sms', 'internal')),
  recipient     text not null,
  subject       text,
  body          text not null,
  dossier_id    uuid references public.dossiers (id) on delete cascade,
  lead_id       uuid references public.leads (id) on delete cascade,
  status        text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'failed', 'blocked_channel_disabled')),
  provider_ref  text,
  dedupe_key    text unique,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

-- ---------------------------------------------------------------------
-- Contrôle des changements : vol modifié → transferts liés à revoir (REC04)
-- ---------------------------------------------------------------------
create or replace function public.tg_services_change_impact()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_ref text;
begin
  if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at
     or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    select reference into v_ref from public.dossiers where id = new.dossier_id;
    for r in
      select s.id, s.description, s.service_type from public.services s
       where s.dossier_id = new.dossier_id and s.id <> new.id and s.status <> 'cancelled'
         and (s.linked_service_id = new.id or new.linked_service_id = s.id)
    loop
      -- Signalement sans déplacement ni confirmation automatique
      update public.services
         set needs_review = true,
             review_reason = format('Prestation liée « %s » modifiée le %s', new.description, to_char(now(), 'DD/MM/YYYY HH24:MI'))
       where id = r.id;
      insert into public.tasks (title, description, dossier_id, service_id, dedupe_key, source, due_at)
      values (format('Vérifier %s suite à modification', r.description),
              format('La prestation « %s » du dossier %s a changé (dates/horaires). Vérifier et revalider « %s ».', new.description, v_ref, r.description),
              new.dossier_id, r.id,
              format('change:%s:%s:%s', r.id, new.id, extract(epoch from now())::bigint),
              'trigger:service_changed', now() + interval '4 hours');
    end loop;

    -- Contrôles avant départ concernés rouverts
    update public.dossier_checks set status = 'to_complete', note = 'Rouvert suite à modification'
     where dossier_id = new.dossier_id and (service_id = new.id or service_id in (
       select id from public.services where linked_service_id = new.id))
       and status = 'ok';
    -- Échéances externes à revérifier
    update public.external_deadlines set needs_recheck = true where service_id = new.id and status = 'open';
  end if;

  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end;
$$;
create trigger services_change_impact before update on public.services
  for each row execute function public.tg_services_change_impact();

-- ---------------------------------------------------------------------
-- Confirmation d'un dossier : prérequis ou dérogation motivée
-- ---------------------------------------------------------------------
create or replace function public.dossier_confirmation_blockers(p_dossier_id uuid)
returns table (code text, message text)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_deposit numeric(14,3);
  v_paid numeric(14,3);
begin
  return query
    select 'service_unconfirmed'::text, format('Prestation obligatoire non confirmée : %s', s.description)
      from public.services s
     where s.dossier_id = p_dossier_id and s.is_mandatory and s.status not in ('confirmed', 'cancelled');

  return query
    select 'document_missing'::text, format('Document manquant : %s', c.label)
      from public.dossier_checks c
     where c.dossier_id = p_dossier_id and c.category = 'operations' and c.code like 'doc:%' and c.status in ('to_complete', 'blocking');

  select coalesce(sum(amount), 0) into v_deposit
    from public.payment_schedule_items where dossier_id = p_dossier_id and kind = 'deposit';
  v_paid := public.dossier_paid_amount(p_dossier_id);
  if v_deposit > 0 and v_paid < v_deposit then
    return query select 'deposit_missing'::text,
      format('Acompte non satisfait : %s TND reçus sur %s TND', to_char(v_paid, 'FM999G999G990D000'), to_char(v_deposit, 'FM999G999G990D000'));
  end if;
end;
$$;

create or replace function public.confirm_dossier(p_dossier_id uuid, p_derogation_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_blockers text;
  v_status public.dossier_status;
begin
  perform public.require_perm('dossiers', 'update');
  select status into v_status from public.dossiers where id = p_dossier_id for update;
  if v_status not in ('accepted', 'booking') then
    raise exception 'Confirmation impossible depuis le statut %', v_status;
  end if;
  select string_agg(message, E'\n') into v_blockers from public.dossier_confirmation_blockers(p_dossier_id);
  if v_blockers is not null then
    if p_derogation_reason is null or length(trim(p_derogation_reason)) < 5 then
      raise exception E'Dossier non confirmable :\n%', v_blockers using errcode = 'P0001';
    end if;
    perform public.require_perm('dossiers', 'validate');
    if exists (select 1 from public.dossier_confirmation_blockers(p_dossier_id) b where b.code = 'document_missing') then
      raise exception 'Une dérogation ne peut pas remplacer un document obligatoire';
    end if;
    perform set_config('app.change_reason', 'Dérogation : ' || p_derogation_reason, true);
    update public.dossiers
       set status = 'confirmed', derogation_reason = p_derogation_reason, derogation_by = auth.uid(), derogation_at = now()
     where id = p_dossier_id;
  else
    update public.dossiers set status = 'confirmed' where id = p_dossier_id;
  end if;
end;
$$;

-- Transitions de statut commercial contrôlées
create or replace function public.set_dossier_status(p_dossier_id uuid, p_status public.dossier_status, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_cur public.dossier_status;
begin
  perform public.require_perm('dossiers', 'update');
  select status into v_cur from public.dossiers where id = p_dossier_id for update;
  if p_status = 'confirmed' then
    perform public.confirm_dossier(p_dossier_id, p_reason); return;
  end if;
  if not (
       (v_cur = 'accepted' and p_status in ('booking', 'cancelled'))
    or (v_cur = 'booking' and p_status in ('cancelled'))
    or (v_cur = 'confirmed' and p_status in ('travelling', 'booking', 'cancelled'))
    or (v_cur = 'travelling' and p_status = 'completed')
    or (v_cur = 'completed' and p_status = 'archived')
    or (v_cur in ('request', 'quote_prepared', 'quote_sent') and p_status in ('accepted', 'cancelled'))
  ) then
    raise exception 'Transition % → % non autorisée', v_cur, p_status;
  end if;
  if p_status = 'cancelled' and p_reason is null then
    raise exception 'Motif d''annulation obligatoire';
  end if;
  if p_status = 'archived' and (select financial_status from public.dossiers where id = p_dossier_id) not in ('closed', 'closed_with_exception') then
    raise exception 'Archivage impossible avant clôture financière';
  end if;
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update public.dossiers
     set status = p_status,
         cancelled_reason = case when p_status = 'cancelled' then p_reason else cancelled_reason end
   where id = p_dossier_id;
end;
$$;

-- Checklist avant départ générée selon les prestations (applicable aux neuf modules)
create or replace function public.generate_departure_checklist(p_dossier_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  perform public.require_perm('dossiers', 'update');
  insert into public.dossier_checks (dossier_id, service_id, category, code, label)
  select p_dossier_id, s.id, 'operations', 'confirm:' || s.id, 'Confirmation fournisseur : ' || s.description
    from public.services s where s.dossier_id = p_dossier_id and s.status <> 'cancelled'
  on conflict (dossier_id, code) do nothing;

  insert into public.dossier_checks (dossier_id, service_id, category, code, label)
  select p_dossier_id, s.id, 'operations', 'ticket:' || s.id, 'Billets émis et noms vérifiés : ' || s.description
    from public.services s where s.dossier_id = p_dossier_id and s.service_type = 'flight' and s.status <> 'cancelled'
  on conflict (dossier_id, code) do nothing;

  insert into public.dossier_checks (dossier_id, service_id, category, code, label)
  select p_dossier_id, s.id, 'operations', 'visa:' || s.id, 'Situation visa : ' || s.description
    from public.services s where s.dossier_id = p_dossier_id and s.service_type = 'visa' and s.status <> 'cancelled'
  on conflict (dossier_id, code) do nothing;

  insert into public.dossier_checks (dossier_id, service_id, category, code, label)
  select p_dossier_id, s.id, 'operations', 'transport:' || s.id, 'Horaires et contacts transport : ' || s.description
    from public.services s where s.dossier_id = p_dossier_id and s.service_type in ('transfer', 'transport') and s.status <> 'cancelled'
  on conflict (dossier_id, code) do nothing;

  insert into public.dossier_checks (dossier_id, category, code, label) values
    (p_dossier_id, 'operations', 'doc:travellers', 'Noms et documents voyageurs nécessaires'),
    (p_dossier_id, 'operations', 'vouchers', 'Vouchers et programme remis au client'),
    (p_dossier_id, 'finance', 'finance:schedule', 'Situation financière conforme à l''échéancier'),
    (p_dossier_id, 'finance', 'finance:suppliers', 'Engagements fournisseurs à honorer identifiés')
  on conflict (dossier_id, code) do nothing;

  select count(*) into v_count from public.dossier_checks where dossier_id = p_dossier_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers d'audit et horodatage
-- ---------------------------------------------------------------------
create trigger quotes_touch before update on public.quotes for each row execute function public.tg_touch_updated_at();
create trigger dossiers_touch before update on public.dossiers for each row execute function public.tg_touch_updated_at();
create trigger services_touch before update on public.services for each row execute function public.tg_touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.tg_touch_updated_at();
create trigger dossier_checks_touch before update on public.dossier_checks for each row execute function public.tg_touch_updated_at();

create trigger quotes_audit after insert or update or delete on public.quotes for each row execute function public.tg_audit();
create trigger quote_versions_audit after insert or update or delete on public.quote_versions for each row execute function public.tg_audit();
create trigger quote_lines_audit after insert or update or delete on public.quote_lines for each row execute function public.tg_audit();
create trigger dossiers_audit after insert or update or delete on public.dossiers for each row execute function public.tg_audit();
create trigger services_audit after insert or update or delete on public.services for each row execute function public.tg_audit('needs_review', 'review_reason');
create trigger dossier_travellers_audit after insert or update or delete on public.dossier_travellers for each row execute function public.tg_audit();
create trigger schedule_audit after insert or update or delete on public.payment_schedule_items for each row execute function public.tg_audit();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.tg_audit();
create trigger deadlines_audit after insert or update or delete on public.external_deadlines for each row execute function public.tg_audit();
create trigger checks_audit after insert or update or delete on public.dossier_checks for each row execute function public.tg_audit();
create trigger visa_audit after insert or update or delete on public.visa_applications for each row execute function public.tg_audit();
create trigger alerts_audit after insert or update or delete on public.alerts for each row execute function public.tg_audit();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.client_accounts enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_lines enable row level security;
alter table public.dossiers enable row level security;
alter table public.dossier_travellers enable row level security;
alter table public.services enable row level security;
alter table public.flight_segments enable row level security;
alter table public.tickets enable row level security;
alter table public.visa_applications enable row level security;
alter table public.event_participants enable row level security;
alter table public.payment_schedule_items enable row level security;
alter table public.departure_holds enable row level security;
alter table public.documents enable row level security;
alter table public.document_access_log enable row level security;
alter table public.external_deadlines enable row level security;
alter table public.tasks enable row level security;
alter table public.dossier_checks enable row level security;
alter table public.incidents enable row level security;
alter table public.alerts enable row level security;
alter table public.outbox_messages enable row level security;

create policy client_accounts_self on public.client_accounts for select to authenticated using (user_id = auth.uid() or public.has_perm('crm', 'read'));
create policy client_accounts_admin on public.client_accounts for all to authenticated using (public.has_perm('crm', 'update')) with check (public.has_perm('crm', 'update'));

create policy quotes_select on public.quotes for select to authenticated using (public.has_perm('quotes', 'read'));
create policy quotes_insert on public.quotes for insert to authenticated with check (public.has_perm('quotes', 'create'));
create policy quotes_update on public.quotes for update to authenticated using (public.has_perm('quotes', 'update')) with check (public.has_perm('quotes', 'update'));
create policy quote_versions_select on public.quote_versions for select to authenticated using (public.has_perm('quotes', 'read'));
create policy quote_versions_write on public.quote_versions for all to authenticated using (public.has_perm('quotes', 'update')) with check (public.has_perm('quotes', 'update'));
create policy quote_lines_select on public.quote_lines for select to authenticated using (public.has_perm('quotes', 'read'));
create policy quote_lines_write on public.quote_lines for all to authenticated using (public.has_perm('quotes', 'update')) with check (public.has_perm('quotes', 'update'));

-- Dossiers : collaborateurs habilités + client propriétaire (lecture seule)
create policy dossiers_select on public.dossiers for select to authenticated
  using (public.has_perm('dossiers', 'read') or client_id = public.portal_client_id());
create policy dossiers_insert on public.dossiers for insert to authenticated with check (public.has_perm('dossiers', 'create'));
create policy dossiers_update on public.dossiers for update to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));

create policy dossier_travellers_select on public.dossier_travellers for select to authenticated
  using (public.has_perm('dossiers', 'read') or exists (select 1 from public.dossiers d where d.id = dossier_id and d.client_id = public.portal_client_id()));
create policy dossier_travellers_write on public.dossier_travellers for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));

-- Prestations (coûts inclus) : jamais pour le client ni le profil site
create policy services_select on public.services for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy services_insert on public.services for insert to authenticated with check (public.has_perm('dossiers', 'update'));
create policy services_update on public.services for update to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));
create policy services_delete on public.services for delete to authenticated using (public.has_perm('dossiers', 'archive'));

create policy flight_segments_all on public.flight_segments for all to authenticated using (public.has_perm('dossiers', 'read')) with check (public.has_perm('dossiers', 'update'));
create policy tickets_all on public.tickets for all to authenticated using (public.has_perm('dossiers', 'read')) with check (public.has_perm('dossiers', 'update'));
create policy visa_select on public.visa_applications for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy visa_write on public.visa_applications for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));
create policy participants_select on public.event_participants for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy participants_write on public.event_participants for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));

create policy schedule_select on public.payment_schedule_items for select to authenticated
  using (public.has_perm('dossiers', 'read') or public.has_perm('finance', 'read')
         or exists (select 1 from public.dossiers d where d.id = dossier_id and d.client_id = public.portal_client_id()));
create policy schedule_write on public.payment_schedule_items for all to authenticated
  using (public.has_perm('dossiers', 'update') or public.has_perm('finance', 'update'))
  with check (public.has_perm('dossiers', 'update') or public.has_perm('finance', 'update'));

create policy holds_select on public.departure_holds for select to authenticated using (public.has_perm('departures', 'read'));

create policy documents_select on public.documents for select to authenticated using (public.can_read_document(documents));
create policy documents_insert_staff on public.documents for insert to authenticated
  with check (public.has_perm('documents', 'create') and (not sensitive or public.has_perm('identity', 'update')));
create policy documents_insert_portal on public.documents for insert to authenticated
  with check (not public.is_staff() and uploaded_via = 'portal' and client_id = public.portal_client_id()
              and (dossier_id is null or exists (select 1 from public.dossiers d where d.id = dossier_id and d.client_id = public.portal_client_id())));
create policy documents_update on public.documents for update to authenticated using (public.has_perm('documents', 'update')) with check (public.has_perm('documents', 'update'));
create policy document_log_insert on public.document_access_log for insert to authenticated with check (user_id = auth.uid());
create policy document_log_select on public.document_access_log for select to authenticated using (public.has_perm('reports', 'read'));

create policy deadlines_select on public.external_deadlines for select to authenticated using (public.has_perm('tasks', 'read'));
create policy deadlines_write on public.external_deadlines for all to authenticated using (public.has_perm('tasks', 'update')) with check (public.has_perm('tasks', 'update'));
create policy tasks_select on public.tasks for select to authenticated using (public.has_perm('tasks', 'read'));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_perm('tasks', 'create'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_perm('tasks', 'update') or assignee_id = auth.uid())
  with check (public.has_perm('tasks', 'update') or assignee_id = auth.uid());
create policy checks_select on public.dossier_checks for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy checks_write on public.dossier_checks for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));
create policy incidents_select on public.incidents for select to authenticated using (public.has_perm('dossiers', 'read'));
create policy incidents_write on public.incidents for all to authenticated using (public.has_perm('dossiers', 'update')) with check (public.has_perm('dossiers', 'update'));
create policy alerts_select on public.alerts for select to authenticated using (public.has_perm('dossiers', 'read') or public.has_perm('finance', 'read'));
create policy alerts_update on public.alerts for update to authenticated using (public.has_perm('dossiers', 'update') or public.has_perm('finance', 'update')) with check (true);
create policy outbox_select on public.outbox_messages for select to authenticated using (public.has_perm('crm', 'read'));
create policy outbox_write on public.outbox_messages for all to authenticated using (public.has_perm('crm', 'update')) with check (public.has_perm('crm', 'update'));

-- ---------------------------------------------------------------------
-- Stockage : bucket privé, accès contrôlé via la table documents
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 15728640, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/csv', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Images publiques des offres (sans données personnelles)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy documents_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and exists (
    select 1 from public.documents d where d.storage_path = storage.objects.name and public.can_read_document(d)));
create policy documents_objects_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_perm('documents', 'create'));
-- Dépôt client : uniquement sous portal/<client_id>/
create policy documents_objects_portal_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'portal'
              and (storage.foldername(name))[2] = public.portal_client_id()::text);
create policy site_media_write on storage.objects for all to authenticated
  using (bucket_id = 'site-media' and public.has_perm('site', 'update'))
  with check (bucket_id = 'site-media' and public.has_perm('site', 'update'));
