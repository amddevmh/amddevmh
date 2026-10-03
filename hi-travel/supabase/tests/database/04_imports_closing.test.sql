-- Recette imports (REC26, REC28) et clôture financière (CLO01/CLO02)
begin;
select plan(12);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;
insert into ctx select 'dossier', id from public.dossiers where reference = 'DOS-2026-00001';
insert into ctx select 'tpl', id from public.import_templates where kind = 'ticketing' and version = 1;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- Lot 1 : un billet nouveau
with b as (insert into public.import_batches (kind, template_id, file_name, file_sha256, platform)
  values ('ticketing', (select v from ctx where k = 'tpl'), 'rapport-octobre.csv', 'sha-1', 'plateforme-billetterie') returning id)
insert into ctx select 'b1', id from b;
insert into public.import_rows (batch_id, row_number, external_key, classification, raw, normalized, target_dossier_id, decision)
values ((select v from ctx where k = 'b1'), 2, '1991234567890', 'new', '{}',
  '{"ticket_number":"199-1234567890","pnr":"K8Q2LM","passenger_name":"BEN SALAH/MOHAMED","start_date":"2026-11-14","end_date":"2026-11-14","fare":700,"taxes":120,"fees":10,"cost":820,"currency":"TND","status":"issued","description":"TU — TUN-IST — BEN SALAH/MOHAMED"}',
  (select v from ctx where k = 'dossier'), 'apply');
select is((public.commit_import_batch((select v from ctx where k = 'b1')) ->> 'created')::int, 1, 'REC26 : nouvelle ligne intégrée');
select is((select count(*)::int from public.tickets where ticket_number = '199-1234567890'), 1, 'Billet créé');
select throws_like(format($$ select public.commit_import_batch(%L) $$, (select v from ctx where k = 'b1')), 'Lot déjà intégré%', 'Un lot ne s''intègre qu''une fois');

-- Lot 2 : même billet remboursé → évolution liée, pas une nouvelle vente
with b as (insert into public.import_batches (kind, template_id, file_name, file_sha256, platform)
  values ('ticketing', (select v from ctx where k = 'tpl'), 'rapport-novembre.csv', 'sha-2', 'plateforme-billetterie') returning id)
insert into ctx select 'b2', id from b;
insert into public.import_rows (batch_id, row_number, external_key, classification, raw, normalized, diff, target_dossier_id, decision)
values ((select v from ctx where k = 'b2'), 2, '1991234567890', 'modified', '{}',
  '{"ticket_number":"199-1234567890","status":"refunded","refund_amount":650,"cost":820,"currency":"TND"}',
  '{"status":{"old":"issued","new":"refunded"}}', (select v from ctx where k = 'dossier'), 'apply');
select is((public.commit_import_batch((select v from ctx where k = 'b2')) ->> 'updated')::int, 1, 'REC28 : réimport traité comme évolution');
select is((select count(*)::int from public.services where external_ref = '1991234567890'), 1, 'REC26 : aucune prestation dupliquée');
select is((select status from public.tickets where ticket_number = '199-1234567890'), 'refunded', 'REC28 : statut remboursé mis à jour');
select is((select jsonb_array_length(history) from public.external_records where external_key = '1991234567890'), 2, 'REC28 : historique conservé');
reset role;
select ok(exists (select 1 from public.alerts where kind = 'import_status_change' and dossier_id = (select v from ctx where k = 'dossier')),
          'REC28 : alerte coûts / remboursement créée');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- Lignes ignorées : invalides ou sans dossier cible
with b as (insert into public.import_batches (kind, template_id, file_name, file_sha256, platform)
  values ('ticketing', (select v from ctx where k = 'tpl'), 'rapport-erreurs.csv', 'sha-3', 'plateforme-billetterie') returning id)
insert into ctx select 'b3', id from b;
insert into public.import_rows (batch_id, row_number, external_key, classification, errors, raw, normalized, decision) values
  ((select v from ctx where k = 'b3'), 2, null, 'invalid', '[{"field":"currency","message":"Devise absente"}]', '{}', '{}', 'apply'),
  ((select v from ctx where k = 'b3'), 3, '1990000000001', 'ambiguous', '[]', '{}', '{"ticket_number":"199-0000000001"}', 'apply');
select is((public.commit_import_batch((select v from ctx where k = 'b3')) ->> 'skipped')::int, 2, 'REC27 : lignes invalides ou ambiguës non intégrées');

-- ---------------------------------------------------------------- Clôture financière
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000004","role":"authenticated"}', true);
select throws_like(format($$ select public.close_dossier_financially(%L) $$, (select v from ctx where k = 'dossier')),
          'Clôture impossible%', 'CLO01 : clôture refusée (voyage non terminé, solde, coûts)');
select throws_like(format($$ select public.close_dossier_financially(%L, 'Exception test') $$, (select v from ctx where k = 'dossier')),
          'Accès refusé%', 'CLO02 : clôture avec exception réservée au droit de validation des dossiers');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000001","role":"authenticated"}', true);
select public.close_dossier_financially((select v from ctx where k = 'dossier'), 'Remboursement fournisseur attendu, suivi par la finance');
select is((select financial_status from public.dossiers where id = (select v from ctx where k = 'dossier')), 'closed_with_exception',
          'CLO02 : exception motivée, dette/créance non masquées (alerte de suivi)');

select * from finish();
rollback;
