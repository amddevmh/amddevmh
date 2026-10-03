-- Recette comptable et financière : REC02, REC08 à REC13, REC15, doublons fournisseurs
begin;
select plan(35);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;
insert into ctx select 'bank', id from public.treasury_accounts where name = 'Banque principale';
insert into ctx select 'cash', id from public.treasury_accounts where name = 'Caisse principale';
insert into ctx select 'dossier', id from public.dossiers where reference = 'DOS-2026-00001';
-- Les scénarios REC sont exprimés hors droit de timbre (règle indicative non validée par le comptable)
update public.tax_rules set effective_to = '2025-12-31' where code = 'STAMP';

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000004","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------- REC02
-- Dossier 2 390 DT : acompte 500 déjà validé (seed) → solde 1 890 ; nouvelle soumission sans doublon
select is((select balance from public.dossier_financials where dossier_id = (select v from ctx where k = 'dossier')), 1890.000,
          'REC02 : acompte validé de 500 DT laisse 1 890 DT');
select is((public.record_payment('seed-deposit-ben-salah', 'in', 'transfer', 500, '33333333-0000-0000-0000-000000000001')).reference,
          (select reference from public.payments where idempotency_key = 'seed-deposit-ben-salah'),
          'REC02 : nouvelle soumission renvoie le règlement existant');
select is((select count(*)::int from public.payments where client_id = '33333333-0000-0000-0000-000000000001'), 1,
          'REC02 : aucune double écriture');

select public.record_payment('rec02-t' || n, 'in', 'cash', 630, '33333333-0000-0000-0000-000000000001', null,
         jsonb_build_array(jsonb_build_object('dossier_id', (select v from ctx where k = 'dossier'), 'amount', 630)),
         current_date, (select v from ctx where k = 'cash'), 'TND', 1, null, null, null, 'payment', true)
  from generate_series(1, 3) n;
select is((select balance from public.dossier_financials where dossier_id = (select v from ctx where k = 'dossier')), 0.000,
          'REC02 : trois tranches de 630 DT soldent le dossier');

-- Remboursement ultérieur de 100 DT avec avoir : écriture distincte, encaissements conservés
with i as (
  insert into public.invoices (kind, client_id, dossier_id) values ('invoice', '33333333-0000-0000-0000-000000000001', (select v from ctx where k = 'dossier')) returning id)
insert into ctx select 'inv_d', id from i ;
insert into public.invoice_lines (invoice_id, description, unit_price) values ((select v from ctx where k = 'inv_d'), 'Voyage Istanbul', 2390);
select public.validate_invoice((select v from ctx where k = 'inv_d'));
with c as (
  insert into public.invoices (kind, client_id, dossier_id, original_invoice_id, reason)
  values ('credit_note', '33333333-0000-0000-0000-000000000001', (select v from ctx where k = 'dossier'), (select v from ctx where k = 'inv_d'), 'Geste commercial')
  returning id)
insert into ctx select 'av_d', id from c;
insert into public.invoice_lines (invoice_id, description, unit_price) values ((select v from ctx where k = 'av_d'), 'Avoir geste commercial', 100);
select public.validate_invoice((select v from ctx where k = 'av_d'));
select public.record_payment('rec02-refund', 'out', 'cash', 100, '33333333-0000-0000-0000-000000000001', null,
         jsonb_build_array(jsonb_build_object('dossier_id', (select v from ctx where k = 'dossier'), 'amount', 100)),
         current_date, (select v from ctx where k = 'cash'), 'TND', 1, null, null, null, 'refund', true);
select is((select balance from public.dossier_financials where dossier_id = (select v from ctx where k = 'dossier')), 0.000,
          'Remboursement de 100 DT : solde mis à jour selon l''avoir');
select is((select count(*)::int from public.payments where client_id = '33333333-0000-0000-0000-000000000001' and direction = 'in'), 4,
          'Encaissements initiaux conservés');

-- ---------------------------------------------------------------- REC08
with i as (insert into public.invoices (kind, client_id) values ('invoice', '33333333-0000-0000-0000-000000000003') returning id)
insert into ctx select 'inv', id from i;
insert into public.invoice_lines (invoice_id, description, unit_price) values ((select v from ctx where k = 'inv'), 'Séminaire', 1000);
select ok(public.validate_invoice((select v from ctx where k = 'inv')) like 'FAC-%', 'Facture validée et numérotée');
select throws_like(format($$ update public.invoices set notes = 'x' where id = %L $$, (select v from ctx where k = 'inv')),
          '%figée%', 'Facture validée figée');
with c as (insert into public.invoices (kind, client_id, original_invoice_id, reason)
  values ('credit_note', '33333333-0000-0000-0000-000000000003', (select v from ctx where k = 'inv'), 'Remise') returning id)
insert into ctx select 'av', id from c;
insert into public.invoice_lines (invoice_id, description, unit_price) values ((select v from ctx where k = 'av'), 'Remise', 100);
select public.validate_invoice((select v from ctx where k = 'av'));
select public.record_payment('rec08-pay-0001', 'in', 'transfer', 500, '33333333-0000-0000-0000-000000000003', null,
         jsonb_build_array(jsonb_build_object('invoice_id', (select v from ctx where k = 'inv'), 'amount', 500)),
         current_date, (select v from ctx where k = 'bank'), 'TND', 1, 'VIR-1', null, null, 'payment', true);
select public.record_payment('rec08-pay-0001', 'in', 'transfer', 500, '33333333-0000-0000-0000-000000000003', null,
         jsonb_build_array(jsonb_build_object('invoice_id', (select v from ctx where k = 'inv'), 'amount', 500)),
         current_date, (select v from ctx where k = 'bank'), 'TND', 1, 'VIR-1', null, null, 'payment', true);
select is((select invoiced - credited from public.client_balances where client_id = '33333333-0000-0000-0000-000000000003'), 900.000,
          'REC08 : net facturé 900 DT');
select is((select balance from public.client_balances where client_id = '33333333-0000-0000-0000-000000000003'), 400.000,
          'REC08 : solde client 400 DT');
select is((select open_amount from public.invoice_balances where invoice_id = (select v from ctx where k = 'inv')), 400.000,
          'REC08 : solde de la facture 400 DT');
select is((select count(*)::int from public.payments where idempotency_key = 'rec08-pay-0001'), 1, 'REC08 : paiement non dupliqué');
select throws_like(format($$ insert into public.payment_allocations (payment_id, invoice_id, amount)
                             select id, %L, 1 from public.payments where idempotency_key = 'rec08-pay-0001' $$, (select v from ctx where k = 'inv')),
          'Affectation supérieure au montant disponible%', 'Double affectation impossible');
select throws_like(format($$ update public.payments set amount = 1 where idempotency_key = 'rec08-pay-0001' $$),
          '%validé%', 'Règlement validé non modifiable');

-- ---------------------------------------------------------------- REC09
create temp table treasury_before on commit drop as select id, balance from public.treasury_balances;
grant all on treasury_before to authenticated;
insert into ctx select 'chq', id from public.record_payment('rec09-chq-0001', 'in', 'cheque', 300, '33333333-0000-0000-0000-000000000003', null,
         '[]', current_date, (select v from ctx where k = 'bank'), 'TND', 1, null, 'CHQ-778899');
select public.create_deposit_slip((select v from ctx where k = 'bank'), array[(select v from ctx where k = 'chq')]);
select is((select status::text from public.payments where id = (select v from ctx where k = 'chq')), 'deposited', 'REC09 : chèque remis en banque');
select public.validate_payment((select v from ctx where k = 'chq'));
select public.reject_payment((select v from ctx where k = 'chq'), 'Provision insuffisante');
select is((select status::text from public.payments where id = (select v from ctx where k = 'chq')), 'rejected', 'REC09 : état rejeté conservé');
select is((select balance from public.treasury_balances where id = (select v from ctx where k = 'bank')),
          (select balance from treasury_before where id = (select v from ctx where k = 'bank')), 'REC09 : trésorerie disponible recalculée');
select is((select count(*)::int from public.treasury_movements where payment_id = (select v from ctx where k = 'chq')), 2,
          'REC09 : encaissement et rejet conservés comme mouvements distincts');
select is((select balance from public.client_balances where client_id = '33333333-0000-0000-0000-000000000003'), 400.000,
          'REC09 : créance client inchangée, sans double comptabilisation');

-- ---------------------------------------------------------------- REC10
create temp table tb10 on commit drop as select id, balance from public.treasury_balances;
grant all on tb10 to authenticated;
select public.transfer_funds((select v from ctx where k = 'cash'), (select v from ctx where k = 'bank'), 200);
select is((select b.balance - t.balance from public.treasury_balances b join tb10 t using (id) where b.id = (select v from ctx where k = 'cash')), -200.000, 'REC10 : caisse −200 DT');
select is((select b.balance - t.balance from public.treasury_balances b join tb10 t using (id) where b.id = (select v from ctx where k = 'bank')), 200.000, 'REC10 : banque +200 DT');
select is((select count(*)::int from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
            where e.source_type = 'transfer' and l.account_code like '7%'), 0, 'REC10 : revenu inchangé');

-- ---------------------------------------------------------------- REC11
with e as (insert into public.journal_entries (journal_code, entry_date, piece_ref, label) values ('OD', current_date, 'OD-TEST-1', 'Test REC11') returning id)
insert into ctx select 'je', id from e;
insert into public.journal_lines (entry_id, account_code, debit, credit) values
  ((select v from ctx where k = 'je'), '999999', 100, 0), ((select v from ctx where k = 'je'), '706', 0, 100);
select throws_like(format($$ select public.post_journal_entry(%L) $$, (select v from ctx where k = 'je')), 'Compte inexistant%', 'REC11 : compte inconnu refusé');
update public.journal_lines set account_code = '411', credit = 0, debit = 100 where entry_id = (select v from ctx where k = 'je') and account_code = '999999';
update public.journal_lines set credit = 90 where entry_id = (select v from ctx where k = 'je') and account_code = '706';
select throws_like(format($$ select public.post_journal_entry(%L) $$, (select v from ctx where k = 'je')), 'Pièce déséquilibrée%', 'REC11 : débit 100 / crédit 90 refusé');
select is((select status from public.journal_entries where id = (select v from ctx where k = 'je')), 'draft', 'REC11 : aucune ligne comptabilisée');
update public.journal_lines set credit = 100 where entry_id = (select v from ctx where k = 'je') and account_code = '706';
select ok(public.post_journal_entry((select v from ctx where k = 'je')) like 'OD-%', 'REC11 : pièce équilibrée validée');

-- ---------------------------------------------------------------- REC13
reset role;
insert into public.fiscal_periods (label, start_date, end_date, status) values ('Exercice 2025', '2025-01-01', '2025-12-31', 'closed');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000004","role":"authenticated"}', true);
set local role authenticated;
with e as (insert into public.journal_entries (journal_code, entry_date, piece_ref, label) values ('OD', '2025-06-30', 'OD-2025', 'Écriture période close') returning id)
insert into ctx select 'je_closed', id from e;
insert into public.journal_lines (entry_id, account_code, debit, credit) values
  ((select v from ctx where k = 'je_closed'), '411', 50, 0), ((select v from ctx where k = 'je_closed'), '706', 0, 50);
select throws_like(format($$ select public.post_journal_entry(%L) $$, (select v from ctx where k = 'je_closed')), 'Période comptable clôturée%', 'REC13 : écriture refusée en période clôturée');
select throws_like($$ select public.reopen_fiscal_period((select id from public.fiscal_periods where label = 'Exercice 2025'), 'correction') $$,
          'Accès refusé%', 'REC13 : réouverture réservée à un profil habilité');
select is((select sum(debit) - sum(credit) from public.trial_balance()), 0.000, 'REC13 : balance équilibrée');
select is((select balance from public.trial_balance() where account_code = '411'),
          (select sum(debit - credit) from public.general_ledger where account_code = '411'), 'REC13 : grand livre concordant avec la balance');

-- ---------------------------------------------------------------- REC12 / REC15
with s as (insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, total_amount)
  values ('55555555-0000-0000-0000-000000000004', 'TS-2026-118', current_date, 600) returning id)
insert into ctx select 'sinv', id from s;
select public.allocate_supplier_invoice((select v from ctx where k = 'sinv'),
  '[{"departure_id":"88888888-0000-0000-0000-000000000001","weight":60},{"departure_id":"88888888-0000-0000-0000-000000000002","weight":40}]', 'percent');
select results_eq(format($$ select amount from public.cost_allocations where supplier_invoice_id = %L order by amount desc $$, (select v from ctx where k = 'sinv')),
          $$ values (360.000::numeric), (240.000::numeric) $$, 'REC12 : 360 DT et 240 DT');
select throws_like(format($$ select public.allocate_supplier_invoice(%L, '[{"departure_id":"88888888-0000-0000-0000-000000000001","weight":1}]', 'manual', 1) $$, (select v from ctx where k = 'sinv')),
          'Surallocation%', 'REC12 : pièce jamais comptée deux fois');

with s as (insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, total_amount)
  values ('55555555-0000-0000-0000-000000000001', 'TB-HOTEL-3000', current_date, 3000) returning id)
insert into ctx select 'sinv15', id from s;
select public.allocate_supplier_invoice((select v from ctx where k = 'sinv15'), jsonb_build_array(
  jsonb_build_object('dossier_id', (select v from ctx where k = 'dossier'), 'weight', 4),
  jsonb_build_object('departure_id', '88888888-0000-0000-0000-000000000001', 'weight', 3),
  jsonb_build_object('departure_id', '88888888-0000-0000-0000-000000000002', 'weight', 3)), 'nights');
select results_eq(format($$ select amount from public.cost_allocations where supplier_invoice_id = %L order by created_at, amount desc $$, (select v from ctx where k = 'sinv15')),
          $$ values (1200.000::numeric), (900.000::numeric), (900.000::numeric) $$, 'REC15 : 1 200, 900 et 900 DT');

select throws_like($$ insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, total_amount)
                      values ('55555555-0000-0000-0000-000000000004', 'ts-2026-118', current_date, 600) $$,
          'Doublon probable%', 'Doublon de référence fournisseur signalé');
select lives_ok($$ insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, total_amount, duplicate_justification)
                   values ('55555555-0000-0000-0000-000000000004', 'TS-2026-118', current_date, 600, 'Facture rectificative du fournisseur') $$,
          'Exception justifiée acceptée');

select * from finish();
rollback;
