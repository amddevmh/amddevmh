-- =====================================================================
-- Finances et comptabilité (sections 6, 9, 10 — FIN01 à FIN08)
-- Règle d'or : rien n'est effacé ; corrections par avoir, contre-écriture ou contrepassation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Devises, taux datés, règles fiscales par date d'effet (aucun taux figé dans le code)
-- ---------------------------------------------------------------------
create table public.fx_rates (
  id          uuid primary key default gen_random_uuid(),
  currency    char(3) not null,
  rate_to_tnd numeric(14,6) not null check (rate_to_tnd > 0),
  rate_date   date not null,
  source      text not null,
  created_at  timestamptz not null default now(),
  unique (currency, rate_date, source)
);

create table public.tax_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  label           text not null,
  kind            text not null check (kind in ('vat', 'stamp', 'withholding')),
  rate            numeric(7,4),
  fixed_amount    numeric(14,3),
  effective_from  date not null,
  effective_to    date,
  validated_by_accountant boolean not null default false,
  check (rate is not null or fixed_amount is not null),
  unique (code, effective_from)
);

create or replace function public.tax_rule_at(p_code text, p_date date)
returns public.tax_rules
language sql stable
as $$
  select * from public.tax_rules
   where code = p_code and effective_from <= p_date and (effective_to is null or effective_to >= p_date)
   order by effective_from desc limit 1
$$;

-- ---------------------------------------------------------------------
-- Plan comptable, journaux, périodes, écritures
-- ---------------------------------------------------------------------
create table public.accounts (
  code        text primary key check (code ~ '^[0-9]{2,10}$'),
  label       text not null,
  type        text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
  is_auxiliary boolean not null default false,
  allow_posting boolean not null default true,
  active      boolean not null default true
);

create table public.journals (
  code   text primary key,
  label  text not null,
  kind   text not null check (kind in ('sales', 'purchases', 'bank', 'cash', 'misc'))
);

create table public.fiscal_periods (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'open' check (status in ('open', 'closed')),
  closed_at   timestamptz,
  closed_by   uuid,
  check (end_date >= start_date),
  exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

create table public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  journal_code  text not null references public.journals (code),
  entry_date    date not null,
  piece_ref     text,
  label         text not null,
  source_type   text,
  source_id     uuid,
  status        text not null default 'draft' check (status in ('draft', 'posted')),
  number        text unique,
  reversal_of_id uuid references public.journal_entries (id),
  posted_at     timestamptz,
  posted_by     uuid,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index journal_entries_source_idx on public.journal_entries (source_type, source_id);

create table public.journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.journal_entries (id) on delete cascade,
  account_code  text not null,               -- volontairement sans FK : contrôlé à la validation (REC11)
  label         text,
  debit         numeric(14,3) not null default 0 check (debit >= 0),
  credit        numeric(14,3) not null default 0 check (credit >= 0),
  client_id     uuid references public.clients (id),
  supplier_id   uuid references public.suppliers (id),
  dossier_id    uuid references public.dossiers (id),
  departure_id  uuid references public.departures (id),
  check (debit = 0 or credit = 0)
);

create table public.posting_rules (
  event          text primary key,
  journal_code   text not null references public.journals (code),
  debit_account  text not null references public.accounts (code),
  credit_account text not null references public.accounts (code),
  label          text not null,
  validated_by_accountant boolean not null default false
);

create or replace function public.period_is_open(p_date date)
returns boolean
language sql stable
as $$
  select exists (select 1 from public.fiscal_periods
                  where p_date between start_date and end_date and status = 'open')
$$;

-- Validation atomique : toutes les lignes ou aucune (REC11, REC13)
create or replace function public.post_journal_entry(p_entry_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_debit numeric(14,3);
  v_credit numeric(14,3);
  v_count int;
  v_bad text;
  v_number text;
begin
  perform public.require_perm('accounting', 'validate');
  select * into v_entry from public.journal_entries where id = p_entry_id for update;
  if not found then raise exception 'Pièce introuvable'; end if;
  if v_entry.status = 'posted' then raise exception 'Pièce déjà validée'; end if;
  if v_entry.piece_ref is null or length(trim(v_entry.piece_ref)) = 0 then
    raise exception 'Pièce non référencée';
  end if;
  if not public.period_is_open(v_entry.entry_date) then
    raise exception 'Période comptable clôturée ou inexistante pour le %', v_entry.entry_date using errcode = 'P0001';
  end if;
  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_count, v_debit, v_credit from public.journal_lines where entry_id = p_entry_id;
  if v_count < 2 then raise exception 'Une pièce comporte au moins deux lignes'; end if;
  select string_agg(distinct l.account_code, ', ') into v_bad
    from public.journal_lines l left join public.accounts a on a.code = l.account_code
   where l.entry_id = p_entry_id and (a.code is null or not a.active or not a.allow_posting);
  if v_bad is not null then
    raise exception 'Compte inexistant ou non autorisé : %', v_bad using errcode = 'P0001';
  end if;
  if v_debit <> v_credit then
    raise exception 'Pièce déséquilibrée : débit % ≠ crédit %', v_debit, v_credit using errcode = 'P0001';
  end if;
  if v_debit = 0 then raise exception 'Pièce de montant nul'; end if;

  v_number := public.next_number('JOURNAL_' || v_entry.journal_code, v_entry.entry_date);
  update public.journal_entries
     set status = 'posted', posted_at = now(), posted_by = auth.uid(), number = v_number
   where id = p_entry_id;
  return v_number;
end;
$$;

-- Une écriture validée est intangible
create or replace function public.tg_journal_immutable()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if tg_table_name = 'journal_entries' then
    if old.status = 'posted' then
      raise exception 'Écriture validée : correction par contrepassation uniquement';
    end if;
    return coalesce(new, old);
  end if;
  select status into v_status from public.journal_entries where id = coalesce(new.entry_id, old.entry_id);
  if v_status = 'posted' then
    raise exception 'Écriture validée : correction par contrepassation uniquement';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger journal_entries_immutable before update or delete on public.journal_entries
  for each row when (old.status = 'posted') execute function public.tg_journal_immutable();
create trigger journal_lines_immutable before insert or update or delete on public.journal_lines
  for each row execute function public.tg_journal_immutable();

create or replace function public.reverse_journal_entry(p_entry_id uuid, p_reason text, p_date date default current_date)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_src public.journal_entries;
  v_new uuid;
begin
  perform public.require_perm('accounting', 'validate');
  if p_reason is null then raise exception 'Motif de contrepassation obligatoire'; end if;
  select * into v_src from public.journal_entries where id = p_entry_id;
  if v_src.status <> 'posted' then raise exception 'Seule une écriture validée se contrepasse'; end if;
  insert into public.journal_entries (journal_code, entry_date, piece_ref, label, source_type, source_id, reversal_of_id)
  values (v_src.journal_code, p_date, v_src.piece_ref, 'Contrepassation : ' || v_src.label || ' — ' || p_reason,
          v_src.source_type, v_src.source_id, v_src.id)
  returning id into v_new;
  insert into public.journal_lines (entry_id, account_code, label, debit, credit, client_id, supplier_id, dossier_id, departure_id)
  select v_new, account_code, label, credit, debit, client_id, supplier_id, dossier_id, departure_id
    from public.journal_lines where entry_id = p_entry_id;
  perform public.post_journal_entry(v_new);
  return v_new;
end;
$$;

create or replace function public.close_fiscal_period(p_period_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_period public.fiscal_periods;
begin
  perform public.require_perm('accounting', 'validate');
  select * into v_period from public.fiscal_periods where id = p_period_id for update;
  if exists (select 1 from public.journal_entries
              where status = 'draft' and entry_date between v_period.start_date and v_period.end_date) then
    raise exception 'Des écritures en brouillard restent à valider sur la période';
  end if;
  update public.fiscal_periods set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_period_id;
end;
$$;

-- Réouverture réservée à un profil habilité, historisée
create or replace function public.reopen_fiscal_period(p_period_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_perm('settings', 'validate');
  if p_reason is null then raise exception 'Motif de réouverture obligatoire'; end if;
  perform set_config('app.change_reason', p_reason, true);
  update public.fiscal_periods set status = 'open', closed_at = null, closed_by = null where id = p_period_id;
end;
$$;

-- Génération d'une écriture en brouillard à partir d'une règle approuvée
create or replace function public.draft_entry_from_rule(
  p_event text, p_date date, p_piece_ref text, p_label text, p_amount numeric,
  p_source_type text, p_source_id uuid, p_client_id uuid default null, p_supplier_id uuid default null,
  p_dossier_id uuid default null, p_debit_override text default null, p_credit_override text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_rule public.posting_rules;
  v_id uuid;
begin
  select * into v_rule from public.posting_rules where event = p_event;
  if not found or coalesce(p_amount, 0) = 0 then return null; end if;
  insert into public.journal_entries (journal_code, entry_date, piece_ref, label, source_type, source_id)
  values (v_rule.journal_code, p_date, p_piece_ref, p_label, p_source_type, p_source_id)
  returning id into v_id;
  insert into public.journal_lines (entry_id, account_code, label, debit, credit, client_id, supplier_id, dossier_id) values
    (v_id, coalesce(p_debit_override, v_rule.debit_account), p_label, abs(p_amount), 0, p_client_id, p_supplier_id, p_dossier_id),
    (v_id, coalesce(p_credit_override, v_rule.credit_account), p_label, 0, abs(p_amount), p_client_id, p_supplier_id, p_dossier_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Factures, pro formas, avoirs (FIN01)
-- ---------------------------------------------------------------------
create type public.invoice_kind as enum ('proforma', 'invoice', 'credit_note');
create type public.invoice_status as enum ('draft', 'validated', 'cancelled');

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.invoice_kind not null default 'invoice',
  number              text unique,
  status              public.invoice_status not null default 'draft',
  client_id           uuid not null references public.clients (id),
  dossier_id          uuid references public.dossiers (id),
  departure_id        uuid references public.departures (id),
  original_invoice_id uuid references public.invoices (id),
  reason              text,
  issue_date          date,
  due_date            date,
  currency            char(3) not null default 'TND',
  total_ht            numeric(14,3) not null default 0,
  total_tax           numeric(14,3) not null default 0,
  stamp_amount        numeric(14,3) not null default 0,
  total_ttc           numeric(14,3) not null default 0,
  notes               text,
  document_id         uuid references public.documents (id),
  created_by          uuid default auth.uid(),
  validated_by        uuid,
  validated_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint invoices_credit_note_chk check (
    (kind = 'credit_note') = (original_invoice_id is not null)
    and (kind <> 'credit_note' or reason is not null))
);
create index invoices_client_idx on public.invoices (client_id, status);
create index invoices_dossier_idx on public.invoices (dossier_id);

create table public.invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices (id) on delete cascade,
  position      int not null default 0,
  activity      public.activity,
  service_id    uuid references public.services (id),
  description   text not null,
  quantity      numeric(10,2) not null default 1 check (quantity > 0),
  unit_price    numeric(14,3) not null check (unit_price >= 0),
  tax_code      text,
  tax_rate      numeric(7,4) not null default 0,
  total_ht      numeric(14,3) generated always as (round(quantity * unit_price, 3)) stored,
  tax_amount    numeric(14,3) generated always as (round(round(quantity * unit_price, 3) * tax_rate, 3)) stored
);

-- Facture validée = figée (seul le PDF généré peut être rattaché)
create or replace function public.tg_invoices_frozen()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'invoices' then
    if old.status = 'validated' then
      if tg_op = 'DELETE' then raise exception 'Facture validée : suppression interdite'; end if;
      if (to_jsonb(new) - 'document_id') is distinct from (to_jsonb(old) - 'document_id') then
        raise exception 'Facture validée figée : passer par un avoir';
      end if;
    end if;
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.invoices i where i.id = coalesce(new.invoice_id, old.invoice_id) and i.status <> 'draft') then
    raise exception 'Lignes d''une facture non brouillon non modifiables';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger invoices_frozen before update or delete on public.invoices
  for each row execute function public.tg_invoices_frozen();
create trigger invoice_lines_frozen before insert or update or delete on public.invoice_lines
  for each row execute function public.tg_invoices_frozen();

-- Net d'une facture après avoirs validés
create or replace function public.invoice_credited_amount(p_invoice_id uuid)
returns numeric
language sql stable
as $$
  select coalesce(sum(total_ttc), 0) from public.invoices
   where original_invoice_id = p_invoice_id and kind = 'credit_note' and status = 'validated'
$$;

create or replace function public.validate_invoice(p_invoice_id uuid, p_issue_date date default current_date)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invoices;
  v_ht numeric(14,3);
  v_tax numeric(14,3);
  v_stamp numeric(14,3) := 0;
  v_stamp_rule public.tax_rules;
  v_number text;
  v_orig public.invoices;
  v_label text;
begin
  perform public.require_perm('finance', 'validate');
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Facture introuvable'; end if;
  if v_inv.status <> 'draft' then raise exception 'Seul un brouillon peut être validé'; end if;

  select coalesce(sum(total_ht), 0), coalesce(sum(tax_amount), 0) into v_ht, v_tax
    from public.invoice_lines where invoice_id = p_invoice_id;
  if v_ht <= 0 then raise exception 'Facture sans ligne chiffrée'; end if;

  if v_inv.kind = 'invoice' then
    v_stamp_rule := public.tax_rule_at('STAMP', p_issue_date);
    v_stamp := coalesce(v_stamp_rule.fixed_amount, 0);
  end if;

  if v_inv.kind = 'credit_note' then
    select * into v_orig from public.invoices where id = v_inv.original_invoice_id;
    if v_orig.status <> 'validated' or v_orig.kind <> 'invoice' then
      raise exception 'Un avoir référence une facture validée';
    end if;
    if v_ht + v_tax > v_orig.total_ttc - public.invoice_credited_amount(v_orig.id) then
      raise exception 'Avoir supérieur au montant restant de la facture d''origine';
    end if;
  end if;

  v_number := public.next_number(case v_inv.kind when 'invoice' then 'INVOICE' when 'credit_note' then 'CREDIT_NOTE' else 'PROFORMA' end, p_issue_date);

  update public.invoices
     set status = 'validated', number = v_number, issue_date = p_issue_date,
         due_date = coalesce(due_date, p_issue_date + 30),
         total_ht = v_ht, total_tax = v_tax, stamp_amount = v_stamp, total_ttc = v_ht + v_tax + v_stamp,
         validated_by = auth.uid(), validated_at = now()
   where id = p_invoice_id;

  -- Pro formas : aucun chiffre d'affaires ni écriture
  if v_inv.kind = 'invoice' then
    v_label := 'Facture ' || v_number;
    perform public.draft_entry_from_rule('invoice_revenue', p_issue_date, v_number, v_label, v_ht, 'invoice', p_invoice_id, v_inv.client_id, null, v_inv.dossier_id);
    perform public.draft_entry_from_rule('invoice_tax', p_issue_date, v_number, v_label || ' — taxes', v_tax, 'invoice', p_invoice_id, v_inv.client_id, null, v_inv.dossier_id);
    perform public.draft_entry_from_rule('invoice_stamp', p_issue_date, v_number, v_label || ' — timbre', v_stamp, 'invoice', p_invoice_id, v_inv.client_id, null, v_inv.dossier_id);
  elsif v_inv.kind = 'credit_note' then
    v_label := 'Avoir ' || v_number || ' sur ' || v_orig.number;
    perform public.draft_entry_from_rule('credit_note', p_issue_date, v_number, v_label, v_ht + v_tax, 'invoice', p_invoice_id, v_inv.client_id, null, v_inv.dossier_id);
  end if;
  return v_number;
end;
$$;

-- Un brouillon peut être annulé ; une facture validée se corrige par avoir
create or replace function public.cancel_draft_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.require_perm('finance', 'update');
  perform set_config('app.change_reason', coalesce(p_reason, 'annulation brouillon'), true);
  update public.invoices set status = 'cancelled' where id = p_invoice_id and status = 'draft';
  if not found then raise exception 'Seul un brouillon peut être annulé'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Trésorerie : caisses, banques, mouvements, transferts, remises (FIN04)
-- ---------------------------------------------------------------------
create table public.treasury_accounts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('cash', 'bank')),
  name            text not null unique,
  currency        char(3) not null default 'TND',
  account_code    text not null references public.accounts (code),
  bank_name       text,
  iban            text,
  opening_balance numeric(14,3) not null default 0,
  opening_date    date not null,
  active          boolean not null default true
);

create table public.treasury_movements (
  id                 uuid primary key default gen_random_uuid(),
  treasury_account_id uuid not null references public.treasury_accounts (id),
  movement_date      date not null,
  amount             numeric(14,3) not null check (amount <> 0),   -- signé : + entrée, − sortie
  kind               text not null check (kind in ('receipt', 'disbursement', 'transfer_in', 'transfer_out', 'fee', 'rejection', 'adjustment')),
  label              text not null,
  payment_id         uuid,
  transfer_group_id  uuid,
  proof_document_id  uuid references public.documents (id),
  reconciled         boolean not null default false,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create index treasury_movements_account_idx on public.treasury_movements (treasury_account_id, movement_date);

create or replace function public.tg_treasury_movements_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Mouvement de trésorerie : suppression interdite, passer une contre-écriture'; end if;
  if (to_jsonb(new) - 'reconciled') is distinct from (to_jsonb(old) - 'reconciled') then
    raise exception 'Mouvement de trésorerie non modifiable, passer une contre-écriture';
  end if;
  return new;
end; $$;
create trigger treasury_movements_immutable before update or delete on public.treasury_movements
  for each row execute function public.tg_treasury_movements_immutable();

create view public.treasury_balances
with (security_invoker = true)
as
select a.id, a.kind, a.name, a.currency, a.account_code, a.opening_balance, a.opening_date,
       a.opening_balance + coalesce(sum(m.amount) filter (where m.movement_date >= a.opening_date), 0) as balance,
       count(m.id) filter (where not m.reconciled) as unreconciled_count
from public.treasury_accounts a
left join public.treasury_movements m on m.treasury_account_id = a.id
group by a.id;

-- Transfert interne : deux mouvements liés, aucun revenu (REC10)
create or replace function public.transfer_funds(p_from uuid, p_to uuid, p_amount numeric, p_date date default current_date, p_label text default 'Transfert interne')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_from public.treasury_accounts;
  v_to public.treasury_accounts;
begin
  perform public.require_perm('finance', 'create');
  if p_amount <= 0 then raise exception 'Montant de transfert invalide'; end if;
  if p_from = p_to then raise exception 'Comptes identiques'; end if;
  select * into v_from from public.treasury_accounts where id = p_from;
  select * into v_to from public.treasury_accounts where id = p_to;
  if v_from.currency <> v_to.currency then raise exception 'Transfert entre devises différentes non pris en charge'; end if;
  insert into public.treasury_movements (treasury_account_id, movement_date, amount, kind, label, transfer_group_id) values
    (p_from, p_date, -p_amount, 'transfer_out', p_label || ' → ' || v_to.name, v_group),
    (p_to, p_date, p_amount, 'transfer_in', p_label || ' ← ' || v_from.name, v_group);
  perform public.draft_entry_from_rule('internal_transfer', p_date, 'TRF-' || left(v_group::text, 8), p_label,
    p_amount, 'transfer', v_group, null, null, null, v_to.account_code, v_from.account_code);
  return v_group;
end;
$$;

create table public.cash_closings (
  id                  uuid primary key default gen_random_uuid(),
  treasury_account_id uuid not null references public.treasury_accounts (id),
  closing_date        date not null,
  expected_balance    numeric(14,3) not null,
  counted_balance     numeric(14,3) not null,
  difference          numeric(14,3) generated always as (counted_balance - expected_balance) stored,
  justification       text,
  closed_by           uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  unique (treasury_account_id, closing_date),
  check (counted_balance = expected_balance or justification is not null)
);

create table public.deposit_slips (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique default public.next_number('DEPOSIT'),
  treasury_account_id uuid not null references public.treasury_accounts (id),
  deposit_date        date not null default current_date,
  total_amount        numeric(14,3) not null default 0,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Règlements clients et fournisseurs (FIN02) — états distincts, idempotents
-- ---------------------------------------------------------------------
create type public.payment_method as enum ('cash', 'transfer', 'card', 'cheque', 'bill', 'online');
create type public.payment_status as enum ('planned', 'received', 'deposited', 'validated', 'rejected', 'cancelled');

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique default public.next_number('PAYMENT'),
  direction           text not null check (direction in ('in', 'out')),
  kind                text not null default 'payment' check (kind in ('payment', 'refund', 'reversal')),
  client_id           uuid references public.clients (id),
  supplier_id         uuid references public.suppliers (id),
  method              public.payment_method not null,
  amount              numeric(14,3) not null check (amount > 0),
  currency            char(3) not null default 'TND',
  fx_rate             numeric(14,6) not null default 1 check (fx_rate > 0),
  fx_rate_date        date,
  fx_rate_source      text,
  amount_tnd          numeric(14,3) generated always as (round(amount * fx_rate, 3)) stored,
  fees                numeric(14,3) not null default 0 check (fees >= 0),
  withholding_amount  numeric(14,3) not null default 0 check (withholding_amount >= 0),
  received_at         date not null default current_date,
  due_date            date,                    -- échéance d'un chèque ou d'une traite
  value_date          date,
  external_ref        text,
  drawer_bank         text,
  instrument_number   text,                    -- n° de chèque / traite
  treasury_account_id uuid references public.treasury_accounts (id),
  deposit_slip_id     uuid references public.deposit_slips (id),
  status              public.payment_status not null default 'received',
  rejection_reason    text,
  reversal_of_id      uuid references public.payments (id),
  idempotency_key     text unique,
  proof_document_id   uuid references public.documents (id),
  online_intent_id    uuid,
  notes               text,
  created_by          uuid default auth.uid(),
  validated_by        uuid,
  validated_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint payments_party_chk check ((client_id is not null) <> (supplier_id is not null)),
  constraint payments_rejection_chk check (status <> 'rejected' or rejection_reason is not null)
);
create index payments_client_idx on public.payments (client_id, status);

alter table public.treasury_movements
  add constraint treasury_movements_payment_fk foreign key (payment_id) references public.payments (id);

create table public.payment_allocations (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references public.payments (id),
  invoice_id          uuid references public.invoices (id),
  supplier_invoice_id uuid,
  dossier_id          uuid references public.dossiers (id),
  amount              numeric(14,3) not null check (amount > 0),
  note                text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  constraint payment_allocations_target_chk check (num_nonnulls(invoice_id, supplier_invoice_id, dossier_id) >= 1)
);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_dossier_idx on public.payment_allocations (dossier_id);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id);

-- Aucune affectation au-delà du montant disponible (règlement et facture)
create or replace function public.tg_payment_allocations_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_allocated numeric(14,3);
  v_inv public.invoices;
  v_inv_open numeric(14,3);
begin
  select * into v_pay from public.payments where id = new.payment_id for update;
  if v_pay.status in ('rejected', 'cancelled') then
    raise exception 'Règlement % %, affectation impossible', v_pay.reference, v_pay.status;
  end if;
  select coalesce(sum(amount), 0) into v_allocated from public.payment_allocations where payment_id = new.payment_id;
  if v_allocated + new.amount > v_pay.amount then
    raise exception 'Affectation supérieure au montant disponible du règlement % (disponible : %)',
      v_pay.reference, v_pay.amount - v_allocated using errcode = 'P0001';
  end if;

  if new.invoice_id is not null then
    select * into v_inv from public.invoices where id = new.invoice_id for update;
    if v_inv.status <> 'validated' or v_inv.kind <> 'invoice' then
      raise exception 'Affectation uniquement sur une facture validée';
    end if;
    if v_pay.direction = 'in' then
      select v_inv.total_ttc - public.invoice_credited_amount(v_inv.id) - coalesce(sum(pa.amount), 0)
        into v_inv_open
        from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
       where pa.invoice_id = v_inv.id and p.direction = 'in' and p.status not in ('rejected', 'cancelled');
      if new.amount > v_inv_open then
        raise exception 'Affectation supérieure au solde de la facture % (solde : %)', v_inv.number, v_inv_open using errcode = 'P0001';
      end if;
    end if;
    new.dossier_id := coalesce(new.dossier_id, v_inv.dossier_id);
  end if;
  return new;
end;
$$;
create trigger payment_allocations_check before insert on public.payment_allocations
  for each row execute function public.tg_payment_allocations_check();

create or replace function public.tg_payment_allocations_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Affectation non modifiable : passer une contre-écriture';
end; $$;
create trigger payment_allocations_immutable before update or delete on public.payment_allocations
  for each row execute function public.tg_payment_allocations_immutable();

-- Montants et statut du règlement figés une fois validé
create or replace function public.tg_payments_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Règlement : suppression interdite, passer une contre-écriture'; end if;
  if old.status = 'validated' and (
       new.amount <> old.amount or new.currency <> old.currency or new.fx_rate <> old.fx_rate
       or new.client_id is distinct from old.client_id or new.supplier_id is distinct from old.supplier_id
       or new.direction <> old.direction or new.method <> old.method) then
    raise exception 'Règlement validé : modification par procédure contrôlée (contre-écriture) uniquement';
  end if;
  if old.status in ('rejected', 'cancelled') and new.status <> old.status then
    raise exception 'Règlement % : statut final', old.status;
  end if;
  return new;
end; $$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function public.tg_payments_guard();

-- Enregistrement idempotent d'un règlement avec ventilation explicite (REC02, REC08)
-- p_allocations : [{"invoice_id": "...", "dossier_id": "...", "amount": 500}]
create or replace function public.record_payment(
  p_idempotency_key text, p_direction text, p_method public.payment_method, p_amount numeric,
  p_client_id uuid default null, p_supplier_id uuid default null, p_allocations jsonb default '[]',
  p_received_at date default current_date, p_treasury_account_id uuid default null,
  p_currency char(3) default 'TND', p_fx_rate numeric default 1, p_external_ref text default null,
  p_instrument_number text default null, p_due_date date default null, p_kind text default 'payment',
  p_validate boolean default false, p_notes text default null, p_fees numeric default 0,
  p_withholding numeric default 0)
returns public.payments
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_alloc jsonb;
  v_status public.payment_status;
begin
  perform public.require_perm('finance', 'create');
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'Clé d''idempotence obligatoire';
  end if;
  -- Nouvelle soumission : renvoie le règlement existant sans doublon
  select * into v_pay from public.payments where idempotency_key = p_idempotency_key;
  if found then return v_pay; end if;

  -- Une échéance future (chèque/traite) reste « reçue » : elle n'est pas un encaissement disponible
  v_status := 'received';

  insert into public.payments (idempotency_key, direction, kind, method, amount, client_id, supplier_id, received_at,
    treasury_account_id, currency, fx_rate, fx_rate_date, external_ref, instrument_number, due_date, status, notes,
    fees, withholding_amount)
  values (p_idempotency_key, p_direction, p_kind, p_method, p_amount, p_client_id, p_supplier_id, p_received_at,
    p_treasury_account_id, p_currency, p_fx_rate, case when p_currency <> 'TND' then p_received_at end, p_external_ref,
    p_instrument_number, p_due_date, v_status, p_notes, coalesce(p_fees, 0), coalesce(p_withholding, 0))
  on conflict (idempotency_key) do nothing
  returning * into v_pay;

  if v_pay.id is null then
    select * into v_pay from public.payments where idempotency_key = p_idempotency_key;
    return v_pay;
  end if;

  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'))
  loop
    insert into public.payment_allocations (payment_id, invoice_id, supplier_invoice_id, dossier_id, amount)
    values (v_pay.id, nullif(v_alloc ->> 'invoice_id', '')::uuid, nullif(v_alloc ->> 'supplier_invoice_id', '')::uuid,
            nullif(v_alloc ->> 'dossier_id', '')::uuid, (v_alloc ->> 'amount')::numeric);
  end loop;

  if p_validate then
    perform public.validate_payment(v_pay.id);
    select * into v_pay from public.payments where id = v_pay.id;
  end if;
  return v_pay;
end;
$$;

-- Validation : encaissement effectif → mouvement de trésorerie + écriture en brouillard
create or replace function public.validate_payment(p_payment_id uuid, p_value_date date default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_acc public.treasury_accounts;
  v_event text;
  v_date date;
begin
  perform public.require_perm('finance', 'validate');
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.status not in ('received', 'deposited', 'planned') then
    raise exception 'Règlement % non validable (statut %)', v_pay.reference, v_pay.status;
  end if;
  if v_pay.treasury_account_id is null then
    raise exception 'Compte de caisse ou de banque obligatoire pour valider le règlement %', v_pay.reference;
  end if;
  select * into v_acc from public.treasury_accounts where id = v_pay.treasury_account_id;
  v_date := coalesce(p_value_date, v_pay.value_date, v_pay.received_at);

  update public.payments set status = 'validated', validated_at = now(), validated_by = auth.uid(), value_date = v_date
   where id = p_payment_id;

  insert into public.treasury_movements (treasury_account_id, movement_date, amount, kind, label, payment_id)
  values (v_pay.treasury_account_id, v_date,
          case when v_pay.direction = 'in' then v_pay.amount_tnd - v_pay.fees else -(v_pay.amount_tnd + v_pay.fees) end,
          case when v_pay.direction = 'in' then 'receipt' else 'disbursement' end,
          format('%s %s', v_pay.reference, coalesce(v_pay.external_ref, '')), p_payment_id);

  v_event := case
    when v_pay.direction = 'in' and v_pay.kind = 'payment' then 'client_receipt'
    when v_pay.direction = 'out' and v_pay.client_id is not null then 'client_refund'
    when v_pay.direction = 'out' then 'supplier_payment'
    else 'supplier_refund' end;
  perform public.draft_entry_from_rule(v_event, v_date, v_pay.reference, 'Règlement ' || v_pay.reference,
    v_pay.amount_tnd, 'payment', p_payment_id, v_pay.client_id, v_pay.supplier_id, null,
    case when v_event in ('client_receipt', 'supplier_refund') then v_acc.account_code end,
    case when v_event in ('client_refund', 'supplier_payment') then v_acc.account_code end);
end;
$$;

-- Remise en banque de chèques / traites (bordereau avec liste)
create or replace function public.create_deposit_slip(p_treasury_account_id uuid, p_payment_ids uuid[], p_date date default current_date)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_slip uuid;
  v_total numeric(14,3);
begin
  perform public.require_perm('finance', 'create');
  if exists (select 1 from public.payments where id = any (p_payment_ids)
              and (method not in ('cheque', 'bill') or status <> 'received' or direction <> 'in')) then
    raise exception 'Seuls des chèques ou traites reçus peuvent être remis en banque';
  end if;
  insert into public.deposit_slips (treasury_account_id, deposit_date) values (p_treasury_account_id, p_date) returning id into v_slip;
  update public.payments set status = 'deposited', deposit_slip_id = v_slip, treasury_account_id = p_treasury_account_id
   where id = any (p_payment_ids);
  select sum(amount) into v_total from public.payments where deposit_slip_id = v_slip;
  update public.deposit_slips set total_amount = coalesce(v_total, 0) where id = v_slip;
  return v_slip;
end;
$$;

-- Rejet d'un chèque / traite : états conservés, trésorerie et créance recalculées (REC09)
create or replace function public.reject_payment(p_payment_id uuid, p_reason text, p_fees numeric default 0)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_acc public.treasury_accounts;
begin
  perform public.require_perm('finance', 'validate');
  if p_reason is null then raise exception 'Motif de rejet obligatoire'; end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.status in ('rejected', 'cancelled') then return; end if;
  if v_pay.status = 'validated' then
    -- Encaissement déjà constaté : contre-mouvement et contre-écriture, sans effacer l'initial
    insert into public.treasury_movements (treasury_account_id, movement_date, amount, kind, label, payment_id)
    values (v_pay.treasury_account_id, current_date,
            case when v_pay.direction = 'in' then -(v_pay.amount_tnd - v_pay.fees) else v_pay.amount_tnd + v_pay.fees end,
            'rejection', 'Rejet ' || v_pay.reference || ' : ' || p_reason, p_payment_id);
    select * into v_acc from public.treasury_accounts where id = v_pay.treasury_account_id;
    perform public.draft_entry_from_rule('client_refund', current_date, v_pay.reference || '-REJ', 'Rejet ' || v_pay.reference,
      v_pay.amount_tnd, 'payment', p_payment_id, v_pay.client_id, v_pay.supplier_id, null, null, v_acc.account_code);
    if coalesce(p_fees, 0) > 0 then
      insert into public.treasury_movements (treasury_account_id, movement_date, amount, kind, label, payment_id)
      values (v_pay.treasury_account_id, current_date, -p_fees, 'fee', 'Frais de rejet ' || v_pay.reference, p_payment_id);
    end if;
  end if;
  update public.payments set status = 'rejected', rejection_reason = p_reason where id = p_payment_id;
end;
$$;

-- Contre-écriture d'un règlement validé (procédure contrôlée et journalisée)
create or replace function public.reverse_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_pay public.payments;
  v_new public.payments;
begin
  perform public.require_perm('finance', 'validate');
  if p_reason is null then raise exception 'Motif obligatoire'; end if;
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.status <> 'validated' then raise exception 'Seul un règlement validé se contrepasse'; end if;
  if exists (select 1 from public.payments where reversal_of_id = p_payment_id) then
    raise exception 'Règlement déjà contrepassé';
  end if;
  perform set_config('app.change_reason', p_reason, true);
  insert into public.payments (idempotency_key, direction, kind, method, amount, client_id, supplier_id, received_at,
    treasury_account_id, currency, fx_rate, reversal_of_id, status, notes)
  values ('reversal:' || p_payment_id, case when v_pay.direction = 'in' then 'out' else 'in' end, 'reversal', v_pay.method,
    v_pay.amount, v_pay.client_id, v_pay.supplier_id, current_date, v_pay.treasury_account_id, v_pay.currency,
    v_pay.fx_rate, p_payment_id, 'received', p_reason)
  returning * into v_new;
  insert into public.payment_allocations (payment_id, invoice_id, supplier_invoice_id, dossier_id, amount, note)
  select v_new.id, null, null, coalesce(pa.dossier_id, i.dossier_id), pa.amount, 'Contre-écriture de ' || v_pay.reference
    from public.payment_allocations pa left join public.invoices i on i.id = pa.invoice_id
   where pa.payment_id = p_payment_id and coalesce(pa.dossier_id, i.dossier_id) is not null;
  perform public.validate_payment(v_new.id);
  return v_new.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Pièces fournisseurs, retenues et ventilation des coûts (FIN03, REC12)
-- ---------------------------------------------------------------------
create table public.supplier_invoices (
  id                    uuid primary key default gen_random_uuid(),
  supplier_id           uuid not null references public.suppliers (id),
  supplier_ref          text not null,
  issue_date            date not null,
  service_period_start  date,
  service_period_end    date,
  due_date              date,
  currency              char(3) not null default 'TND',
  fx_rate               numeric(14,6) not null default 1 check (fx_rate > 0),
  fx_rate_date          date,
  fx_rate_source        text,
  total_amount          numeric(14,3) not null check (total_amount > 0),
  tax_amount            numeric(14,3) not null default 0,
  withholding_rule      text,
  withholding_base      numeric(14,3),
  withholding_amount    numeric(14,3) not null default 0,
  withholding_certificate_document_id uuid references public.documents (id),
  total_tnd             numeric(14,3) generated always as (round(total_amount * fx_rate, 3)) stored,
  status                text not null default 'draft' check (status in ('draft', 'validated', 'cancelled')),
  duplicate_justification text,
  document_id           uuid references public.documents (id),
  notes                 text,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now()
);
create index supplier_invoices_ref_idx on public.supplier_invoices (supplier_id, lower(supplier_ref));

alter table public.payment_allocations
  add constraint payment_allocations_supplier_invoice_fk foreign key (supplier_invoice_id) references public.supplier_invoices (id);

create table public.supplier_invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.supplier_invoices (id) on delete cascade,
  description         text not null,
  service_id          uuid references public.services (id),
  quantity            numeric(10,2) not null default 1,
  amount              numeric(14,3) not null check (amount >= 0)
);

-- Contrôle des doublons de référence fournisseur, exception justifiée possible
create or replace function public.tg_supplier_invoices_duplicate()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.supplier_invoices s
              where s.supplier_id = new.supplier_id and lower(s.supplier_ref) = lower(new.supplier_ref)
                and s.status <> 'cancelled' and s.id <> new.id)
     and new.duplicate_justification is null then
    raise exception 'Doublon probable : la référence % existe déjà pour ce fournisseur (justification requise)', new.supplier_ref
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger supplier_invoices_duplicate before insert or update of supplier_ref, supplier_id on public.supplier_invoices
  for each row execute function public.tg_supplier_invoices_duplicate();

create table public.cost_allocations (
  id                  uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references public.supplier_invoices (id),
  supplier_invoice_line_id uuid references public.supplier_invoice_lines (id),
  dossier_id          uuid references public.dossiers (id),
  departure_id        uuid references public.departures (id),
  service_id          uuid references public.services (id),
  amount              numeric(14,3) not null check (amount > 0),      -- devise de la pièce
  amount_tnd          numeric(14,3) not null,
  method              text not null check (method in ('percent', 'nights', 'pax', 'line', 'manual')),
  basis               jsonb not null default '{}'::jsonb,
  cost_kind           text not null default 'individual' check (cost_kind in ('individual', 'common')),
  status              text not null default 'validated' check (status in ('validated', 'reversed')),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  constraint cost_allocations_target_chk check (num_nonnulls(dossier_id, departure_id, service_id) >= 1)
);

-- Une pièce n'est jamais comptée plusieurs fois : somme des ventilations ≤ montant de la pièce
create or replace function public.tg_cost_allocations_check()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.supplier_invoices;
  v_sum numeric(14,3);
begin
  select * into v_inv from public.supplier_invoices where id = new.supplier_invoice_id for update;
  if v_inv.status = 'cancelled' then raise exception 'Pièce fournisseur annulée'; end if;
  select coalesce(sum(amount), 0) into v_sum from public.cost_allocations
   where supplier_invoice_id = new.supplier_invoice_id and status = 'validated';
  if v_sum + new.amount > v_inv.total_amount then
    raise exception 'Surallocation de la pièce % : ventilé % + % > %', v_inv.supplier_ref, v_sum, new.amount, v_inv.total_amount
      using errcode = 'P0001';
  end if;
  if new.service_id is not null and new.dossier_id is null then
    select dossier_id into new.dossier_id from public.services where id = new.service_id;
  end if;
  return new;
end;
$$;
create trigger cost_allocations_check before insert on public.cost_allocations
  for each row execute function public.tg_cost_allocations_check();

-- Ventilation par clé (pourcentage, nuitées, passagers…) avec traitement explicite de l'arrondi
-- p_targets : [{"dossier_id": "...", "departure_id": "...", "service_id": "...", "weight": 60}]
create or replace function public.allocate_supplier_invoice(
  p_supplier_invoice_id uuid, p_targets jsonb, p_method text default 'percent',
  p_amount numeric default null, p_cost_kind text default 'individual')
returns setof public.cost_allocations
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.supplier_invoices;
  v_total numeric(14,3);
  v_weight_sum numeric;
  v_target jsonb;
  v_i int := 0;
  v_n int;
  v_share numeric(14,3);
  v_done numeric(14,3) := 0;
  v_alloc public.cost_allocations;
begin
  perform public.require_perm('finance', 'create');
  select * into v_inv from public.supplier_invoices where id = p_supplier_invoice_id;
  v_total := coalesce(p_amount, v_inv.total_amount -
             (select coalesce(sum(amount), 0) from public.cost_allocations where supplier_invoice_id = p_supplier_invoice_id and status = 'validated'));
  v_n := jsonb_array_length(p_targets);
  if v_n = 0 then raise exception 'Aucune cible de ventilation'; end if;
  select sum((t ->> 'weight')::numeric) into v_weight_sum from jsonb_array_elements(p_targets) t;
  if coalesce(v_weight_sum, 0) <= 0 then raise exception 'Clé de ventilation invalide'; end if;

  for v_target in select * from jsonb_array_elements(p_targets)
  loop
    v_i := v_i + 1;
    -- La dernière part absorbe l'écart d'arrondi : somme exacte dans la devise d'origine
    v_share := case when v_i = v_n then v_total - v_done
                    else round(v_total * (v_target ->> 'weight')::numeric / v_weight_sum, 3) end;
    v_done := v_done + v_share;
    insert into public.cost_allocations (supplier_invoice_id, dossier_id, departure_id, service_id, amount, amount_tnd,
      method, basis, cost_kind)
    values (p_supplier_invoice_id, nullif(v_target ->> 'dossier_id', '')::uuid, nullif(v_target ->> 'departure_id', '')::uuid,
      nullif(v_target ->> 'service_id', '')::uuid, v_share, round(v_share * v_inv.fx_rate, 3), p_method,
      jsonb_build_object('weight', v_target -> 'weight', 'weight_sum', v_weight_sum, 'total', v_total), p_cost_kind)
    returning * into v_alloc;
    return next v_alloc;
  end loop;
end;
$$;

create or replace function public.validate_supplier_invoice(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.supplier_invoices;
begin
  perform public.require_perm('finance', 'validate');
  select * into v_inv from public.supplier_invoices where id = p_id for update;
  if v_inv.status <> 'draft' then raise exception 'Pièce déjà traitée'; end if;
  update public.supplier_invoices set status = 'validated' where id = p_id;
  perform public.draft_entry_from_rule('supplier_invoice', v_inv.issue_date, v_inv.supplier_ref,
    'Pièce fournisseur ' || v_inv.supplier_ref, v_inv.total_tnd, 'supplier_invoice', p_id, null, v_inv.supplier_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement en ligne (FO07) — confirmation serveur, un seul encaissement par événement
-- ---------------------------------------------------------------------
create table public.payment_intents (
  id                  uuid primary key default gen_random_uuid(),
  dossier_id          uuid not null references public.dossiers (id),
  schedule_item_id    uuid references public.payment_schedule_items (id),
  client_id           uuid not null references public.clients (id),
  amount              numeric(14,3) not null check (amount > 0),
  currency            char(3) not null default 'TND',
  provider            text not null,
  provider_session_id text unique,
  status              text not null default 'created' check (status in ('created', 'pending', 'succeeded', 'failed', 'abandoned')),
  payment_id          uuid references public.payments (id),
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.payments
  add constraint payments_online_intent_fk foreign key (online_intent_id) references public.payment_intents (id);
create unique index payments_online_intent_uq on public.payments (online_intent_id) where online_intent_id is not null;

create table public.payment_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_id      text not null,
  event_type    text not null,
  intent_id     uuid references public.payment_intents (id),
  payload       jsonb not null,
  signature_valid boolean not null,
  result        text,
  received_at   timestamptz not null default now(),
  unique (provider, event_id)
);

-- Traitement d'un événement prestataire vérifié (appelé par le serveur avec la clé service)
create or replace function public.process_payment_event(
  p_provider text, p_event_id text, p_event_type text, p_session_id text, p_amount numeric,
  p_payload jsonb, p_signature_valid boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_intent public.payment_intents;
  v_dossier public.dossiers;
  v_account uuid;
  v_pay public.payments;
  v_event_row uuid;
begin
  if not public.is_internal_context() then
    raise exception 'Réservé au serveur' using errcode = '42501';
  end if;
  insert into public.payment_webhook_events (provider, event_id, event_type, payload, signature_valid)
  values (p_provider, p_event_id, p_event_type, p_payload, p_signature_valid)
  on conflict (provider, event_id) do nothing
  returning id into v_event_row;
  if v_event_row is null then
    return 'duplicate_event_ignored';
  end if;
  if not p_signature_valid then
    update public.payment_webhook_events set result = 'invalid_signature' where id = v_event_row;
    return 'invalid_signature';
  end if;

  select * into v_intent from public.payment_intents where provider_session_id = p_session_id and provider = p_provider for update;
  if not found then
    update public.payment_webhook_events set result = 'unknown_session' where id = v_event_row;
    return 'unknown_session';
  end if;
  update public.payment_webhook_events set intent_id = v_intent.id where id = v_event_row;

  if p_event_type = 'payment.succeeded' then
    if v_intent.status = 'succeeded' then
      update public.payment_webhook_events set result = 'already_succeeded' where id = v_event_row;
      return 'already_succeeded';
    end if;
    if p_amount <> v_intent.amount then
      insert into public.alerts (kind, severity, title, dossier_id, details, dedupe_key)
      values ('online_payment_amount_mismatch', 'red', 'Montant de paiement en ligne différent du montant attendu',
              v_intent.dossier_id, jsonb_build_object('expected', v_intent.amount, 'received', p_amount, 'session', p_session_id),
              'pay-mismatch:' || v_intent.id);
    end if;
    select (value ->> 'treasury_account_id')::uuid into v_account from public.app_settings where key = 'online_payment_account';
    insert into public.payments (idempotency_key, direction, kind, method, amount, client_id, received_at,
      treasury_account_id, external_ref, status, online_intent_id, notes)
    values ('online:' || p_provider || ':' || p_session_id, 'in', 'payment', 'online', p_amount, v_intent.client_id, current_date,
      v_account, p_session_id, 'received', v_intent.id, 'Paiement en ligne ' || p_provider)
    on conflict (idempotency_key) do nothing
    returning * into v_pay;
    if v_pay.id is not null then
      insert into public.payment_allocations (payment_id, dossier_id, amount, note)
      values (v_pay.id, v_intent.dossier_id, least(p_amount, v_pay.amount), 'Paiement en ligne');
      if v_account is not null then
        perform public.validate_payment(v_pay.id);
      end if;
    end if;
    update public.payment_intents set status = 'succeeded', payment_id = coalesce(v_pay.id, payment_id), updated_at = now()
     where id = v_intent.id;

    -- Un paiement ne confirme pas les prestations ; dossier annulé = anomalie urgente
    select * into v_dossier from public.dossiers where id = v_intent.dossier_id;
    if v_dossier.status = 'cancelled' then
      insert into public.alerts (kind, severity, title, dossier_id, details, dedupe_key)
      values ('payment_on_cancelled_booking', 'red', 'Paiement reçu sur un dossier annulé : traitement et remboursement à étudier',
              v_dossier.id, jsonb_build_object('payment_id', v_pay.id), 'pay-cancelled:' || v_intent.id)
      on conflict (dedupe_key) do nothing;
    end if;
    insert into public.tasks (title, dossier_id, assignee_id, dedupe_key, source, due_at, completion_note)
    values ('Paiement en ligne reçu : vérifier l''affectation', v_dossier.id, v_dossier.owner_id,
            'online-paid:' || v_intent.id, 'trigger:online_payment', now() + interval '1 day', null)
    on conflict (dedupe_key) do nothing;
    update public.payment_webhook_events set result = 'payment_recorded' where id = v_event_row;
    return 'payment_recorded';
  elsif p_event_type in ('payment.failed', 'payment.abandoned') then
    if v_intent.status <> 'succeeded' then
      update public.payment_intents set status = case when p_event_type = 'payment.failed' then 'failed' else 'abandoned' end,
             updated_at = now() where id = v_intent.id;
    end if;
    update public.payment_webhook_events set result = 'status_updated' where id = v_event_row;
    return 'status_updated';
  end if;
  update public.payment_webhook_events set result = 'ignored' where id = v_event_row;
  return 'ignored';
end;
$$;

-- ---------------------------------------------------------------------
-- Soldes et indicateurs (FIN07) — définitions communes à tous les écrans
-- ---------------------------------------------------------------------

-- Encaissé net validé sur un dossier (entrées − remboursements/contre-écritures)
create or replace function public.dossier_paid_amount(p_dossier_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(case when p.direction = 'in' then pa.amount else -pa.amount end), 0)
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    left join public.invoices i on i.id = pa.invoice_id
   where coalesce(pa.dossier_id, i.dossier_id) = p_dossier_id
     and p.client_id is not null
     and p.status = 'validated'
$$;

create or replace function public.can_see_margins()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_internal_context() or public.has_perm('margins', 'read')
$$;

create view public.dossier_financials
with (security_invoker = true)
as
with credits as (
  select dossier_id, sum(total_ttc) as total from public.invoices
   where kind = 'credit_note' and status = 'validated' group by dossier_id
), invoiced as (
  select dossier_id, sum(total_ttc) as total from public.invoices
   where kind = 'invoice' and status = 'validated' group by dossier_id
), svc as (
  select dossier_id,
         sum(round(cost_planned * fx_rate, 3)) filter (where status <> 'cancelled') as cost_planned,
         sum(round(coalesce(cost_confirmed, cost_planned) * fx_rate, 3)) filter (where status <> 'cancelled') as cost_confirmed,
         bool_or(status <> 'cancelled' and coalesce(cost_confirmed, cost_planned) = 0) as has_missing_cost,
         count(*) filter (where status <> 'cancelled') as active_services
    from public.services group by dossier_id
), actual as (
  select coalesce(ca.dossier_id, s.dossier_id) as dossier_id, sum(ca.amount_tnd) as total
    from public.cost_allocations ca left join public.services s on s.id = ca.service_id
   where ca.status = 'validated' group by 1
), sched as (
  select dossier_id, sum(amount) as total,
         sum(amount) filter (where due_date <= current_date) as due_to_date
    from public.payment_schedule_items group by dossier_id
)
select d.id as dossier_id, d.reference, d.client_id, d.status, d.activity, d.start_date, d.owner_id,
       d.total_price as sale_planned,
       coalesce(c.total, 0) as credit_notes,
       d.total_price - coalesce(c.total, 0) as sale_net,
       coalesce(inv.total, 0) as invoiced,
       coalesce(inv.total, 0) - coalesce(c.total, 0) as invoiced_net,
       public.dossier_paid_amount(d.id) as paid,
       d.total_price - coalesce(c.total, 0) - public.dossier_paid_amount(d.id) as balance,
       coalesce(sch.total, 0) as scheduled,
       greatest(coalesce(sch.due_to_date, 0) - public.dossier_paid_amount(d.id), 0) as overdue,
       -- Coûts et marges masqués sans le droit « margins » (REC20)
       case when public.can_see_margins() then coalesce(svc.cost_planned, 0) end as cost_planned,
       case when public.can_see_margins() then coalesce(svc.cost_confirmed, 0) end as cost_confirmed,
       case when public.can_see_margins() then coalesce(act.total, 0) end as cost_actual,
       case when public.can_see_margins() then d.total_price - coalesce(c.total, 0) - coalesce(svc.cost_planned, 0) end as margin_forecast,
       case when public.can_see_margins() then d.total_price - coalesce(c.total, 0) - coalesce(svc.cost_confirmed, 0) end as margin_confirmed,
       case when public.can_see_margins() then d.total_price - coalesce(c.total, 0) - coalesce(act.total, 0) end as margin_actual,
       case when coalesce(svc.has_missing_cost, false) or coalesce(act.total, 0) = 0
            then 'provisional' else 'final' end as margin_state,
       coalesce(svc.has_missing_cost, false) as costs_incomplete
from public.dossiers d
left join credits c on c.dossier_id = d.id
left join invoiced inv on inv.dossier_id = d.id
left join svc on svc.dossier_id = d.id
left join actual act on act.dossier_id = d.id
left join sched sch on sch.dossier_id = d.id;

-- Solde par facture et relevé client (REC08)
create view public.invoice_balances
with (security_invoker = true)
as
select i.id as invoice_id, i.number, i.kind, i.status, i.client_id, i.dossier_id, i.issue_date, i.due_date, i.total_ttc,
       public.invoice_credited_amount(i.id) as credited,
       coalesce((select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
                  where pa.invoice_id = i.id and p.status = 'validated' and p.direction = 'in'), 0) as paid,
       i.total_ttc - public.invoice_credited_amount(i.id)
         - coalesce((select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
                      where pa.invoice_id = i.id and p.status = 'validated' and p.direction = 'in'), 0) as open_amount
from public.invoices i
where i.kind = 'invoice' and i.status = 'validated';

create view public.client_balances
with (security_invoker = true)
as
select c.id as client_id, c.display_name,
       coalesce((select sum(total_ttc) from public.invoices where client_id = c.id and kind = 'invoice' and status = 'validated'), 0) as invoiced,
       coalesce((select sum(total_ttc) from public.invoices where client_id = c.id and kind = 'credit_note' and status = 'validated'), 0) as credited,
       coalesce((select sum(case when direction = 'in' then amount_tnd else -amount_tnd end) from public.payments
                  where client_id = c.id and status = 'validated'), 0) as paid,
       coalesce((select sum(total_ttc) from public.invoices where client_id = c.id and kind = 'invoice' and status = 'validated'), 0)
       - coalesce((select sum(total_ttc) from public.invoices where client_id = c.id and kind = 'credit_note' and status = 'validated'), 0)
       - coalesce((select sum(case when direction = 'in' then amount_tnd else -amount_tnd end) from public.payments
                    where client_id = c.id and status = 'validated'), 0) as balance
from public.clients c;

create view public.payment_unallocated
with (security_invoker = true)
as
select p.id as payment_id, p.reference, p.direction, p.client_id, p.supplier_id, p.amount, p.status,
       coalesce(sum(pa.amount), 0) as allocated, p.amount - coalesce(sum(pa.amount), 0) as unallocated
from public.payments p left join public.payment_allocations pa on pa.payment_id = p.id
group by p.id;

create view public.supplier_invoice_balances
with (security_invoker = true)
as
select si.id as supplier_invoice_id, si.supplier_id, si.supplier_ref, si.issue_date, si.due_date, si.currency,
       si.total_amount, si.withholding_amount, si.status,
       coalesce((select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
                  where pa.supplier_invoice_id = si.id and p.status = 'validated' and p.direction = 'out'), 0) as paid,
       si.total_amount - si.withholding_amount
         - coalesce((select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
                      where pa.supplier_invoice_id = si.id and p.status = 'validated' and p.direction = 'out'), 0) as remaining,
       coalesce((select sum(amount) from public.cost_allocations where supplier_invoice_id = si.id and status = 'validated'), 0) as allocated,
       si.total_amount - coalesce((select sum(amount) from public.cost_allocations where supplier_invoice_id = si.id and status = 'validated'), 0) as unallocated
from public.supplier_invoices si;

-- Grand livre et balance (écritures validées uniquement)
create view public.general_ledger
with (security_invoker = true)
as
select l.id as line_id, e.id as entry_id, e.number, e.journal_code, e.entry_date, e.piece_ref, e.label as entry_label,
       e.source_type, e.source_id, l.account_code, a.label as account_label, l.label, l.debit, l.credit,
       l.client_id, l.supplier_id, l.dossier_id,
       sum(l.debit - l.credit) over (partition by l.account_code order by e.entry_date, e.number, l.id) as running_balance
from public.journal_lines l
join public.journal_entries e on e.id = l.entry_id
left join public.accounts a on a.code = l.account_code
where e.status = 'posted';

create or replace function public.trial_balance(p_from date default null, p_to date default null)
returns table (account_code text, account_label text, debit numeric, credit numeric, balance numeric)
language sql stable security invoker
as $$
  select l.account_code, a.label, sum(l.debit), sum(l.credit), sum(l.debit - l.credit)
    from public.journal_lines l
    join public.journal_entries e on e.id = l.entry_id
    left join public.accounts a on a.code = l.account_code
   where e.status = 'posted'
     and (p_from is null or e.entry_date >= p_from)
     and (p_to is null or e.entry_date <= p_to)
   group by l.account_code, a.label
   order by l.account_code
$$;

create view public.aged_receivables
with (security_invoker = true)
as
select ib.client_id, c.display_name,
       sum(ib.open_amount) filter (where ib.due_date >= current_date) as not_due,
       sum(ib.open_amount) filter (where ib.due_date < current_date and ib.due_date >= current_date - 30) as d0_30,
       sum(ib.open_amount) filter (where ib.due_date < current_date - 30 and ib.due_date >= current_date - 60) as d31_60,
       sum(ib.open_amount) filter (where ib.due_date < current_date - 60) as d60_plus,
       sum(ib.open_amount) as total
from public.invoice_balances ib join public.clients c on c.id = ib.client_id
where ib.open_amount > 0
group by ib.client_id, c.display_name;

-- ---------------------------------------------------------------------
-- Clôture financière d'un dossier (CLO01/CLO02) — distincte de la clôture de période
-- ---------------------------------------------------------------------
create or replace function public.close_dossier_financially(p_dossier_id uuid, p_exception_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_fin record;
  v_issues text[] := '{}';
begin
  perform public.require_perm('finance', 'validate');
  select * into v_fin from public.dossier_financials where dossier_id = p_dossier_id;
  if v_fin.status not in ('completed', 'cancelled') then
    v_issues := v_issues || 'Voyage non terminé'::text;
  end if;
  if v_fin.balance <> 0 then
    v_issues := v_issues || format('Solde client non nul : %s', v_fin.balance);
  end if;
  if v_fin.costs_incomplete or coalesce(v_fin.cost_actual, 0) = 0 then
    v_issues := v_issues || 'Coûts définitifs incomplets'::text;
  end if;
  if exists (select 1 from public.services where dossier_id = p_dossier_id and status not in ('confirmed', 'cancelled')) then
    v_issues := v_issues || 'Prestations ni exécutées ni annulées'::text;
  end if;
  if exists (select 1 from public.tickets t join public.services s on s.id = t.service_id
              where s.dossier_id = p_dossier_id and t.status = 'refund_expected') then
    v_issues := v_issues || 'Remboursement fournisseur attendu'::text;
  end if;

  if array_length(v_issues, 1) > 0 then
    if p_exception_reason is null then
      raise exception E'Clôture impossible :\n%', array_to_string(v_issues, E'\n') using errcode = 'P0001';
    end if;
    perform public.require_perm('dossiers', 'validate');
    insert into public.alerts (kind, severity, title, dossier_id, details, dedupe_key)
    values ('closed_with_exception', 'orange', 'Dossier clôturé avec exception : suivi requis', p_dossier_id,
            jsonb_build_object('issues', to_jsonb(v_issues), 'reason', p_exception_reason), 'close-exc:' || p_dossier_id || ':' || now())
    on conflict (dedupe_key) do nothing;
    update public.dossiers set financial_status = 'closed_with_exception', financial_closed_at = now(),
           financial_closed_by = auth.uid(), financial_close_note = p_exception_reason where id = p_dossier_id;
  else
    update public.dossiers set financial_status = 'closed', financial_closed_at = now(),
           financial_closed_by = auth.uid() where id = p_dossier_id;
  end if;
end;
$$;

-- Nouvelle pièce après clôture → revue tracée (CLO02)
create or replace function public.tg_post_closing_review()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_dossier uuid := new.dossier_id;
begin
  if v_dossier is not null and exists (select 1 from public.dossiers where id = v_dossier and financial_status in ('closed', 'closed_with_exception')) then
    insert into public.alerts (kind, severity, title, dossier_id, details, dedupe_key)
    values ('post_closing_document', 'orange', 'Nouvelle pièce après clôture financière : revue nécessaire', v_dossier,
            jsonb_build_object('table', tg_table_name, 'id', new.id), 'post-close:' || tg_table_name || ':' || new.id)
    on conflict (dedupe_key) do nothing;
    update public.dossiers set financial_status = 'follow_up' where id = v_dossier;
  end if;
  return new;
end;
$$;
create trigger cost_allocations_post_close after insert on public.cost_allocations for each row execute function public.tg_post_closing_review();
create trigger invoices_post_close after insert on public.invoices for each row execute function public.tg_post_closing_review();

-- ---------------------------------------------------------------------
-- Audit & RLS
-- ---------------------------------------------------------------------
create trigger invoices_audit after insert or update or delete on public.invoices for each row execute function public.tg_audit();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function public.tg_audit();
create trigger supplier_invoices_audit after insert or update or delete on public.supplier_invoices for each row execute function public.tg_audit();
create trigger cost_allocations_audit after insert or update on public.cost_allocations for each row execute function public.tg_audit();
create trigger journal_entries_audit after insert or update on public.journal_entries for each row execute function public.tg_audit();
create trigger fiscal_periods_audit after insert or update on public.fiscal_periods for each row execute function public.tg_audit();
create trigger tax_rules_audit after insert or update or delete on public.tax_rules for each row execute function public.tg_audit();
create trigger posting_rules_audit after insert or update or delete on public.posting_rules for each row execute function public.tg_audit();

alter table public.fx_rates enable row level security;
alter table public.tax_rules enable row level security;
alter table public.accounts enable row level security;
alter table public.journals enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.posting_rules enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.treasury_accounts enable row level security;
alter table public.treasury_movements enable row level security;
alter table public.cash_closings enable row level security;
alter table public.deposit_slips enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_lines enable row level security;
alter table public.cost_allocations enable row level security;
alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy fx_select on public.fx_rates for select to authenticated using (public.is_staff());
create policy fx_write on public.fx_rates for all to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'update'));
create policy tax_select on public.tax_rules for select to authenticated using (public.is_staff());
create policy tax_write on public.tax_rules for all to authenticated using (public.has_perm('accounting', 'validate')) with check (public.has_perm('accounting', 'validate'));

create policy accounts_select on public.accounts for select to authenticated using (public.has_perm('accounting', 'read') or public.has_perm('finance', 'read'));
create policy accounts_write on public.accounts for all to authenticated using (public.has_perm('accounting', 'update')) with check (public.has_perm('accounting', 'update'));
create policy journals_select on public.journals for select to authenticated using (public.has_perm('accounting', 'read'));
create policy periods_select on public.fiscal_periods for select to authenticated using (public.has_perm('accounting', 'read'));
create policy periods_insert on public.fiscal_periods for insert to authenticated with check (public.has_perm('accounting', 'validate'));
create policy entries_select on public.journal_entries for select to authenticated using (public.has_perm('accounting', 'read'));
create policy entries_write on public.journal_entries for insert to authenticated with check (public.has_perm('accounting', 'create'));
create policy entries_update on public.journal_entries for update to authenticated using (public.has_perm('accounting', 'update')) with check (public.has_perm('accounting', 'update'));
create policy entries_delete on public.journal_entries for delete to authenticated using (public.has_perm('accounting', 'update'));
create policy lines_select on public.journal_lines for select to authenticated using (public.has_perm('accounting', 'read'));
create policy lines_write on public.journal_lines for all to authenticated using (public.has_perm('accounting', 'update')) with check (public.has_perm('accounting', 'create'));
create policy posting_rules_select on public.posting_rules for select to authenticated using (public.has_perm('accounting', 'read'));
create policy posting_rules_write on public.posting_rules for all to authenticated using (public.has_perm('accounting', 'validate')) with check (public.has_perm('accounting', 'validate'));

-- Factures : finance + commerciaux (lecture), client propriétaire (validées uniquement)
create policy invoices_select on public.invoices for select to authenticated
  using (public.has_perm('finance', 'read') or (status = 'validated' and client_id = public.portal_client_id()));
create policy invoices_insert on public.invoices for insert to authenticated with check (public.has_perm('finance', 'create') and status = 'draft');
create policy invoices_update on public.invoices for update to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'update'));
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (public.has_perm('finance', 'read') or exists (select 1 from public.invoices i where i.id = invoice_id and i.status = 'validated' and i.client_id = public.portal_client_id()));
create policy invoice_lines_write on public.invoice_lines for all to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'update'));

create policy treasury_accounts_select on public.treasury_accounts for select to authenticated using (public.has_perm('finance', 'read'));
create policy treasury_accounts_write on public.treasury_accounts for all to authenticated using (public.has_perm('settings', 'update')) with check (public.has_perm('settings', 'update'));
create policy treasury_movements_select on public.treasury_movements for select to authenticated using (public.has_perm('finance', 'read'));
create policy treasury_movements_insert on public.treasury_movements for insert to authenticated with check (public.has_perm('finance', 'create'));
create policy treasury_movements_update on public.treasury_movements for update to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'update'));
create policy cash_closings_all on public.cash_closings for all to authenticated using (public.has_perm('finance', 'read')) with check (public.has_perm('finance', 'validate'));
create policy deposit_slips_select on public.deposit_slips for select to authenticated using (public.has_perm('finance', 'read'));

create policy payments_select on public.payments for select to authenticated
  using (public.has_perm('finance', 'read') or (client_id = public.portal_client_id() and status = 'validated'));
create policy payments_update on public.payments for update to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'update'));
create policy allocations_select on public.payment_allocations for select to authenticated
  using (public.has_perm('finance', 'read') or exists (select 1 from public.payments p where p.id = payment_id and p.client_id = public.portal_client_id() and p.status = 'validated'));
create policy allocations_insert on public.payment_allocations for insert to authenticated with check (public.has_perm('finance', 'create'));

create policy supplier_invoices_select on public.supplier_invoices for select to authenticated using (public.has_perm('finance', 'read'));
create policy supplier_invoices_write on public.supplier_invoices for all to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'create'));
create policy supplier_invoice_lines_select on public.supplier_invoice_lines for select to authenticated using (public.has_perm('finance', 'read'));
create policy supplier_invoice_lines_write on public.supplier_invoice_lines for all to authenticated using (public.has_perm('finance', 'update')) with check (public.has_perm('finance', 'create'));
create policy cost_allocations_select on public.cost_allocations for select to authenticated using (public.has_perm('finance', 'read') or public.has_perm('margins', 'read'));

create policy intents_select on public.payment_intents for select to authenticated
  using (public.has_perm('finance', 'read') or client_id = public.portal_client_id());
create policy webhook_events_select on public.payment_webhook_events for select to authenticated using (public.has_perm('finance', 'read'));
