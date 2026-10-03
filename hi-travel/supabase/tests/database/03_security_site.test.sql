-- Recette sécurité, site public, espace client, paiement en ligne, imports
-- REC05, REC06, REC20, REC26, REC28, REC48, REC49, REC51, REC52
begin;
select plan(38);

create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated, anon;
insert into ctx select 'dossier', id from public.dossiers where reference = 'DOS-2026-00001';

-- ---------------------------------------------------------------- Anonyme (site public)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select ok((select count(*) from public.site_offers) >= 5, 'REC05 : offres publiées visibles');
select is((select count(*)::int from public.site_offers where slug = 'istanbul-2025-archive'), 0, 'REC49 : offre archivée absente du site');
select is((select count(*)::int from public.offers), 0, 'Table interne des offres inaccessible');
select ok(not exists (select 1 from information_schema.columns where table_name = 'site_offers'
            and column_name in ('internal_notes', 'estimated_cost', 'owner_id')), 'REC05 : aucune donnée interne exposée');
select is((select availability from public.site_departures where code = 'IST-2026-09-12'), 'expired', 'REC49 : départ passé non réservable');
select is((select count(*)::int from public.clients), 0, 'Clients invisibles pour un anonyme');
select throws_ok($$ select public.find_client_duplicates('client@hitravel.test', null) $$, '42501', null, 'Recherche de doublons interdite à l''anonyme');
select throws_ok($$ select public.record_payment('anon-key-123456', 'in', 'cash', 1, '33333333-0000-0000-0000-000000000001') $$, '42501', null, 'Fonctions métier interdites à l''anonyme');

-- REC48 : soumission unique, double clic sans doublon
select is((public.submit_site_request('{"submission_token":"rec48-token-000000000001","activity":"visa","first_name":"Aya","last_name":"Mejri","email":"aya@example.test","phone":"+216 20 123 456","destination":"France","processing_consent":true}'::jsonb) ->> 'duplicate_submission'), 'false', 'REC48 : demande créée');
select is((public.submit_site_request('{"submission_token":"rec48-token-000000000001","activity":"visa","first_name":"Aya","last_name":"Mejri","email":"aya@example.test","phone":"+216 20 123 456","destination":"France","processing_consent":true}'::jsonb) ->> 'duplicate_submission'), 'true', 'REC48 : double clic sans création en double');
select throws_like($$ select public.submit_site_request('{"submission_token":"rec48-token-000000000002","activity":"visa","last_name":"X","email":"x@example.test"}'::jsonb) $$,
  'Accord nécessaire%', 'Accord de traitement obligatoire, distinct du consentement marketing');
-- Contact déjà connu : rattaché si e-mail et téléphone concordent, sinon signalé sans fusion
select public.submit_site_request('{"submission_token":"rec48-token-000000000003","activity":"hotel_tn","first_name":"Mohamed","last_name":"Ben Salah","email":"client@hitravel.test","phone":"22 111 222","processing_consent":true}'::jsonb);
select public.submit_site_request('{"submission_token":"rec48-token-000000000004","activity":"hotel_tn","first_name":"M","last_name":"Inconnu","email":"client@hitravel.test","phone":"+216 99 999 999","processing_consent":true}'::jsonb);
reset role;
select is((select client_id from public.leads where submission_token = 'rec48-token-000000000003'), '33333333-0000-0000-0000-000000000001'::uuid,
          'Contact connu rattaché (e-mail et téléphone concordants)');
select ok((select client_id is null and '33333333-0000-0000-0000-000000000001' = any (possible_duplicate_client_ids)
             from public.leads where submission_token = 'rec48-token-000000000004'), 'Contact ambigu signalé sans fusion aveugle');
select is((select source::text from public.leads where submission_token = 'rec48-token-000000000001'), 'website', 'REC48 : source Site web conservée');
select ok((select owner_id is not null from public.leads where submission_token = 'rec48-token-000000000001'), 'REC48 : affectation selon la règle');

-- ---------------------------------------------------------------- REC06 / REC20 : profil gestion du site
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.traveller_identity_documents), 0, 'REC06 : passeports inaccessibles au profil site');
select is((select count(*)::int from public.documents where kind = 'passport'), 0, 'REC06 : pièce passeport inaccessible, y compris par accès direct');
select is((select count(*)::int from public.dossier_financials), 0, 'REC06 : rapport de marge inaccessible');
select is((select count(*)::int from public.offer_costings), 0, 'Coûts des offres inaccessibles au profil site');
select is((select count(*)::int from public.services), 0, 'Prestations et coûts fournisseurs inaccessibles');
select ok((select count(*) from public.offers) > 0, 'Le profil site gère les offres');
select throws_ok($$ select public.post_journal_entry(gen_random_uuid()) $$, '42501', null, 'Validation comptable refusée au profil site');

-- Opérations : voit les dossiers mais pas les marges (REC20)
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000003","role":"authenticated"}', true);
select ok((select margin_forecast is null and cost_planned is null and sale_net is not null from public.dossier_financials
             where dossier_id = (select v from ctx where k = 'dossier')), 'REC20 : marges masquées sans droit');
select ok((select count(*) from public.traveller_identity_documents) > 0, 'Opérations : passeports accessibles (rôle autorisé)');
-- Commercial : marges visibles
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000002","role":"authenticated"}', true);
select ok((select margin_forecast is not null from public.dossier_financials where dossier_id = (select v from ctx where k = 'dossier')),
          'Commercial : marges visibles');

-- ---------------------------------------------------------------- REC51 : espace client
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.dossiers), 0, 'REC51 : aucun accès aux dossiers d''un autre client');
select is((select count(*)::int from public.dossiers where id = (select v from ctx where k = 'dossier')), 0, 'REC51 : accès direct par identifiant refusé');
select is((select count(*)::int from public.documents), 0, 'REC51 : aucun document d''un autre client');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.dossiers), 1, 'Client : son dossier est visible');
select is((select count(*)::int from public.documents), 1, 'Client : seul le document publié est visible (passeport interne exclu)');
select is((select count(*)::int from public.services), 0, 'Client : coûts fournisseurs jamais visibles');
select is((select balance from public.portal_dossier_balances where dossier_id = (select v from ctx where k = 'dossier')), 1890.000, 'Client : solde de son dossier');

-- ---------------------------------------------------------------- REC52 : paiement en ligne
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.payment_intents (dossier_id, client_id, amount, provider, provider_session_id)
values ((select v from ctx where k = 'dossier'), '33333333-0000-0000-0000-000000000001', 630, 'mockpay', 'cs_test_rec52');
select is(public.process_payment_event('mockpay', 'evt_forged', 'payment.succeeded', 'cs_test_rec52', 630, '{}', false), 'invalid_signature',
          'REC52 : retour falsifié / signature invalide sans encaissement');
select is(public.process_payment_event('mockpay', 'evt_1', 'payment.succeeded', 'cs_test_rec52', 630, '{}', true), 'payment_recorded', 'REC52 : paiement vérifié enregistré');
select is(public.process_payment_event('mockpay', 'evt_1', 'payment.succeeded', 'cs_test_rec52', 630, '{}', true), 'duplicate_event_ignored', 'REC52 : notification répétée ignorée');
select is(public.process_payment_event('mockpay', 'evt_2', 'payment.succeeded', 'cs_test_rec52', 630, '{}', true), 'already_succeeded', 'REC52 : second événement de succès sans doublon');
select is((select count(*)::int from public.payments where online_intent_id is not null), 1, 'REC52 : un seul encaissement');
select is((select count(*)::int from public.services where dossier_id = (select v from ctx where k = 'dossier') and status = 'confirmed'), 0,
          'REC52 : le paiement ne confirme pas les prestations');

select * from finish();
rollback;
