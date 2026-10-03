-- Recette : devis → dossier, places, changements, confirmation (REC01, REC03, REC04)
begin;
select plan(21);

-- Contexte : commercial connecté
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000002","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------- REC01
create temp table ctx (k text primary key, v uuid) on commit drop;
grant all on ctx to authenticated;

with q as (
  insert into public.quotes (client_id, activity, title)
  values ('33333333-0000-0000-0000-000000000002', 'tailor_made', 'Famille Trabelsi — Dubaï') returning id)
insert into ctx select 'quote', id from q;
with v as (
  insert into public.quote_versions (quote_id, version_no, start_date, end_date, adults, children, infants,
    payment_terms)
  values ((select v from ctx where k = 'quote'), 1, '2027-04-01', '2027-04-08', 2, 1, 1,
    '[{"label":"Acompte","kind":"deposit","percent":30,"due_date":"2027-01-10"},{"label":"Solde","kind":"balance","percent":70,"days_before_departure":21}]')
  returning id)
insert into ctx select 'v1', id from v;
insert into public.quote_lines (version_id, position, activity, service_type, description, pax_type, quantity, unit_cost, unit_price, is_optional, option_selected) values
  ((select v from ctx where k = 'v1'), 1, 'ticketing', 'flight', 'Vols adultes', 'adult', 2, 900, 1000, false, false),
  ((select v from ctx where k = 'v1'), 2, 'ticketing', 'flight', 'Vol enfant', 'child', 1, 700, 800, false, false),
  ((select v from ctx where k = 'v1'), 3, 'ticketing', 'flight', 'Vol bébé', 'infant', 1, 100, 150, false, false),
  ((select v from ctx where k = 'v1'), 4, 'hotel_intl', 'hotel', 'Hôtel 7 nuits', 'all', 1, 2500, 3000, false, false),
  ((select v from ctx where k = 'v1'), 5, 'tailor_made', 'excursion', 'Safari désert (option)', 'all', 1, 200, 350, true, false);

select is((select total_price from public.quote_version_totals where version_id = (select v from ctx where k = 'v1')),
          5950.000, 'Prix devis : adultes, enfant, bébé et hôtel ; option non retenue exclue');
select is((select optional_total from public.quote_version_totals where version_id = (select v from ctx where k = 'v1')),
          350.000, 'Option non retenue chiffrée séparément');

-- Nouvelle version avec révision de prix, v1 envoyée et figée
select public.mark_quote_version_sent((select v from ctx where k = 'v1'));
select throws_ok(
  format('update public.quote_lines set unit_price = 1 where version_id = %L', (select v from ctx where k = 'v1')),
  'P0001', null, 'Version envoyée figée');
insert into ctx values ('v2', public.create_quote_version((select v from ctx where k = 'quote')));
update public.quote_lines set unit_price = 2900 where version_id = (select v from ctx where k = 'v2') and position = 4;
update public.quote_lines set option_selected = true where version_id = (select v from ctx where k = 'v2') and position = 5;

insert into ctx values ('dossier', public.accept_quote_version((select v from ctx where k = 'v2'), 'Accord client'));
select isnt((select v from ctx where k = 'dossier'), null, 'REC01 : dossier créé à l''acceptation');
select is((select total_price from public.dossiers where id = (select v from ctx where k = 'dossier')), 6200.000,
          'REC01 : prix révisé de la version acceptée repris (avec option retenue)');
select is((select count(*)::int from public.services where dossier_id = (select v from ctx where k = 'dossier')), 5,
          'REC01 : prestations reprises sans ressaisie');
select is((select status::text from public.quote_versions where id = (select v from ctx where k = 'v1')), 'superseded',
          'REC01 : version non retenue conservée comme remplacée');
select is((select status::text from public.quote_versions where id = (select v from ctx where k = 'v2')), 'accepted',
          'REC01 : version acceptée conservée');
select is(public.accept_quote_version((select v from ctx where k = 'v2')), (select v from ctx where k = 'dossier'),
          'REC01 : acceptation répétée idempotente (même dossier)');
select is((select count(*)::int from public.dossiers where quote_id = (select v from ctx where k = 'quote')), 1,
          'REC01 : un seul dossier, aucun second client');
select is((select sum(amount) from public.payment_schedule_items where dossier_id = (select v from ctx where k = 'dossier')),
          6200.000, 'Échéancier en pourcentage reconstitue le total');

-- ---------------------------------------------------------------- REC03
-- Départ SUD-2026-11-05 : capacité 2
select lives_ok($$ select public.hold_departure_seats('88888888-0000-0000-0000-000000000004', 1, 'option') $$, 'Option sur 1 place');
select lives_ok($$ select public.hold_departure_seats('88888888-0000-0000-0000-000000000004', 1, 'confirmed') $$, 'Dernière place confirmée');
select throws_like($$ select public.hold_departure_seats('88888888-0000-0000-0000-000000000004', 1, 'confirmed') $$,
          'Capacité insuffisante%', 'REC03 : la place n''est plus disponible');
reset role;
select throws_ok($$ update public.departures set seats_confirmed = 3 where id = '88888888-0000-0000-0000-000000000004' $$,
          '23514', null, 'REC03 : contrainte base de données — capacité jamais dépassée');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- ---------------------------------------------------------------- REC04
-- Opérations modifie le vol du dossier de référence : le transfert lié est signalé, jamais déplacé ni confirmé
insert into ctx select 'flight', id from public.services where service_type = 'flight'
   and dossier_id = (select id from public.dossiers where reference = 'DOS-2026-00001');
insert into ctx select 'transfer', id from public.services where service_type = 'transfer'
   and dossier_id = (select id from public.dossiers where reference = 'DOS-2026-00001');
create temp table transfer_before on commit drop as select start_at, status from public.services where id = (select v from ctx where k = 'transfer');

update public.services set start_at = start_at + interval '3 hours' where id = (select v from ctx where k = 'flight');

select ok((select needs_review from public.services where id = (select v from ctx where k = 'transfer')), 'REC04 : transfert lié signalé');
select is((select start_at from public.services where id = (select v from ctx where k = 'transfer')),
          (select start_at from transfer_before), 'REC04 : transfert non déplacé automatiquement');
select is((select status::text from public.services where id = (select v from ctx where k = 'transfer')),
          (select status::text from transfer_before), 'REC04 : transfert non confirmé automatiquement');
select ok(exists (select 1 from public.tasks where service_id = (select v from ctx where k = 'transfer') and source = 'trigger:service_changed'),
          'REC04 : tâche de vérification créée');
reset role;
select ok(exists (select 1 from public.audit_log where record_id = (select v from ctx where k = 'flight') and changed ? 'start_at'),
          'Historique : ancienne et nouvelle valeur conservées');

set local role authenticated;
-- Confirmation bloquée tant que les prérequis manquent
select throws_like(format($$ select public.confirm_dossier(%L) $$, (select id from public.dossiers where reference = 'DOS-2026-00001')),
          'Dossier non confirmable%', 'Confirmation refusée : prestations non confirmées / documents manquants');

select * from finish();
rollback;
