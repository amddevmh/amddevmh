-- =====================================================================
-- Données de démonstration (environnement local / recette uniquement)
-- Mot de passe de tous les comptes de démo : HiTravel2026!
-- =====================================================================

-- ---------------------------------------------------------------------
-- Comptes
-- ---------------------------------------------------------------------
create or replace function pg_temp.create_user(p_id uuid, p_email text, p_name text)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('HiTravel2026!', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
end $$;

select pg_temp.create_user('11111111-1111-1111-1111-000000000001', 'direction@hitravel.test', 'Sonia Direction');
select pg_temp.create_user('11111111-1111-1111-1111-000000000002', 'commercial@hitravel.test', 'Karim Commercial');
select pg_temp.create_user('11111111-1111-1111-1111-000000000003', 'operations@hitravel.test', 'Amel Opérations');
select pg_temp.create_user('11111111-1111-1111-1111-000000000004', 'finance@hitravel.test', 'Hichem Finance');
select pg_temp.create_user('11111111-1111-1111-1111-000000000005', 'site@hitravel.test', 'Nour Gestion du site');
select pg_temp.create_user('22222222-2222-2222-2222-000000000001', 'client@hitravel.test', 'Mohamed Ben Salah');
select pg_temp.create_user('22222222-2222-2222-2222-000000000002', 'client2@hitravel.test', 'Leila Trabelsi');

insert into public.staff_profiles (id, full_name, email, role) values
  ('11111111-1111-1111-1111-000000000001', 'Sonia Direction', 'direction@hitravel.test', 'direction'),
  ('11111111-1111-1111-1111-000000000002', 'Karim Commercial', 'commercial@hitravel.test', 'commercial'),
  ('11111111-1111-1111-1111-000000000003', 'Amel Opérations', 'operations@hitravel.test', 'operations'),
  ('11111111-1111-1111-1111-000000000004', 'Hichem Finance', 'finance@hitravel.test', 'finance'),
  ('11111111-1111-1111-1111-000000000005', 'Nour Gestion du site', 'site@hitravel.test', 'site');
update public.staff_profiles set backup_id = '11111111-1111-1111-1111-000000000001' where role <> 'direction';

insert into public.lead_assignment_rules (activity, owner_id)
select a, case when a in ('visa', 'transport') then '11111111-1111-1111-1111-000000000003'::uuid
               else '11111111-1111-1111-1111-000000000002'::uuid end
  from unnest(enum_range(null::public.activity)) a
 where a <> 'mice';   -- MICE : file « à attribuer » pour démontrer l'affectation manuelle

-- ---------------------------------------------------------------------
-- Clients et voyageurs
-- ---------------------------------------------------------------------
insert into public.clients (id, kind, first_name, last_name, email, phone, city, source, consents, owner_id) values
  ('33333333-0000-0000-0000-000000000001', 'person', 'Mohamed', 'Ben Salah', 'client@hitravel.test', '+216 22 111 222', 'Tunis', 'phone',
   '{"processing": true, "marketing": false}', '11111111-1111-1111-1111-000000000002'),
  ('33333333-0000-0000-0000-000000000002', 'person', 'Leila', 'Trabelsi', 'client2@hitravel.test', '+216 98 333 444', 'Sousse', 'website',
   '{"processing": true, "marketing": true}', '11111111-1111-1111-1111-000000000002');
insert into public.clients (id, kind, company_name, tax_id, email, phone, city, source, commercial_terms) values
  ('33333333-0000-0000-0000-000000000003', 'company', 'Société Atlas Industries', '1234567/A/M/000', 'rh@atlas.test', '+216 71 000 111', 'Tunis', 'email',
   'Paiement à 30 jours, bon de commande obligatoire');
insert into public.client_contacts (client_id, full_name, role, email, is_decision_maker) values
  ('33333333-0000-0000-0000-000000000003', 'Rym Haddad', 'DRH', 'rym.haddad@atlas.test', true);

insert into public.client_accounts (user_id, client_id) values
  ('22222222-2222-2222-2222-000000000001', '33333333-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-000000000002', '33333333-0000-0000-0000-000000000002');

insert into public.travellers (id, client_id, first_name, last_name, birth_date, pax_type, nationality) values
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001', 'Mohamed', 'Ben Salah', '1980-04-12', 'adult', 'TN'),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 'Ines', 'Ben Salah', '1984-09-02', 'adult', 'TN'),
  ('44444444-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001', 'Youssef', 'Ben Salah', '2016-06-20', 'child', 'TN'),
  ('44444444-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002', 'Leila', 'Trabelsi', '1990-01-15', 'adult', 'TN');
insert into public.traveller_identity_documents (traveller_id, passport_number, issuing_country, expiry_date) values
  ('44444444-0000-0000-0000-000000000001', 'P1234567', 'TN', '2031-03-01'),
  ('44444444-0000-0000-0000-000000000002', 'P7654321', 'TN', '2029-11-15');

-- ---------------------------------------------------------------------
-- Fournisseurs, hôtels, correspondances API
-- ---------------------------------------------------------------------
insert into public.suppliers (id, name, kind, country, currency, email, phone, destinations, withholding_applicable) values
  ('55555555-0000-0000-0000-000000000001', 'Tunisiabeds', 'hotel_platform', 'TN', 'TND', 'b2b@tunisiabeds.test', null, '{Hammamet,Sousse,Djerba}', true),
  ('55555555-0000-0000-0000-000000000002', 'MyGo', 'hotel_platform', 'TN', 'TND', 'b2b@mygo.test', null, '{Hammamet,Monastir,Tozeur}', true),
  ('55555555-0000-0000-0000-000000000003', 'Tunisair', 'airline', 'TN', 'TND', null, null, '{Istanbul,Jeddah,Paris}', false),
  ('55555555-0000-0000-0000-000000000004', 'Transport Sahel', 'transport', 'TN', 'TND', 'contact@sahel-transport.test', '+216 73 000 000', '{Sousse,Monastir,Hammamet}', true),
  ('55555555-0000-0000-0000-000000000005', 'Centre visa (TLS)', 'visa_center', 'TN', 'TND', null, null, '{France}', false),
  ('55555555-0000-0000-0000-000000000006', 'Bosphorus DMC', 'hotel_platform', 'TR', 'EUR', 'ops@bosphorus.test', null, '{Istanbul}', false),
  ('55555555-0000-0000-0000-000000000007', 'Plateforme billetterie (rapports)', 'ticketing_platform', 'TN', 'TND', null, null, '{}', false),
  ('55555555-0000-0000-0000-000000000008', 'Al Haram Services', 'hotel_platform', 'SA', 'SAR', null, null, '{Médine,La Mecque}', false);

insert into public.hotels (id, name, country, city, category, supplier_id, room_types, boards) values
  ('66666666-0000-0000-0000-000000000001', 'Marina Palace', 'TN', 'Hammamet', 4, '55555555-0000-0000-0000-000000000001', '{Double,Single,Triple,Familiale}', '{LPD,DP,PC,ALL}'),
  ('66666666-0000-0000-0000-000000000002', 'Radisson Blu Resort & Thalasso', 'TN', 'Hammamet', 5, '55555555-0000-0000-0000-000000000001', '{Double,Single,Suite}', '{LPD,DP}'),
  ('66666666-0000-0000-0000-000000000003', 'Concorde Green Park Palace', 'TN', 'Port El Kantaoui', 5, '55555555-0000-0000-0000-000000000002', '{Double,Single,Familiale}', '{DP,PC,ALL}'),
  ('66666666-0000-0000-0000-000000000004', 'Paradis Palace', 'TN', 'Hammamet', 4, '55555555-0000-0000-0000-000000000002', '{Double,Single,Triple}', '{DP,ALL}'),
  ('66666666-0000-0000-0000-000000000005', 'Hôtel Sultanahmet Center', 'TR', 'Istanbul', 4, '55555555-0000-0000-0000-000000000006', '{Double,Single}', '{LPD}');

-- Marina Palace présent chez les deux fournisseurs (REC24)
insert into public.hotel_mappings (hotel_id, provider, provider_hotel_code, provider_hotel_name) values
  ('66666666-0000-0000-0000-000000000001', 'hotel_api_tunisiabeds', 'TB-HAM-001', 'Marina Palace Hammamet'),
  ('66666666-0000-0000-0000-000000000002', 'hotel_api_tunisiabeds', 'TB-HAM-002', 'Radisson Blu Hammamet'),
  ('66666666-0000-0000-0000-000000000004', 'hotel_api_tunisiabeds', 'TB-HAM-003', 'Paradis Palace'),
  ('66666666-0000-0000-0000-000000000001', 'hotel_api_mygo', 'MG-7781', 'MARINA PALACE HAMMAMET'),
  ('66666666-0000-0000-0000-000000000003', 'hotel_api_mygo', 'MG-5520', 'CONCORDE GREEN PARK'),
  ('66666666-0000-0000-0000-000000000004', 'hotel_api_mygo', 'MG-7790', 'PARADIS PALACE');

insert into public.hotel_rates (hotel_id, season, valid_from, valid_to, room_type, board, price_per_night, single_supplement, child_discount_pct) values
  ('66666666-0000-0000-0000-000000000001', 'Été 2027', '2027-06-01', '2027-09-30', 'Double', 'DP', 180.000, 45.000, 50),
  ('66666666-0000-0000-0000-000000000001', 'Été 2027', '2027-06-01', '2027-09-30', 'Double', 'ALL', 235.000, 55.000, 50),
  ('66666666-0000-0000-0000-000000000003', 'Été 2027', '2027-06-01', '2027-09-30', 'Double', 'ALL', 310.000, 70.000, 50);

insert into public.fx_rates (currency, rate_to_tnd, rate_date, source) values
  ('EUR', 3.390000, '2026-10-01', 'fx_mock'),
  ('USD', 3.110000, '2026-10-01', 'fx_mock'),
  ('SAR', 0.829000, '2026-10-01', 'fx_mock');

-- ---------------------------------------------------------------------
-- Offres et départs (photos : visuels hitravel.tn)
-- ---------------------------------------------------------------------
insert into public.offers (id, slug, title, activity, is_omra, destination, country, duration_days, nights, summary, program, hotels, board,
  indicative_flights, inclusions, exclusions, conditions, photos, price_amount, price_basis, occupancy_basis, deposit_amount,
  featured, sort_order, status, seo_title, seo_description, internal_notes) values
  ('77777777-0000-0000-0000-000000000001', 'istanbul-8-jours', 'Istanbul — 8 jours / 7 nuits', 'organized_trip', false, 'Istanbul', 'TR', 8, 7,
   'Découvrez Istanbul entre Europe et Asie : Sainte-Sophie, la Mosquée Bleue, le Grand Bazar et une croisière sur le Bosphore.',
   '[{"day":1,"title":"Tunis → Istanbul","description":"Vol, accueil et transfert à l''hôtel."},{"day":2,"title":"Vieille ville","description":"Sainte-Sophie, Mosquée Bleue, Hippodrome."},{"day":3,"title":"Bosphore","description":"Croisière et quartier d''Ortaköy."},{"day":4,"title":"Journée libre","description":"Shopping au Grand Bazar."},{"day":8,"title":"Retour","description":"Transfert à l''aéroport et vol retour."}]',
   '[{"name":"Hôtel Sultanahmet Center 4*","city":"Istanbul","nights":7,"board":"LPD"}]', 'LPD',
   'Tunisair TU 214 / TU 215 (indicatif)', '{"Vols aller-retour","7 nuits en LPD","Transferts aéroport","Croisière sur le Bosphore","Accompagnateur HI Travel"}',
   '{"Assurance voyage","Dépenses personnelles","Pourboires"}', 'Prix par personne en chambre double. Acompte de 500 DT à la réservation, solde 15 jours avant le départ.',
   '[{"url":"https://admin.hitravel.tn/uploads/Accueil/Slider/410748882a4c9e9ea2231ec3e5582d16fd5c989b.png","alt":"Istanbul"}]',
   2390.000, 'per_person', 'Base chambre double', 500.000, true, 1, 'published',
   'Voyage organisé Istanbul 8 jours | HI Travel', 'Voyage organisé à Istanbul au départ de Tunis : vols, hôtel 4*, visites et accompagnateur.', 'Marge cible 12 %'),
  ('77777777-0000-0000-0000-000000000002', 'omra-ramadan-2027', 'Omra Ramadan 2027 — 15 jours', 'organized_trip', true, 'Médine et La Mecque', 'SA', 15, 14,
   'Programme Omra complet pendant le mois de Ramadan avec encadrement religieux, hôtels proches du Haram et transferts.',
   '[{"day":1,"title":"Départ vers Médine","description":"Vol et installation à l''hôtel."},{"day":6,"title":"Médine → La Mecque","description":"Transfert et accomplissement de la Omra."},{"day":15,"title":"Retour","description":"Vol retour vers Tunis."}]',
   '[{"name":"Hôtel à Médine (5 nuits)","city":"Médine","nights":5,"board":"DP"},{"name":"Hôtel à La Mecque (9 nuits)","city":"La Mecque","nights":9,"board":"DP"}]', 'DP',
   'Vols réguliers Tunis – Médine / Jeddah – Tunis (indicatif)', '{"Vols","Visa Omra","Hôtels proches du Haram","Transferts","Encadrement"}',
   '{"Dépenses personnelles","Repas non mentionnés"}', 'Prix à partir de, par personne en chambre quadruple. Conditions d''annulation communiquées au devis.',
   '[{"url":"https://admin.hitravel.tn/uploads/Accueil/Slider/43b4527a432953dae228d7a3d903796c73ac2258.png","alt":"Omra"}]',
   6900.000, 'from', 'Base chambre quadruple', 1500.000, true, 2, 'published',
   'Omra Ramadan 2027 | HI Travel', 'Omra Ramadan 2027 au départ de Tunis : vols, visa, hôtels et encadrement.', null),
  ('77777777-0000-0000-0000-000000000003', 'circuit-sud-tunisien', 'Circuit Sud tunisien — 4 jours', 'circuit', false, 'Douz, Tozeur, Matmata', 'TN', 4, 3,
   'Dunes de Douz, oasis de montagne de Chebika et Tamerza, Chott el Jérid et habitations troglodytes de Matmata.',
   '[{"day":1,"title":"Tunis → Matmata","description":"Route vers le sud, déjeuner et visite des maisons troglodytes."},{"day":2,"title":"Douz","description":"Balade à dos de dromadaire."},{"day":3,"title":"Tozeur","description":"Oasis de montagne en 4x4."},{"day":4,"title":"Retour","description":"Kairouan et retour à Tunis."}]',
   '[]', 'DP', null, '{"Transport en bus climatisé","3 nuits en DP","Guide","Excursion 4x4"}', '{"Boissons","Pourboires"}',
   'Départ garanti à partir de 15 participants.', '[{"url":"https://admin.hitravel.tn/uploads/Accueil/Slider/24faf7117625444056ec63f4989a6343d201df47.png","alt":"Sud tunisien"}]',
   690.000, 'per_person', 'Base chambre double', 200.000, false, 3, 'published', null, null, null),
  ('77777777-0000-0000-0000-000000000004', 'sejour-hammamet-marina-palace', 'Séjour Marina Palace Hammamet 4*', 'hotel_tn', false, 'Hammamet', 'TN', null, null,
   'Hôtel 4* à Hammamet, accès direct à la plage, en demi-pension ou all inclusive.', '[]',
   '[{"name":"Marina Palace 4*","city":"Hammamet","board":"DP / ALL"}]', 'DP', null, '{"Hébergement","Pension choisie"}', '{"Transport"}',
   'Prix à partir de, par personne et par nuit en chambre double, selon disponibilité.',
   '[{"url":"https://admin.hitravel.tn/uploads/Accueil/Slider/0c23cc09f1164dfbf7f58d2ae21c9dc859d94802.png","alt":"Hammamet"}]',
   95.000, 'from', 'Par personne et par nuit, chambre double', null, true, 4, 'published', null, null, null),
  ('77777777-0000-0000-0000-000000000005', 'seminaire-incentive-tozeur', 'Séminaire & incentive à Tozeur', 'mice', false, 'Tozeur', 'TN', 3, 2,
   'Séminaire résidentiel et activités de cohésion dans le désert : salle équipée, hébergement, dîner sous tente et excursion.',
   '[]', '[]', 'PC', null, '{"Salle plénière","Pauses café","Hébergement","Activités"}', '{"Transport aérien"}',
   'Devis sur mesure selon effectif et format.', '[{"url":"https://admin.hitravel.tn/uploads/Accueil/Slider/f646369c531938e74cc46b06678a4538d0ef6b39.png","alt":"Tozeur"}]',
   450.000, 'from', 'Par participant, base 50 participants', null, false, 5, 'published', null, null, null),
  ('77777777-0000-0000-0000-000000000006', 'istanbul-2025-archive', 'Istanbul printemps 2025', 'organized_trip', false, 'Istanbul', 'TR', 7, 6,
   'Ancienne offre conservée pour l''historique.', '[]', '[]', 'LPD', null, '{}', '{}', null, '[]',
   1990.000, 'per_person', null, null, false, 99, 'archived', null, null, 'Offre 2025 — revue avant migration');

insert into public.offer_costings (offer_id, estimated_cost, target_margin_pct) values
  ('77777777-0000-0000-0000-000000000001', 2100.000, 12),
  ('77777777-0000-0000-0000-000000000002', 6100.000, 11);

insert into public.departures (id, offer_id, code, start_date, end_date, capacity, price_adult, price_child, single_supplement,
  deposit_amount, booking_deadline, supplier_option_deadline, min_participants) values
  ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'IST-2026-11-14', '2026-11-14', '2026-11-21', 30, 2390, 1790, 450, 500, '2026-10-30', '2026-10-25', 15),
  ('88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', 'IST-2026-12-19', '2026-12-19', '2026-12-26', 30, 2590, 1890, 450, 500, '2026-12-05', '2026-11-30', 15),
  ('88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000002', 'OMR-2027-02-20', '2027-02-20', '2027-03-06', 45, 6900, 5900, 1800, 1500, '2027-01-15', '2027-01-10', 20),
  ('88888888-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000003', 'SUD-2026-11-05', '2026-11-05', '2026-11-08', 2, 690, 520, 120, 200, '2026-10-29', null, 15),
  ('88888888-0000-0000-0000-000000000005', '77777777-0000-0000-0000-000000000001', 'IST-2026-09-12', '2026-09-12', '2026-09-19', 30, 2390, 1790, 450, 500, '2026-08-30', null, 15);

-- ---------------------------------------------------------------------
-- Scénario de référence : dossier de 2 390 DT, acompte 500 DT, 3 tranches de 630 DT
-- ---------------------------------------------------------------------
do $$
declare
  v_lead uuid;
  v_quote uuid;
  v_version uuid;
  v_dossier uuid;
  v_bank uuid;
  v_cash uuid;
  v_flight uuid;
  v_transfer uuid;
begin
  select id into v_bank from public.treasury_accounts where name = 'Banque principale';
  select id into v_cash from public.treasury_accounts where name = 'Caisse principale';

  insert into public.leads (client_id, activity, stage, source, owner_id, offer_id, departure_id, destination, date_from, adults, message,
    contact_snapshot, processing_consent)
  values ('33333333-0000-0000-0000-000000000001', 'organized_trip', 'quote', 'phone', '11111111-1111-1111-1111-000000000002',
    '77777777-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', 'Istanbul', '2026-11-14', 1,
    'Souhaite partir en novembre, chambre double partagée avec un ami.', '{"email": "client@hitravel.test"}', true)
  returning id into v_lead;

  insert into public.quotes (lead_id, client_id, activity, title, owner_id, offer_id, departure_id)
  values (v_lead, '33333333-0000-0000-0000-000000000001', 'organized_trip', 'Istanbul 8 jours — M. Ben Salah',
    '11111111-1111-1111-1111-000000000002', '77777777-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001')
  returning id into v_quote;

  insert into public.quote_versions (quote_id, version_no, start_date, end_date, adults, valid_until, payment_terms, client_notes)
  values (v_quote, 1, '2026-11-14', '2026-11-21', 1, '2026-10-20',
    '[{"label":"Acompte","kind":"deposit","amount":500,"due_date":"2026-10-05"},
      {"label":"Tranche 1","kind":"installment","amount":630,"due_date":"2026-10-15"},
      {"label":"Tranche 2","kind":"installment","amount":630,"due_date":"2026-10-25"},
      {"label":"Solde","kind":"balance","amount":630,"due_date":"2026-10-30"}]',
    'Prix par personne en chambre double.')
  returning id into v_version;

  insert into public.quote_lines (version_id, position, activity, service_type, description, supplier_id, start_date, end_date, unit_cost, unit_price, details) values
    (v_version, 1, 'ticketing', 'flight', 'Vol Tunis ⇄ Istanbul (TU 214 / TU 215)', '55555555-0000-0000-0000-000000000003', '2026-11-14', '2026-11-21', 820, 900, '{}'),
    (v_version, 2, 'hotel_intl', 'hotel', 'Hôtel Sultanahmet Center 4* — 7 nuits LPD, chambre double', '55555555-0000-0000-0000-000000000006', '2026-11-14', '2026-11-21', 0, 1240, '{"room_type":"Double","board":"LPD"}'),
    (v_version, 3, 'transport', 'transfer', 'Transferts aéroport ⇄ hôtel', '55555555-0000-0000-0000-000000000006', '2026-11-14', '2026-11-21', 60, 100, '{}'),
    (v_version, 4, 'organized_trip', 'excursion', 'Croisière sur le Bosphore', '55555555-0000-0000-0000-000000000006', '2026-11-16', '2026-11-16', 70, 150, '{}');
  -- Coût hôtel en EUR (taux daté)
  update public.quote_lines set unit_cost = 300, cost_currency = 'EUR', fx_rate = 3.39 where version_id = v_version and position = 2;

  perform public.mark_quote_version_sent(v_version, 'email');
  v_dossier := public.accept_quote_version(v_version, 'Accord téléphonique du client');

  update public.dossiers set owner_id = '11111111-1111-1111-1111-000000000002' where id = v_dossier;
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (v_dossier, '44444444-0000-0000-0000-000000000001', true);
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000001', 1, 'confirmed', v_dossier);

  select id into v_flight from public.services where dossier_id = v_dossier and service_type = 'flight';
  select id into v_transfer from public.services where dossier_id = v_dossier and service_type = 'transfer';
  -- Horaires saisis avant de lier les prestations (le lien déclenche ensuite le contrôle des changements)
  update public.services set start_at = '2026-11-14 09:15+01', end_at = '2026-11-21 18:40+01', status = 'option',
         option_deadline = '2026-10-25 12:00+01' where id = v_flight;
  update public.services set start_at = '2026-11-14 13:30+03', local_timezone = 'Europe/Istanbul' where id = v_transfer;
  update public.services set linked_service_id = v_flight where id = v_transfer;
  insert into public.flight_segments (service_id, seq, carrier, flight_number, from_airport, to_airport, departs_at, departs_tz, arrives_at, arrives_tz, pnr, baggage) values
    (v_flight, 1, 'TU', 'TU214', 'TUN', 'IST', '2026-11-14 09:15+01', 'Africa/Tunis', '2026-11-14 12:45+03', 'Europe/Istanbul', 'K8Q2LM', '23 kg'),
    (v_flight, 2, 'TU', 'TU215', 'IST', 'TUN', '2026-11-21 14:10+03', 'Europe/Istanbul', '2026-11-21 15:40+01', 'Africa/Tunis', 'K8Q2LM', '23 kg');
  insert into public.external_deadlines (dossier_id, service_id, kind, label, due_at, source, source_note, received_at) values
    (v_dossier, v_flight, 'ticket_issue', 'Limite d''émission des billets', '2026-10-25 12:00+01', 'supplier', 'Mail Tunisair groupe', now());
  insert into public.external_deadlines (dossier_id, kind, label, due_at, source) values
    (v_dossier, 'hotel_payment', 'Règlement hôtel Istanbul', null, null);

  perform public.generate_departure_checklist(v_dossier);

  -- Acompte de 500 DT reçu par virement et validé
  perform public.record_payment('seed-deposit-ben-salah', 'in', 'transfer', 500, '33333333-0000-0000-0000-000000000001', null,
    jsonb_build_array(jsonb_build_object('dossier_id', v_dossier, 'amount', 500)), '2026-10-02', v_bank, 'TND', 1, 'VIR-889201',
    null, null, 'payment', true);

  insert into public.tasks (title, description, dossier_id, service_id, assignee_id, due_at, financial_risk) values
    ('Émettre les billets Tunisair', 'Vérifier les noms et émettre avant la limite.', v_dossier, v_flight, '11111111-1111-1111-1111-000000000003', '2026-10-24 17:00+01', true),
    ('Obtenir la date limite de règlement hôtel', 'Délai fournisseur à compléter auprès de Bosphorus DMC.', v_dossier, null, '11111111-1111-1111-1111-000000000003', now() + interval '1 day', true),
    ('Relancer le client pour la tranche 1', null, v_dossier, null, '11111111-1111-1111-1111-000000000002', '2026-10-15 10:00+01', false);
  insert into public.tasks (title, description, assignee_id, due_at) values
    ('Mettre à jour les photos du catalogue Omra', null, '11111111-1111-1111-1111-000000000005', now() + interval '3 days'),
    ('Préparer la rooming list Sud tunisien', null, null, now() + interval '2 days');

  -- Document voyageur sensible (fichier fictif)
  insert into public.documents (kind, title, storage_path, mime_type, size_bytes, client_id, dossier_id, traveller_id)
  values ('passport', 'Passeport M. Ben Salah', 'seed/passport-ben-salah.pdf', 'application/pdf', 1024,
    '33333333-0000-0000-0000-000000000001', v_dossier, '44444444-0000-0000-0000-000000000001');
  insert into public.documents (kind, title, storage_path, mime_type, size_bytes, client_id, dossier_id, published_to_client)
  values ('program', 'Programme Istanbul', 'seed/programme-istanbul.pdf', 'application/pdf', 2048,
    '33333333-0000-0000-0000-000000000001', v_dossier, true);
end $$;

-- Demandes du site en attente (file d'attente et affectation)
select public.submit_site_request(jsonb_build_object(
  'submission_token', 'seed-site-request-0001-abcdef', 'activity', 'hotel_tn', 'first_name', 'Sami', 'last_name', 'Gharbi',
  'email', 'sami.gharbi@example.test', 'phone', '+216 55 666 777', 'destination', 'Hammamet', 'date_from', '2027-07-10',
  'date_to', '2027-07-17', 'adults', 2, 'children', 1, 'children_ages', jsonb_build_array(8),
  'message', 'Chambre familiale en all inclusive si possible.', 'processing_consent', true));
select public.submit_site_request(jsonb_build_object(
  'submission_token', 'seed-site-request-0002-abcdef', 'activity', 'mice', 'first_name', 'Rym', 'last_name', 'Haddad',
  'company', 'Société Atlas Industries', 'email', 'rym.haddad@atlas.test', 'phone', '+216 71 000 111',
  'destination', 'Tozeur', 'adults', 80, 'message', 'Séminaire annuel de 80 personnes, 2 jours, mars 2027.',
  'details', jsonb_build_object('format', 'séminaire résidentiel', 'venue', 'hôtel avec salle plénière', 'headcount', 80),
  'processing_consent', true));
