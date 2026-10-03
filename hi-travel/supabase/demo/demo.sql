-- =====================================================================
-- Pack de démonstration (recette uniquement) — à charger APRÈS supabase/seed.sql
-- Couvre chaque écran de la Phase 1. Dates relatives au jour du chargement
-- (current_date) : priorités, départs et échéances restent parlants à chaque rechargement.
-- Les opérations passent par les fonctions métier (mêmes règles que l'interface).
-- Chargement : node scripts/demo-data.mjs --local | --project <ref-staging>
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aides (session uniquement)
-- ---------------------------------------------------------------------
create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_name text)
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

create or replace function pg_temp.client(p_kind text, p_first text, p_last text, p_company text, p_email text, p_phone text,
  p_city text, p_source text, p_owner uuid)
returns uuid language sql as $$
  insert into public.clients (kind, first_name, last_name, company_name, email, phone, city, source, owner_id, consents)
  values (p_kind::public.client_kind, p_first, p_last, p_company, p_email, p_phone, p_city, p_source::public.lead_source, p_owner,
          '{"processing": true, "marketing": false}')
  returning id
$$;

create or replace function pg_temp.trav(p_client uuid, p_first text, p_last text, p_birth date, p_pax text default 'adult')
returns uuid language sql as $$
  insert into public.travellers (client_id, first_name, last_name, birth_date, pax_type, nationality)
  values (p_client, p_first, p_last, p_birth, p_pax, 'TN') returning id
$$;

-- Devis complet → envoyé → (accepté → dossier) ; renvoie l'id du dossier ou de la version
-- p_lines : [{a, t, d, sup, hotel, s, e, pax, q, cost, cur, fx, price, opt, sel, det}]
create or replace function pg_temp.quote(
  p_client uuid, p_activity text, p_title text, p_owner uuid, p_lead uuid, p_start date, p_end date,
  p_adults int, p_children int, p_lines jsonb, p_terms jsonb, p_accept boolean default true,
  p_departure uuid default null, p_offer uuid default null, p_send boolean default true)
returns uuid language plpgsql as $$
declare
  v_quote uuid; v_version uuid; l jsonb; i int := 0;
begin
  insert into public.quotes (lead_id, client_id, activity, title, owner_id, offer_id, departure_id)
  values (p_lead, p_client, p_activity::public.activity, p_title, p_owner, p_offer, p_departure) returning id into v_quote;
  insert into public.quote_versions (quote_id, version_no, start_date, end_date, adults, children, valid_until, payment_terms, created_by)
  values (v_quote, 1, p_start, p_end, p_adults, p_children, current_date + 10, p_terms, p_owner) returning id into v_version;
  for l in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    insert into public.quote_lines (version_id, position, activity, service_type, description, supplier_id, hotel_id,
      start_date, end_date, pax_type, quantity, unit_cost, cost_currency, fx_rate, unit_price, is_optional, option_selected, details)
    values (v_version, i, (l ->> 'a')::public.activity, (l ->> 't')::public.service_type, l ->> 'd',
      nullif(l ->> 'sup', '')::uuid, nullif(l ->> 'hotel', '')::uuid,
      coalesce((l ->> 's')::date, p_start), coalesce((l ->> 'e')::date, p_end), coalesce(l ->> 'pax', 'all')::public.pax_type,
      coalesce((l ->> 'q')::numeric, 1), coalesce((l ->> 'cost')::numeric, 0), coalesce(l ->> 'cur', 'TND'),
      coalesce((l ->> 'fx')::numeric, 1), (l ->> 'price')::numeric, coalesce((l ->> 'opt')::boolean, false),
      coalesce((l ->> 'sel')::boolean, false), coalesce(l -> 'det', '{}'));
  end loop;
  if p_send then perform public.mark_quote_version_sent(v_version, 'email'); end if;
  if p_accept then
    return public.accept_quote_version(v_version, 'Accord du client (démo)');
  end if;
  return v_version;
end $$;

create or replace function pg_temp.svc(p_dossier uuid, p_type text, p_like text default '%')
returns uuid language sql as $$
  select id from public.services where dossier_id = p_dossier and service_type = p_type::public.service_type
     and description ilike p_like order by created_at limit 1
$$;

create or replace function pg_temp.doc(p_kind text, p_title text, p_slug text, p_client uuid, p_dossier uuid,
  p_published boolean default false, p_traveller uuid default null, p_supplier uuid default null, p_service uuid default null)
returns uuid language sql as $$
  insert into public.documents (kind, title, storage_path, mime_type, size_bytes, client_id, dossier_id, traveller_id, supplier_id,
    service_id, published_to_client, uploaded_via)
  values (p_kind::public.document_kind, p_title, 'demo/' || p_slug || '.pdf', 'application/pdf', 4096, p_client, p_dossier,
    p_traveller, p_supplier, p_service, p_published, 'backoffice')
  returning id
$$;

create or replace function pg_temp.invoice(p_client uuid, p_dossier uuid, p_kind text, p_lines jsonb, p_date date,
  p_validate boolean default true, p_original uuid default null, p_reason text default null)
returns uuid language plpgsql as $$
declare v_id uuid; l jsonb;
begin
  insert into public.invoices (kind, client_id, dossier_id, original_invoice_id, reason)
  values (p_kind::public.invoice_kind, p_client, p_dossier, p_original, p_reason) returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines (invoice_id, description, quantity, unit_price, activity)
    values (v_id, l ->> 'd', coalesce((l ->> 'q')::numeric, 1), (l ->> 'p')::numeric, nullif(l ->> 'a', '')::public.activity);
  end loop;
  if p_validate then perform public.validate_invoice(v_id, p_date); end if;
  return v_id;
end $$;

create or replace function pg_temp.pay(p_key text, p_dir text, p_method text, p_amount numeric, p_client uuid, p_supplier uuid,
  p_alloc jsonb, p_date date, p_account text, p_validate boolean default true, p_kind text default 'payment',
  p_ref text default null, p_instrument text default null, p_due date default null, p_fees numeric default 0)
returns uuid language sql as $$
  select (public.record_payment(
    p_idempotency_key => p_key, p_direction => p_dir, p_method => p_method::public.payment_method, p_amount => p_amount,
    p_client_id => p_client, p_supplier_id => p_supplier, p_allocations => p_alloc, p_received_at => p_date,
    p_treasury_account_id => (select id from public.treasury_accounts where name = p_account),
    p_external_ref => p_ref, p_instrument_number => p_instrument, p_due_date => p_due, p_kind => p_kind,
    p_validate => p_validate, p_fees => p_fees)).id
$$;

create or replace function pg_temp.supinv(p_supplier uuid, p_ref text, p_date date, p_total numeric, p_currency text,
  p_fx numeric, p_targets jsonb, p_method text default 'percent', p_withholding numeric default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, due_date, total_amount, currency, fx_rate,
    fx_rate_date, fx_rate_source, withholding_amount, withholding_rule)
  values (p_supplier, p_ref, p_date, p_date + 30, p_total, p_currency, p_fx, p_date, case when p_currency <> 'TND' then 'fx_mock' end,
    p_withholding, case when p_withholding > 0 then 'WHT_STD' end)
  returning id into v_id;
  insert into public.supplier_invoice_lines (supplier_invoice_id, description, amount) values (v_id, 'Prestations ' || p_ref, p_total);
  perform public.validate_supplier_invoice(v_id);
  if p_targets is not null then perform public.allocate_supplier_invoice(v_id, p_targets, p_method); end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Données
-- ---------------------------------------------------------------------
do $$
declare
  d0 date := current_date;
  t0 timestamptz := date_trunc('hour', now());
  -- collaborateurs (seed)
  s_dir uuid := '11111111-1111-1111-1111-000000000001';
  s_com uuid := '11111111-1111-1111-1111-000000000002';
  s_ops uuid := '11111111-1111-1111-1111-000000000003';
  s_fin uuid := '11111111-1111-1111-1111-000000000004';
  s_site uuid := '11111111-1111-1111-1111-000000000005';
  s_com2 uuid := '11111111-1111-1111-1111-000000000006';
  -- fournisseurs (seed)
  f_tb uuid := '55555555-0000-0000-0000-000000000001';
  f_mg uuid := '55555555-0000-0000-0000-000000000002';
  f_tu uuid := '55555555-0000-0000-0000-000000000003';
  f_trans uuid := '55555555-0000-0000-0000-000000000004';
  f_visa uuid := '55555555-0000-0000-0000-000000000005';
  f_bos uuid := '55555555-0000-0000-0000-000000000006';
  f_billet uuid := '55555555-0000-0000-0000-000000000007';
  f_haram uuid := '55555555-0000-0000-0000-000000000008';
  -- clients existants
  c_bensalah uuid := '33333333-0000-0000-0000-000000000001';
  c_atlas uuid := '33333333-0000-0000-0000-000000000003';
  -- variables
  c_nadia uuid; c_jlassi uuid; c_mansour uuid; c_hela uuid; c_chaabane uuid; c_riahi uuid; c_omra uuid; c_sassi uuid;
  c_bouaziz uuid; c_ferchichi uuid; c_khelifi uuid; c_medtech uuid;
  t_nadia uuid; t_karim uuid; t_hela uuid; t_jl1 uuid; t_jl2 uuid; t_jl3 uuid; t_om1 uuid; t_om2 uuid; t_om3 uuid; t_ch1 uuid; t_ch2 uuid;
  t_riahi uuid; t_bs1 uuid; t_bs2 uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; l7 uuid;
  d_hotel uuid; d_visa uuid; d_billet uuid; d_dubai uuid; d_mice uuid; d_omra uuid; d_sud uuid; d_rome uuid;
  d_djerba uuid; d_sousse uuid; d_cancel uuid; d_transfer uuid; d_istanbul uuid;
  v_quote_v1 uuid; v_quote_v2 uuid; v_q_draft uuid; v_q_lost uuid;
  sv uuid; sv2 uuid; sv3 uuid; inv1 uuid; inv2 uuid; inv3 uuid; inv4 uuid; inv5 uuid; av1 uuid; pf1 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; si1 uuid; si2 uuid; si3 uuid; si4 uuid;
  b1 uuid; b2 uuid; hb uuid; e uuid; y_prev int := extract(year from current_date)::int - 1;
  intent uuid; tpl uuid;
begin
  -- Les règles fiscales indicatives restent appliquées (timbre) : montants réalistes de recette.

  -- Exercice courant ouvert, exercice précédent clôturé (démo)
  if not exists (select 1 from public.fiscal_periods where d0 between start_date and end_date) then
    insert into public.fiscal_periods (label, start_date, end_date)
    values ('Exercice ' || extract(year from d0), date_trunc('year', d0)::date, (date_trunc('year', d0) + interval '1 year - 1 day')::date);
  end if;

  -- -------------------------------------------------------------------
  -- Collaborateurs supplémentaires et compte client de démonstration
  -- -------------------------------------------------------------------
  perform pg_temp.demo_user(s_com2, 'commercial2@hitravel.test', 'Yasmine Commerciale');
  insert into public.staff_profiles (id, full_name, email, role, backup_id)
  values (s_com2, 'Yasmine Commerciale', 'commercial2@hitravel.test', 'commercial', s_com);

  -- -------------------------------------------------------------------
  -- Clients, entreprises, voyageurs
  -- -------------------------------------------------------------------
  c_nadia    := pg_temp.client('person', 'Nadia', 'Gharbi', null, 'client3@hitravel.test', '+216 21 345 678', 'Tunis', 'website', s_com);
  c_jlassi   := pg_temp.client('person', 'Sami', 'Jlassi', null, 'sami.jlassi@example.test', '+216 22 456 789', 'Ariana', 'phone', s_com2);
  c_mansour  := pg_temp.client('person', 'Karim', 'Mansour', null, 'karim.mansour@example.test', '+216 23 567 890', 'Sfax', 'walk_in', s_com);
  c_hela     := pg_temp.client('person', 'Hela', 'Ben Ammar', null, 'hela.benammar@example.test', '+216 24 678 901', 'Tunis', 'whatsapp', s_com2);
  c_chaabane := pg_temp.client('person', 'Mehdi', 'Chaabane', null, 'mehdi.chaabane@example.test', '+216 25 789 012', 'Nabeul', 'referral', s_com);
  c_riahi    := pg_temp.client('person', 'Olfa', 'Riahi', null, 'olfa.riahi@example.test', '+216 26 890 123', 'Monastir', 'website', s_com2);
  c_omra     := pg_temp.client('person', 'Abdelkader', 'Trabelsi', null, 'a.trabelsi@example.test', '+216 27 901 234', 'Kairouan', 'phone', s_com);
  c_sassi    := pg_temp.client('person', 'Rania', 'Sassi', null, 'rania.sassi@example.test', '+216 28 012 345', 'Bizerte', 'social', s_com2);
  c_bouaziz  := pg_temp.client('person', 'Walid', 'Bouaziz', null, 'walid.bouaziz@example.test', '+216 29 123 456', 'Sousse', 'email', s_com);
  c_ferchichi:= pg_temp.client('person', 'Amira', 'Ferchichi', null, 'amira.f@example.test', '+216 50 234 567', 'Gabès', 'website', null);
  -- Doublon probable volontaire (même téléphone que Karim Mansour)
  c_khelifi  := pg_temp.client('person', 'Karim', 'Mansouri', null, 'k.mansouri@example.test', '+216 23 567 890', 'Sfax', 'website', null);
  c_medtech  := pg_temp.client('company', null, null, 'MedTech Pharma SARL', 'events@medtech.test', '+216 71 222 333', 'Tunis', 'email', s_com);
  update public.clients set tax_id = '7654321/B/A/000', commercial_terms = 'Facturation par jalons, paiement à 30 jours' where id = c_medtech;
  insert into public.client_contacts (client_id, full_name, role, email, phone, is_decision_maker) values
    (c_medtech, 'Salma Ayari', 'Responsable événements', 'salma.ayari@medtech.test', '+216 98 111 222', true),
    (c_medtech, 'Fethi Gharsallah', 'Directeur financier', 'f.gharsallah@medtech.test', null, false),
    (c_atlas, 'Mourad Ben Youssef', 'Office manager', 'mourad.by@atlas.test', '+216 98 333 444', false);

  -- Compte espace client supplémentaire (Nadia : séjour hôtel réservé via API)
  perform pg_temp.demo_user('22222222-2222-2222-2222-000000000003', 'client3@hitravel.test', 'Nadia Gharbi');
  insert into public.client_accounts (user_id, client_id) values ('22222222-2222-2222-2222-000000000003', c_nadia);

  t_nadia := pg_temp.trav(c_nadia, 'Nadia', 'Gharbi', '1988-03-14');
  t_karim := pg_temp.trav(c_mansour, 'Karim', 'Mansour', '1979-11-02');
  t_hela  := pg_temp.trav(c_hela, 'Hela', 'Ben Ammar', '1992-07-21');
  t_jl1 := pg_temp.trav(c_jlassi, 'Sami', 'Jlassi', '1983-05-09');
  t_jl2 := pg_temp.trav(c_jlassi, 'Mariem', 'Jlassi', '1986-01-30');
  t_jl3 := pg_temp.trav(c_jlassi, 'Adam', 'Jlassi', '2015-09-12', 'child');
  t_om1 := pg_temp.trav(c_omra, 'Abdelkader', 'Trabelsi', '1958-02-17');
  t_om2 := pg_temp.trav(c_omra, 'Fatma', 'Trabelsi', '1961-06-05');
  t_om3 := pg_temp.trav(c_omra, 'Hedi', 'Trabelsi', '1985-12-22');
  t_ch1 := pg_temp.trav(c_chaabane, 'Mehdi', 'Chaabane', '1990-04-18');
  t_ch2 := pg_temp.trav(c_chaabane, 'Sarra', 'Chaabane', '1991-08-26');
  t_riahi := pg_temp.trav(c_riahi, 'Olfa', 'Riahi', '1987-10-10');
  t_bs1 := '44444444-0000-0000-0000-000000000001';
  t_bs2 := '44444444-0000-0000-0000-000000000002';
  insert into public.traveller_identity_documents (traveller_id, passport_number, issuing_country, expiry_date) values
    (t_karim, 'P2233445', 'TN', d0 + 900), (t_hela, 'P3344556', 'TN', d0 + 120),
    (t_om1, 'P4455667', 'TN', d0 + 1500), (t_om2, 'P5566778', 'TN', d0 + 1400), (t_om3, 'P6677889', 'TN', d0 + 2000),
    (t_jl1, 'P7788990', 'TN', d0 + 700), (t_jl2, 'P8899001', 'TN', d0 + 700);

  -- -------------------------------------------------------------------
  -- Demandes CRM à toutes les étapes du pipeline
  -- -------------------------------------------------------------------
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, date_from, date_to, adults, children, budget,
    message, contact_snapshot, processing_consent, next_action, next_action_at, created_at)
  values (c_ferchichi, 'hotel_tn', 'received', 'website', null, 'Djerba', d0 + 40, d0 + 47, 2, 2, 2500,
    'Hôtel en all inclusive avec club enfants.', '{"email":"amira.f@example.test"}', true, null, null, t0 - interval '3 hours')
  returning id into l1;
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, date_from, adults, message, contact_snapshot,
    processing_consent, next_action, next_action_at)
  values (c_bouaziz, 'circuit', 'qualification', 'email', s_com, 'Sud tunisien', d0 + 30, 4, 'Circuit privé en 4x4 pour 4 amis.',
    '{"email":"walid.bouaziz@example.test"}', true, 'Rappeler pour préciser le budget', t0 + interval '1 day')
  returning id into l2;
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, date_from, date_to, adults, children, budget, message,
    contact_snapshot, processing_consent)
  values (c_jlassi, 'tailor_made', 'quote', 'phone', s_com2, 'Dubaï', d0 + 55, d0 + 62, 2, 1, 9000, 'Vols, hôtel 4*, visa et une excursion désert.',
    '{"email":"sami.jlassi@example.test"}', true)
  returning id into l3;
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, adults, message, contact_snapshot, processing_consent, lost_reason)
  values (c_sassi, 'organized_trip', 'lost', 'social', s_com2, 'Istanbul', 2, 'Voyage de noces.', '{"email":"rania.sassi@example.test"}', true,
    'Budget insuffisant — a choisi une autre agence')
  returning id into l4;
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, adults, message, contact_snapshot, processing_consent,
    possible_duplicate_client_ids)
  values (null, 'visa', 'received', 'website', s_ops, 'France', 1, 'Visa Schengen court séjour.',
    '{"first_name":"Karim","last_name":"Mansouri","email":"k.mansouri@example.test","phone":"+216 23 567 890"}', true,
    array[c_mansour, c_khelifi])
  returning id into l5;
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, adults, details, message, contact_snapshot, processing_consent)
  values (c_medtech, 'mice', 'quote', 'email', s_com, 'Hammamet', 60,
    '{"format":"congrès médical","headcount":60,"venue":"hôtel avec 2 salles"}', 'Congrès annuel, 2 jours, 60 participants.',
    '{"email":"events@medtech.test"}', true)
  returning id into l6;
  insert into public.interactions (client_id, lead_id, channel, direction, summary, author_id, occurred_at) values
    (c_bouaziz, l2, 'phone', 'in', 'Premier appel : groupe de 4, souhaite du 4x4 et une nuit sous tente.', s_com, t0 - interval '1 day'),
    (c_jlassi, l3, 'email', 'out', 'Envoi de la version 1 du devis Dubaï.', s_com2, t0 - interval '4 days'),
    (c_jlassi, l3, 'phone', 'in', 'Le client demande un hôtel plus proche de la plage : version 2 préparée.', s_com2, t0 - interval '2 days'),
    (c_sassi, l4, 'whatsapp', 'in', 'Le client décline : budget insuffisant.', s_com2, t0 - interval '6 days'),
    (c_medtech, l6, 'meeting', 'out', 'Visite de repérage proposée pour la semaine prochaine.', s_com, t0 - interval '1 day');

  -- -------------------------------------------------------------------
  -- 1. Hôtel en Tunisie réservé via l'API (client3 — espace client)
  -- -------------------------------------------------------------------
  insert into public.leads (client_id, activity, stage, source, owner_id, destination, date_from, date_to, adults, message, contact_snapshot,
    processing_consent, details)
  values (c_nadia, 'hotel_tn', 'quote', 'website', s_com, 'Hammamet', d0 + 12, d0 + 17, 2, 'Demande depuis la recherche hôtelière.',
    '{"email":"client3@hitravel.test"}', true,
    '{"provider":"hotel_api_tunisiabeds","provider_hotel_code":"TB-HAM-001","board":"DP","quoted_price":1420.5}')
  returning id into l7;
  d_hotel := pg_temp.quote(c_nadia, 'hotel_tn', 'Marina Palace Hammamet — 5 nuits DP', s_com, l7, d0 + 12, d0 + 17, 2, 0,
    jsonb_build_array(jsonb_build_object('a','hotel_tn','t','hotel','d','Marina Palace 4* — chambre double, demi-pension','sup',f_tb,
      'hotel','66666666-0000-0000-0000-000000000001','cost',1291.36,'price',1420.5,'det',jsonb_build_object('room_type','Double','board','DP'))),
    '[{"label":"Acompte","kind":"deposit","percent":30},{"label":"Solde","kind":"balance","percent":70,"days_before_departure":3}]');
  sv := pg_temp.svc(d_hotel, 'hotel');
  update public.services set status = 'confirmed', external_provider = 'hotel_api_tunisiabeds', external_ref = 'TBDEMO7781',
    confirmation_ref = 'TBDEMO7781', cost_confirmed = 1291.36, occupancy = '2 adultes' where id = sv;
  insert into public.hotel_booking_requests (request_id, connector_code, service_id, dossier_id, provider_hotel_code, offer_snapshot,
    status, external_ref, amount, currency, conditions, attempts, created_by)
  values ('demo-req-hotel-001', 'hotel_api_tunisiabeds', sv, d_hotel, 'TB-HAM-001',
    jsonb_build_object('provider','hotel_api_tunisiabeds','offerRef','TB-HAM-001|DBL|DP','board','DP','price',1291.36,'fetchedAt',t0 - interval '2 days'),
    'confirmed', 'TBDEMO7781', 1291.36, 'TND', 'Voucher disponible sous 24 h', 1, s_ops);
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_hotel, t_nadia, true);
  update public.dossiers set status = 'confirmed' where id = d_hotel;
  p1 := pg_temp.pay('demo-hotel-acompte', 'in', 'card', 426.15, c_nadia, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_hotel, 'amount', 426.15)), d0 - 3, 'Banque principale', true, 'payment', 'TPE-88412');
  perform pg_temp.doc('voucher', 'Voucher Marina Palace', 'voucher-marina-palace', c_nadia, d_hotel, true, null, f_tb, sv);
  perform pg_temp.doc('program', 'Confirmation de séjour', 'confirmation-sejour-hammamet', c_nadia, d_hotel, true);
  insert into public.external_deadlines (dossier_id, service_id, kind, label, due_at, source, source_note, received_at)
  values (d_hotel, sv, 'hotel_payment', 'Règlement Tunisiabeds', t0 + interval '5 days', 'api', 'Conditions renvoyées par l''API', now());

  -- -------------------------------------------------------------------
  -- 2. Visa Schengen (dossier visa, checklist, rendez-vous proche)
  -- -------------------------------------------------------------------
  d_visa := pg_temp.quote(c_mansour, 'visa', 'Visa Schengen France — K. Mansour', s_ops, null, d0 + 35, d0 + 45, 1, 0,
    jsonb_build_array(
      jsonb_build_object('a','visa','t','visa','d','Visa court séjour France — frais consulaires et centre','sup',f_visa,'cost',380,'price',380),
      jsonb_build_object('a','visa','t','fee','d','Honoraires agence — constitution du dossier','cost',0,'price',120)),
    '[{"label":"Règlement","kind":"deposit","percent":100}]');
  sv := pg_temp.svc(d_visa, 'visa');
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_visa, t_karim, true);
  insert into public.visa_applications (service_id, traveller_id, destination, visa_type, checklist_version, checklist, appointment_at,
    status, decision, consular_fee, center_fee, agency_fee, notes)
  values (sv, t_karim, 'France', 'Court séjour (C)', 'France-2026.1',
    '[{"code":"form","label":"Formulaire signé","received":true},{"code":"photo","label":"Photos biométriques","received":true},
      {"code":"passport","label":"Passeport valide 3 mois après le retour","received":true},{"code":"bank","label":"Relevés bancaires 3 mois","received":false},
      {"code":"insurance","label":"Assurance voyage","received":false},{"code":"hotel","label":"Réservation d''hébergement","received":true}]',
    t0 + interval '3 days 9 hours', 'appointment', 'pending', 270, 110, 120,
    'Le statut interne ne préjuge pas de la décision consulaire.');
  update public.dossiers set status = 'booking' where id = d_visa;
  perform pg_temp.doc('passport', 'Passeport K. Mansour', 'passeport-mansour', c_mansour, d_visa, false, t_karim);
  perform pg_temp.pay('demo-visa-especes', 'in', 'cash', 500, c_mansour, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_visa, 'amount', 500)), d0 - 6, 'Caisse principale');
  insert into public.tasks (title, description, dossier_id, service_id, assignee_id, due_at, status, waiting_reason, last_action_at, next_follow_up_at)
  values ('Collecter relevés bancaires et assurance', 'Pièces manquantes avant le rendez-vous TLS.', d_visa, sv, s_ops, t0 + interval '2 days',
    'waiting_client', 'Pièces demandées au client par WhatsApp', now() - interval '1 day', now() + interval '1 day');

  -- -------------------------------------------------------------------
  -- 3. Billetterie (billets, limite d'émission imminente, remboursement attendu)
  -- -------------------------------------------------------------------
  d_billet := pg_temp.quote(c_hela, 'ticketing', 'Billets Tunis ⇄ Paris — H. Ben Ammar', s_com2, null, d0 + 9, d0 + 16, 1, 0,
    jsonb_build_array(jsonb_build_object('a','ticketing','t','flight','d','Vol Tunis ⇄ Paris CDG (TU 710 / TU 711)','sup',f_tu,'cost',890,'price',985)),
    '[{"label":"Règlement","kind":"deposit","percent":100}]');
  sv := pg_temp.svc(d_billet, 'flight');
  update public.services set start_at = (d0 + 9) + time '08:40', end_at = (d0 + 16) + time '19:05', status = 'option',
    option_deadline = t0 + interval '20 hours' where id = sv;
  insert into public.flight_segments (service_id, seq, carrier, flight_number, from_airport, to_airport, departs_at, departs_tz, arrives_at, arrives_tz, pnr, baggage) values
    (sv, 1, 'TU', 'TU710', 'TUN', 'CDG', ((d0 + 9) + time '08:40') at time zone 'Africa/Tunis', 'Africa/Tunis', ((d0 + 9) + time '11:15') at time zone 'Europe/Paris', 'Europe/Paris', 'PX7Q2M', '23 kg'),
    (sv, 2, 'TU', 'TU711', 'CDG', 'TUN', ((d0 + 16) + time '16:30') at time zone 'Europe/Paris', 'Europe/Paris', ((d0 + 16) + time '19:05') at time zone 'Africa/Tunis', 'Africa/Tunis', 'PX7Q2M', '23 kg');
  insert into public.tickets (service_id, traveller_id, pnr, passenger_name, status, issue_deadline, fare, taxes, service_fee, sale_price, currency)
  values (sv, t_hela, 'PX7Q2M', 'BEN AMMAR/HELA', 'pending', t0 + interval '20 hours', 690, 200, 15, 985, 'TND');
  insert into public.external_deadlines (dossier_id, service_id, kind, label, due_at, source, source_note, received_at)
  values (d_billet, sv, 'ticket_issue', 'Limite d''émission Tunisair', t0 + interval '20 hours', 'supplier', 'Message du GDS reçu par la billetterie', now());
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_billet, t_hela, true);
  update public.dossiers set status = 'booking' where id = d_billet;
  perform pg_temp.pay('demo-billet-virement', 'in', 'transfer', 985, c_hela, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_billet, 'amount', 985)), d0 - 1, 'Banque principale', true, 'payment', 'VIR-55102');
  insert into public.tasks (title, dossier_id, service_id, assignee_id, due_at, financial_risk)
  values ('Émettre le billet Tunisair avant la limite', d_billet, sv, s_ops, t0 + interval '18 hours', true);

  -- -------------------------------------------------------------------
  -- 4. Voyage à la carte Dubaï : devis envoyé en 2 versions (non accepté)
  -- -------------------------------------------------------------------
  v_quote_v1 := pg_temp.quote(c_jlassi, 'tailor_made', 'Dubaï en famille — 7 nuits', s_com2, l3, d0 + 55, d0 + 62, 2, 1,
    jsonb_build_array(
      jsonb_build_object('a','ticketing','t','flight','d','Vols Tunis ⇄ Dubaï (adultes)','pax','adult','q',2,'sup',f_tu,'cost',1450,'price',1590),
      jsonb_build_object('a','ticketing','t','flight','d','Vol Tunis ⇄ Dubaï (enfant)','pax','child','q',1,'sup',f_tu,'cost',1100,'price',1210),
      jsonb_build_object('a','hotel_intl','t','hotel','d','Hôtel 4* Deira — 7 nuits LPD','cost',520,'cur','EUR','fx',3.39,'price',2050,'det',jsonb_build_object('room_type','Familiale','board','LPD')),
      jsonb_build_object('a','visa','t','visa','d','Visas Émirats (x3)','cost',600,'price',690),
      jsonb_build_object('a','tailor_made','t','excursion','d','Safari désert avec dîner (option)','cost',240,'price',360,'opt',true)),
    '[{"label":"Acompte","kind":"deposit","percent":30},{"label":"Solde","kind":"balance","percent":70,"days_before_departure":21}]', false);
  select quote_id into v_q_draft from public.quote_versions where id = v_quote_v1;
  v_quote_v2 := public.create_quote_version(v_q_draft, v_quote_v1);
  update public.quote_lines set description = 'Hôtel 4* Jumeirah Beach — 7 nuits LPD', unit_cost = 610, unit_price = 2390
   where version_id = v_quote_v2 and service_type = 'hotel';
  update public.quote_lines set option_selected = true where version_id = v_quote_v2 and is_optional;
  perform public.mark_quote_version_sent(v_quote_v2, 'email');

  -- Devis en brouillon (MICE MedTech) et devis refusé (Istanbul, demande perdue)
  perform pg_temp.quote(c_medtech, 'mice', 'Congrès MedTech Hammamet — 60 pers.', s_com, l6, d0 + 70, d0 + 72, 60, 0,
    jsonb_build_array(
      jsonb_build_object('a','hotel_tn','t','hotel','d','Hébergement 2 nuits PC','q',60,'sup',f_tb,'cost',210,'price',255),
      jsonb_build_object('a','mice','t','event_item','d','Salle plénière + sous-commission, 2 jours','cost',3200,'price',4100),
      jsonb_build_object('a','mice','t','event_item','d','Audiovisuel et captation','cost',1800,'price',2400),
      jsonb_build_object('a','transport','t','transport','d','Navettes aéroport (2 bus)','sup',f_trans,'cost',900,'price',1200)),
    '[{"label":"Acompte à la commande","kind":"deposit","percent":40},{"label":"Solde","kind":"balance","percent":60,"days_before_departure":10}]',
    false, null, null, false);
  v_q_lost := pg_temp.quote(c_sassi, 'organized_trip', 'Istanbul — voyage de noces', s_com2, l4, '2026-12-19', '2026-12-26', 2, 0,
    jsonb_build_array(jsonb_build_object('a','organized_trip','t','package','d','Forfait Istanbul 8 jours (x2)','q',2,'cost',2150,'price',2590)),
    '[]', false, '88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001');
  update public.quote_versions set status = 'rejected', responded_at = now() - interval '6 days', response_note = 'Budget insuffisant' where id = v_q_lost;
  update public.quotes set status = 'rejected', lost_reason = 'Budget insuffisant' where id = (select quote_id from public.quote_versions where id = v_q_lost);

  -- -------------------------------------------------------------------
  -- 5. Séminaire MICE Atlas (80 → participants, bus, salle, capacité)
  -- -------------------------------------------------------------------
  d_mice := pg_temp.quote(c_atlas, 'mice', 'Séminaire annuel Atlas — Tozeur', s_com, null, d0 + 25, d0 + 27, 80, 0,
    jsonb_build_array(
      jsonb_build_object('a','hotel_tn','t','hotel','d','Hébergement 2 nuits DP — 40 chambres doubles','q',40,'sup',f_mg,'cost',260,'price',320,'det',jsonb_build_object('room_type','Double','board','DP')),
      jsonb_build_object('a','mice','t','event_item','d','Salle plénière 100 places — 2 jours','cost',2600,'price',3400),
      jsonb_build_object('a','mice','t','event_item','d','Déjeuners et pauses café (80 pers. x 2 j)','q',160,'cost',38,'price',52),
      jsonb_build_object('a','mice','t','event_item','d','Audiovisuel : sono, vidéoprojecteurs, régie','cost',1400,'price',1950),
      jsonb_build_object('a','transport','t','transport','d','Bus 1 — aéroport Tozeur ⇄ hôtel','sup',f_trans,'cost',450,'price',600),
      jsonb_build_object('a','transport','t','transport','d','Bus 2 — aéroport Tozeur ⇄ hôtel','sup',f_trans,'cost',450,'price',600),
      jsonb_build_object('a','mice','t','event_item','d','Dîner sous tente et animation','q',80,'cost',55,'price',75)),
    '[{"label":"Acompte (jalon 1)","kind":"deposit","percent":40},{"label":"Jalon 2","kind":"installment","percent":40,"days_before_departure":7},{"label":"Solde","kind":"balance","percent":20,"days_before_departure":-15}]');
  update public.dossiers set status = 'booking', adults = 80 where id = d_mice;
  sv := pg_temp.svc(d_mice, 'transport', 'Bus 1%');
  update public.services set start_at = (d0 + 25) + time '10:00', end_at = (d0 + 25) + time '11:30', status = 'confirmed', confirmation_ref = 'TS-4410',
    details = details || '{"vehicle":"Bus 49 places TU-1234","driver":"Moncef","pax_count":"49","vehicle_capacity":"49"}' where id = sv;
  sv2 := pg_temp.svc(d_mice, 'transport', 'Bus 2%');
  update public.services set start_at = (d0 + 25) + time '10:00', end_at = (d0 + 25) + time '11:30', status = 'option',
    option_deadline = t0 + interval '4 days', details = details || '{"vehicle":"Minibus 25 places TU-8842","driver":"Lotfi","pax_count":"31","vehicle_capacity":"25"}'
   where id = sv2;   -- capacité insuffisante signalée
  update public.services set status = 'confirmed', confirmation_ref = 'MG-SEM-221', cost_confirmed = cost_planned
   where dossier_id = d_mice and service_type = 'hotel';
  update public.services set status = 'option', option_deadline = t0 + interval '2 days'
   where dossier_id = d_mice and description like 'Salle plénière%';
  insert into public.event_participants (dossier_id, full_name, company, group_label, email, attendance, arrival_at, departure_at, room_needs)
  select d_mice, n, 'Atlas Industries', g, lower(replace(replace(n, ' ', '.'), 'é', 'e')) || '@atlas.test',
         (array['confirmed','registered','invited','cancelled'])[1 + (i % 4)], ((d0 + 25) + time '09:30'), ((d0 + 27) + time '17:00'),
         case when i % 5 = 0 then 'Chambre individuelle' else 'Chambre double partagée' end
    from (select row_number() over () as i, n, g from (values
      ('Rym Haddad','Direction'),('Mourad Ben Youssef','Direction'),('Ines Kallel','Ventes'),('Hatem Dridi','Ventes'),('Sonia Mrad','Ventes'),
      ('Bilel Jaziri','Production'),('Amel Khemiri','Production'),('Nizar Ouni','Production'),('Leila Gharbi','RH'),('Youssef Brahmi','RH'),
      ('Salma Chebbi','Finance'),('Anis Toumi','Finance'),('Hajer Snoussi','Qualité'),('Fares Mejri','Qualité'),('Dorra Hamdi','Logistique')) v(n, g)) x;
  insert into public.tasks (title, dossier_id, service_id, assignee_id, due_at, status, waiting_reason)
  values ('Remplacer le minibus 25 places (31 passagers prévus)', d_mice, sv2, s_ops, t0 + interval '1 day', 'waiting_supplier', 'Devis demandé à Transport Sahel pour un 2e bus 49 places');
  pf1 := pg_temp.invoice(c_atlas, d_mice, 'proforma', jsonb_build_array(jsonb_build_object('d','Séminaire annuel Atlas — pro forma','p',37590,'a','mice')), d0 - 9);
  inv1 := pg_temp.invoice(c_atlas, d_mice, 'invoice', jsonb_build_array(jsonb_build_object('d','Séminaire annuel Atlas — jalon 1 (acompte 40 %)','p',15036,'a','mice')), d0 - 8);
  p2 := pg_temp.pay('demo-atlas-jalon1', 'in', 'transfer', 15037, c_atlas, null,
    jsonb_build_array(jsonb_build_object('invoice_id', inv1, 'amount', 15037)), d0 - 4, 'Banque principale', true, 'payment', 'VIR-ATLAS-0921');
  perform pg_temp.doc('contract', 'Contrat de prestation séminaire Atlas', 'contrat-atlas', c_atlas, d_mice);

  -- -------------------------------------------------------------------
  -- 6. Omra (groupe sur le départ de février, options et places confirmées)
  -- -------------------------------------------------------------------
  d_omra := pg_temp.quote(c_omra, 'organized_trip', 'Omra Ramadan — famille Trabelsi (3 pers.)', s_com, null, '2027-02-20', '2027-03-06', 3, 0,
    jsonb_build_array(jsonb_build_object('a','organized_trip','t','package','d','Forfait Omra Ramadan 15 jours (x3)','q',3,'sup',f_haram,
      'cost',7300,'cur','SAR','fx',0.829,'price',6900)),
    '[{"label":"Acompte","kind":"deposit","amount":4500},{"label":"Solde","kind":"balance","amount":16200,"days_before_departure":30}]',
    true, '88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000002');
  update public.dossiers set is_omra = true where id = d_omra;
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead, room_label) values
    (d_omra, t_om1, true, 'Quadruple 1'), (d_omra, t_om2, false, 'Quadruple 1'), (d_omra, t_om3, false, 'Quadruple 1');
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000003', 3, 'confirmed', d_omra);
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000003', 4, 'option', null, l2, t0 + interval '30 hours');
  p3 := pg_temp.pay('demo-omra-cheque', 'in', 'cheque', 4500, c_omra, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_omra, 'amount', 4500)), d0 - 2, 'Banque principale', false, 'payment', null, 'CHQ-0045871');
  -- traite à échéance future : pas un encaissement disponible
  perform pg_temp.pay('demo-omra-traite', 'in', 'bill', 3000, c_omra, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_omra, 'amount', 3000)), d0 - 2, 'Banque principale', false, 'payment', null, 'TR-77810', d0 + 60);
  perform pg_temp.doc('passport', 'Passeport A. Trabelsi', 'passeport-trabelsi', c_omra, d_omra, false, t_om1);

  -- Option sur un départ de groupe Istanbul (expire bientôt)
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000002', 6, 'option', null, l4, t0 + interval '20 hours');

  -- -------------------------------------------------------------------
  -- 7. Circuit Sud tunisien (départ complet : 1 confirmé + 1 option)
  -- -------------------------------------------------------------------
  d_sud := pg_temp.quote(c_riahi, 'circuit', 'Circuit Sud tunisien — O. Riahi', s_com2, null, '2026-11-05', '2026-11-08', 1, 0,
    jsonb_build_array(jsonb_build_object('a','circuit','t','circuit','d','Circuit Sud 4 jours — départ collectif','cost',520,'price',690),
      jsonb_build_object('a','circuit','t','fee','d','Supplément chambre individuelle','cost',90,'price',120)),
    '[{"label":"Acompte","kind":"deposit","amount":200},{"label":"Solde","kind":"balance","amount":610,"days_before_departure":7}]',
    true, '88888888-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000003');
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_sud, t_riahi, true);
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000004', 1, 'confirmed', d_sud);
  perform public.hold_departure_seats('88888888-0000-0000-0000-000000000004', 1, 'option', null, l2, t0 + interval '2 days');
  perform pg_temp.pay('demo-sud-acompte', 'in', 'cash', 200, c_riahi, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_sud, 'amount', 200)), d0 - 10, 'Caisse principale');

  -- -------------------------------------------------------------------
  -- 8. Voyage à la carte en cours (Rome) + transferts en conflit de véhicule
  -- -------------------------------------------------------------------
  d_rome := pg_temp.quote(c_chaabane, 'tailor_made', 'Rome et Florence — M. et S. Chaabane', s_com, null, d0 - 2, d0 + 4, 2, 0,
    jsonb_build_array(
      jsonb_build_object('a','ticketing','t','flight','d','Vol Tunis ⇄ Rome (x2)','q',2,'sup',f_tu,'cost',640,'price',720,'s',d0 - 2,'e',d0 + 4),
      jsonb_build_object('a','hotel_intl','t','hotel','d','Hôtel 3* Rome centre — 3 nuits','sup',f_bos,'cost',330,'cur','EUR','fx',3.39,'price',1350,'s',d0 - 2,'e',d0 + 1),
      jsonb_build_object('a','hotel_intl','t','hotel','d','Hôtel 3* Florence — 3 nuits','sup',f_bos,'cost',300,'cur','EUR','fx',3.39,'price',1250,'s',d0 + 1,'e',d0 + 4),
      jsonb_build_object('a','transport','t','transfer','d','Transfert aéroport Tunis-Carthage → domicile (retour)','sup',f_trans,'cost',60,'price',90,'s',d0 + 4,'e',d0 + 4)),
    '[{"label":"Acompte","kind":"deposit","percent":30},{"label":"Solde","kind":"balance","percent":70,"days_before_departure":15}]');
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_rome, t_ch1, true), (d_rome, t_ch2, false);
  update public.services set status = 'confirmed', cost_confirmed = cost_planned, confirmation_ref = 'CONF-' || left(id::text, 6) where dossier_id = d_rome;
  sv := pg_temp.svc(d_rome, 'flight');
  sv2 := pg_temp.svc(d_rome, 'transfer');
  update public.services set start_at = (d0 + 4) + time '21:00', end_at = (d0 + 4) + time '22:00',
    details = details || '{"vehicle":"Van 8 places TU-5521","driver":"Sami","pax_count":"2","vehicle_capacity":"8"}' where id = sv2;
  update public.services set linked_service_id = sv where id = sv2;
  update public.dossiers set status = 'travelling' where id = d_rome;
  inv2 := pg_temp.invoice(c_chaabane, d_rome, 'invoice', jsonb_build_array(
    jsonb_build_object('d','Vols Tunis ⇄ Rome (x2)','p',1440,'a','ticketing'),
    jsonb_build_object('d','Hébergements Rome et Florence','p',2600,'a','hotel_intl'),
    jsonb_build_object('d','Transfert retour','p',90,'a','transport')), d0 - 20);
  perform pg_temp.pay('demo-rome-acompte', 'in', 'card', 1240, c_chaabane, null,
    jsonb_build_array(jsonb_build_object('invoice_id', inv2, 'amount', 1240)), d0 - 30, 'Banque principale', true, 'payment', 'TPE-71123');
  perform pg_temp.pay('demo-rome-solde', 'in', 'transfer', 2891, c_chaabane, null,
    jsonb_build_array(jsonb_build_object('invoice_id', inv2, 'amount', 2891)), d0 - 15, 'Banque principale', true, 'payment', 'VIR-ROME-02');
  perform pg_temp.doc('ticket', 'Billets électroniques Rome', 'billets-rome', c_chaabane, d_rome, true);
  perform pg_temp.doc('voucher', 'Vouchers hôtels Rome et Florence', 'vouchers-rome-florence', c_chaabane, d_rome, true);
  insert into public.incidents (dossier_id, supplier_id, kind, title, description, owner_id, due_at, cost_impact, status)
  values (d_rome, f_bos, 'complaint', 'Chambre non conforme à Rome', 'Chambre côté rue au lieu de cour intérieure ; le client demande un geste.',
    s_ops, t0 + interval '1 day', 60, 'in_progress');

  -- Transfert d'un autre dossier sur le même véhicule à la même heure → conflit signalé
  d_transfer := pg_temp.quote(c_bouaziz, 'transport', 'Transfert aéroport — W. Bouaziz', s_ops, null, d0 + 4, d0 + 4, 3, 0,
    jsonb_build_array(jsonb_build_object('a','transport','t','transfer','d','Transfert Tunis-Carthage → Hammamet','sup',f_trans,'cost',90,'price',140)),
    '[{"label":"Règlement","kind":"deposit","percent":100}]');
  update public.services set start_at = (d0 + 4) + time '21:30', end_at = (d0 + 4) + time '22:45', status = 'confirmed',
    details = details || '{"vehicle":"Van 8 places TU-5521","driver":"Sami","pax_count":"3","vehicle_capacity":"8"}'
   where dossier_id = d_transfer;

  -- -------------------------------------------------------------------
  -- 9. Voyage terminé, prêt pour la clôture financière (Djerba)
  -- -------------------------------------------------------------------
  d_djerba := pg_temp.quote(c_bouaziz, 'hotel_tn', 'Séjour Djerba — W. Bouaziz', s_com, null, d0 - 20, d0 - 13, 2, 0,
    jsonb_build_array(jsonb_build_object('a','hotel_tn','t','hotel','d','Radisson Blu Palace Djerba — 7 nuits ALL','sup',f_tb,'cost',1960,'price',2380,
      'det',jsonb_build_object('room_type','Double','board','ALL'))),
    '[{"label":"Acompte","kind":"deposit","percent":30},{"label":"Solde","kind":"balance","percent":70,"days_before_departure":7}]');
  update public.services set status = 'confirmed', cost_confirmed = 1960, confirmation_ref = 'TB-DJ-4471' where dossier_id = d_djerba;
  update public.dossiers set status = 'completed' where id = d_djerba;
  inv3 := pg_temp.invoice(c_bouaziz, d_djerba, 'invoice', jsonb_build_array(jsonb_build_object('d','Séjour Radisson Blu Palace Djerba — 7 nuits','p',2380,'a','hotel_tn')), d0 - 28);
  perform pg_temp.pay('demo-djerba-1', 'in', 'transfer', 714, c_bouaziz, null, jsonb_build_array(jsonb_build_object('invoice_id', inv3, 'amount', 714)), d0 - 35, 'Banque principale');
  perform pg_temp.pay('demo-djerba-2', 'in', 'cash', 1667, c_bouaziz, null, jsonb_build_array(jsonb_build_object('invoice_id', inv3, 'amount', 1667)), d0 - 27, 'Caisse principale');
  si1 := pg_temp.supinv(f_tb, 'TB-F-2026-1182', d0 - 12, 1960, 'TND', 1, jsonb_build_array(jsonb_build_object('dossier_id', d_djerba, 'weight', 1)), 'manual', 19.6);

  -- -------------------------------------------------------------------
  -- 10. Ancien dossier de M. Ben Salah (espace client : historique, facture, documents)
  -- -------------------------------------------------------------------
  d_sousse := pg_temp.quote(c_bensalah, 'hotel_tn', 'Séjour Sousse — famille Ben Salah', s_com, null, d0 - 75, d0 - 70, 2, 1,
    jsonb_build_array(jsonb_build_object('a','hotel_tn','t','hotel','d','Mövenpick Sousse — 5 nuits DP, chambre familiale','sup',f_tb,'cost',1540,'price',1890,
      'det',jsonb_build_object('room_type','Familiale','board','DP'))),
    '[{"label":"Règlement","kind":"deposit","percent":100}]');
  insert into public.dossier_travellers (dossier_id, traveller_id, is_lead) values (d_sousse, t_bs1, true), (d_sousse, t_bs2, false);
  update public.services set status = 'confirmed', cost_confirmed = 1540, confirmation_ref = 'TB-SO-2290' where dossier_id = d_sousse;
  update public.dossiers set status = 'completed' where id = d_sousse;
  inv4 := pg_temp.invoice(c_bensalah, d_sousse, 'invoice', jsonb_build_array(jsonb_build_object('d','Séjour Mövenpick Sousse — 5 nuits DP','p',1890,'a','hotel_tn')), d0 - 80);
  perform pg_temp.pay('demo-sousse', 'in', 'cheque', 1891, c_bensalah, null,
    jsonb_build_array(jsonb_build_object('invoice_id', inv4, 'amount', 1891)), d0 - 82, 'Banque principale', true, 'payment', null, 'CHQ-0038120');
  si2 := pg_temp.supinv(f_tb, 'TB-F-2026-0874', d0 - 68, 1540, 'TND', 1, jsonb_build_array(jsonb_build_object('dossier_id', d_sousse, 'weight', 1)), 'manual');
  perform public.close_dossier_financially(d_sousse);
  update public.dossiers set status = 'archived' where id = d_sousse;
  perform pg_temp.doc('invoice_pdf', 'Facture séjour Sousse', 'facture-sousse', c_bensalah, d_sousse, true);
  perform pg_temp.doc('voucher', 'Voucher Mövenpick Sousse', 'voucher-sousse', c_bensalah, d_sousse, true);

  -- -------------------------------------------------------------------
  -- 11. Dossier annulé : avoir et remboursement partiel
  -- -------------------------------------------------------------------
  d_cancel := pg_temp.quote(c_sassi, 'hotel_intl', 'Séjour Paris — R. Sassi', s_com2, null, d0 + 20, d0 + 24, 2, 0,
    jsonb_build_array(jsonb_build_object('a','hotel_intl','t','hotel','d','Hôtel 3* Paris Opéra — 4 nuits','sup',f_bos,'cost',480,'cur','EUR','fx',3.39,'price',1900)),
    '[{"label":"Acompte","kind":"deposit","percent":50},{"label":"Solde","kind":"balance","percent":50,"days_before_departure":10}]');
  inv5 := pg_temp.invoice(c_sassi, d_cancel, 'invoice', jsonb_build_array(jsonb_build_object('d','Acompte séjour Paris','p',950,'a','hotel_intl')), d0 - 14);
  perform pg_temp.pay('demo-paris-acompte', 'in', 'transfer', 951, c_sassi, null, jsonb_build_array(jsonb_build_object('invoice_id', inv5, 'amount', 951)), d0 - 13, 'Banque principale');
  update public.services set status = 'cancelled', details = details || '{"cancel_reason":"Annulation client — frais de 150 DT"}' where dossier_id = d_cancel;
  perform public.set_dossier_status(d_cancel, 'cancelled', 'Annulation client pour raisons familiales');
  av1 := pg_temp.invoice(c_sassi, d_cancel, 'credit_note', jsonb_build_array(jsonb_build_object('d','Avoir sur acompte (frais d''annulation 150 DT retenus)','p',800)),
    d0 - 5, true, inv5, 'Annulation client');
  perform pg_temp.pay('demo-paris-remboursement', 'out', 'transfer', 800, c_sassi, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_cancel, 'amount', 800)), d0 - 3, 'Banque principale', true, 'refund', 'VIR-RMB-0311');

  -- -------------------------------------------------------------------
  -- 12. Dossier de référence Istanbul : facture + pièce fournisseur EUR ventilée 60/40
  -- -------------------------------------------------------------------
  d_istanbul := (select id from public.dossiers where reference like 'DOS-%-00001' order by created_at limit 1);
  perform pg_temp.invoice(c_bensalah, d_istanbul, 'invoice', jsonb_build_array(jsonb_build_object('d','Voyage Istanbul 8 jours — forfait','p',2390,'a','organized_trip')), d0 - 1, false);
  si3 := pg_temp.supinv(f_bos, 'BOS-INV-55871', d0 - 6, 1800, 'EUR', 3.39,
    jsonb_build_array(jsonb_build_object('departure_id','88888888-0000-0000-0000-000000000001','weight',60),
                      jsonb_build_object('departure_id','88888888-0000-0000-0000-000000000002','weight',40)), 'percent');
  -- Facture de transport partagée entre deux dossiers (MICE et Rome) au prorata des passagers
  si4 := pg_temp.supinv(f_trans, 'TS-2026-0912', d0 - 4, 960, 'TND', 1,
    jsonb_build_array(jsonb_build_object('dossier_id', d_mice, 'weight', 49), jsonb_build_object('dossier_id', d_rome, 'weight', 2)), 'pax', 9.6);
  -- Pièce fournisseur doublon justifiée
  insert into public.supplier_invoices (supplier_id, supplier_ref, issue_date, due_date, total_amount, duplicate_justification, notes)
  values (f_trans, 'TS-2026-0912', d0 - 2, d0 + 28, 120, 'Facture rectificative (supplément bagages) portant la même référence', 'Rectificatif')
  returning id into e;
  -- Règlement fournisseur partiel
  perform pg_temp.pay('demo-reglement-fournisseur-tb', 'out', 'transfer', 1000, null, f_tb,
    jsonb_build_array(jsonb_build_object('supplier_invoice_id', si1, 'amount', 1000)), d0 - 5, 'Banque principale', true, 'payment', 'VIR-TB-1182');
  perform pg_temp.doc('supplier_invoice', 'Facture Tunisiabeds TB-F-2026-1182', 'facture-tunisiabeds-1182', null, d_djerba, false, null, f_tb);
  update public.supplier_invoices set document_id = (select id from public.documents where storage_path = 'demo/facture-tunisiabeds-1182.pdf') where id = si1;

  -- -------------------------------------------------------------------
  -- Trésorerie : remise de chèques, chèque rejeté, transfert, clôture de caisse, paiement en ligne
  -- -------------------------------------------------------------------
  p4 := pg_temp.pay('demo-cheque-rejete', 'in', 'cheque', 350, c_hela, null, '[]', d0 - 9, 'Banque principale', false, 'payment', null, 'CHQ-0091244');
  perform public.create_deposit_slip((select id from public.treasury_accounts where name = 'Banque principale'), array[p3, p4], d0 - 1);
  perform public.validate_payment(p4, d0 - 7);
  perform public.reject_payment(p4, 'Provision insuffisante', 12);
  perform pg_temp.pay('demo-cheque-a-remettre', 'in', 'cheque', 620, c_riahi, null,
    jsonb_build_array(jsonb_build_object('dossier_id', d_sud, 'amount', 490)), d0, 'Banque principale', false, 'payment', null, 'CHQ-0102233');
  perform public.transfer_funds((select id from public.treasury_accounts where name = 'Caisse principale'),
    (select id from public.treasury_accounts where name = 'Banque principale'), 1500, d0 - 2, 'Versement espèces en banque');
  insert into public.cash_closings (treasury_account_id, closing_date, expected_balance, counted_balance, justification, closed_by)
  select id, d0 - 1, 867, 865, 'Écart de 2 DT : rendu de monnaie', s_fin from public.treasury_accounts where name = 'Caisse principale';

  insert into public.payment_intents (dossier_id, client_id, amount, provider, provider_session_id, status)
  values (d_hotel, c_nadia, 300, 'mockpay', 'cs_demo_hotel_300', 'created') returning id into intent;
  perform public.process_payment_event('mockpay', 'evt_demo_hotel_300', 'payment.succeeded', 'cs_demo_hotel_300', 300, '{"demo":true}', true);
  insert into public.payment_intents (dossier_id, client_id, amount, provider, provider_session_id, status)
  values (d_hotel, c_nadia, 694.35, 'mockpay', 'cs_demo_hotel_refused', 'created');
  perform public.process_payment_event('mockpay', 'evt_demo_hotel_refused', 'payment.failed', 'cs_demo_hotel_refused', 694.35, '{"demo":true}', true);
  perform public.process_payment_event('mockpay', 'evt_demo_forged', 'payment.succeeded', 'cs_demo_hotel_300', 300, '{"demo":true}', false);

  -- -------------------------------------------------------------------
  -- Comptabilité : brouillard validé (sauf les 3 dernières pièces), pièce déséquilibrée en attente
  -- -------------------------------------------------------------------
  for e in select id from public.journal_entries where status = 'draft' and public.period_is_open(entry_date)
            order by created_at offset 0 limit greatest((select count(*) from public.journal_entries where status = 'draft') - 3, 0)
  loop
    perform public.post_journal_entry(e);
  end loop;
  insert into public.journal_entries (journal_code, entry_date, piece_ref, label) values ('OD', d0, 'OD-DEMO-01', 'Régularisation à vérifier (déséquilibrée)')
  returning id into e;
  insert into public.journal_lines (entry_id, account_code, label, debit, credit) values
    (e, '627', 'Frais bancaires', 100, 0), (e, '5321', 'Banque', 0, 90);
  -- Exercice précédent clôturé
  if not exists (select 1 from public.fiscal_periods where start_date = make_date(y_prev, 1, 1)) then
    insert into public.fiscal_periods (label, start_date, end_date) values ('Exercice ' || y_prev || ' (démo)', make_date(y_prev, 1, 1), make_date(y_prev, 12, 31));
    insert into public.journal_entries (journal_code, entry_date, piece_ref, label) values ('OD', make_date(y_prev, 12, 31), 'OD-' || y_prev || '-CLO', 'Écriture de clôture ' || y_prev)
    returning id into e;
    insert into public.journal_lines (entry_id, account_code, label, debit, credit) values (e, '5321', 'Solde banque', 12500, 0), (e, '411', 'Clients', 0, 12500);
    perform public.post_journal_entry(e);
    perform public.close_fiscal_period((select id from public.fiscal_periods where start_date = make_date(y_prev, 1, 1)));
  end if;

  -- -------------------------------------------------------------------
  -- Connecteurs : journal technique et réservation « à vérifier »
  -- -------------------------------------------------------------------
  insert into public.api_call_logs (connector_code, operation, request_id, status, duration_ms, request_summary, response_summary, error_message, actor_id, created_at) values
    ('hotel_api_tunisiabeds', 'search', null, 'success', 142, '{"city":"Hammamet","checkIn":"…","adults":2}', '{"offers":36}', null, s_ops, now() - interval '2 days'),
    ('hotel_api_mygo', 'search', null, 'unavailable', 2, '{"city":"Hammamet"}', null, 'MyGo : erreur de connexion', s_ops, now() - interval '2 days'),
    ('hotel_api_tunisiabeds', 'recheck', null, 'success', 120, '{"offerRef":"TB-HAM-001|DBL|DP"}', '{"changed":false}', null, s_ops, now() - interval '2 days'),
    ('hotel_api_tunisiabeds', 'book', 'demo-req-hotel-001', 'success', 160, '{"guests":"***","hotel":"TB-HAM-001"}', '{"status":"confirmed","externalRef":"TBDEMO7781"}', null, s_ops, now() - interval '2 days'),
    ('hotel_api_mygo', 'book', 'demo-req-hotel-002', 'timeout', 4000, '{"guests":"***","hotel":"MG-5520"}', null, 'MyGo : délai dépassé', s_ops, now() - interval '5 hours');
  -- Réservation incertaine sur le séminaire (délai dépassé → à vérifier)
  sv := pg_temp.svc(d_mice, 'hotel');
  insert into public.hotel_booking_requests (request_id, connector_code, service_id, dossier_id, provider_hotel_code, offer_snapshot,
    status, amount, currency, last_error, attempts, created_by)
  values ('demo-req-hotel-002', 'hotel_api_mygo', sv, d_mice, 'MG-5520',
    jsonb_build_object('provider','hotel_api_mygo','offerRef','5520-DP','board','DP','price',10400,'fetchedAt',now() - interval '5 hours'),
    'to_verify', 10400, 'TND', 'MyGo : délai dépassé — la réservation a pu aboutir', 1, s_ops)
  returning id into hb;
  insert into public.alerts (kind, severity, title, dossier_id, service_id, details, owner_id, dedupe_key)
  values ('hotel_booking_to_verify', 'red', 'Réservation MyGo à vérifier (délai dépassé)', d_mice, sv,
    jsonb_build_object('booking_request_id', hb, 'request_id', 'demo-req-hotel-002'), s_ops, 'demo:booking-to-verify');

  -- -------------------------------------------------------------------
  -- Imports : rapport billetterie intégré + rapport en prévisualisation
  -- -------------------------------------------------------------------
  tpl := (select id from public.import_templates where kind = 'ticketing' and version = 1);
  insert into public.import_batches (kind, template_id, file_name, file_sha256, platform, stats, created_by)
  values ('ticketing', tpl, 'rapport-billetterie-' || to_char(d0 - 7, 'YYYY-MM-DD') || '.csv', 'demo-sha-billetterie-1', 'plateforme-billetterie',
    '{"new":2,"duplicate":0,"modified":0,"invalid":1,"ambiguous":0}', s_ops)
  returning id into b1;
  insert into public.import_rows (batch_id, row_number, external_key, classification, errors, raw, normalized, target_dossier_id, decision) values
    (b1, 2, '1990000555101', 'new', '[]', '{}', jsonb_build_object('ticket_number','199-0000555101','pnr','RM8KQ2','passenger_name','CHAABANE/MEHDI',
      'description','TU — TUN-FCO — CHAABANE/MEHDI','start_date', d0 - 2,'end_date', d0 - 2,'fare',260,'taxes',60,'fees',0,'cost',320,'currency','TND','status','issued'), d_rome, 'apply'),
    (b1, 3, '1990000555102', 'new', '[]', '{}', jsonb_build_object('ticket_number','199-0000555102','pnr','RM8KQ2','passenger_name','CHAABANE/SARRA',
      'description','TU — TUN-FCO — CHAABANE/SARRA','start_date', d0 - 2,'end_date', d0 - 2,'fare',260,'taxes',60,'fees',0,'cost',320,'currency','TND','status','refund_expected','refund_amount',180), d_rome, 'apply'),
    (b1, 4, null, 'invalid', '[{"field":"currency","message":"Devise absente"}]', '{"Ticket":"199-0000555199"}', '{}', null, 'skip');
  perform public.commit_import_batch(b1);
  insert into public.import_batches (kind, template_id, file_name, file_sha256, platform, stats, created_by)
  values ('ticketing', tpl, 'rapport-billetterie-' || to_char(d0, 'YYYY-MM-DD') || '.csv', 'demo-sha-billetterie-2', 'plateforme-billetterie',
    '{"new":1,"duplicate":1,"modified":1,"invalid":1,"ambiguous":1}', s_ops)
  returning id into b2;
  insert into public.import_rows (batch_id, row_number, external_key, classification, errors, diff, raw, normalized, candidate_dossier_ids, target_dossier_id, decision) values
    (b2, 2, '1990000555101', 'duplicate', '[]', null, '{}', '{"ticket_number":"199-0000555101","status":"issued"}', '{}', d_rome, 'skip'),
    (b2, 3, '1990000555102', 'modified', '[]', '{"status":{"old":"refund_expected","new":"refunded"},"refund_amount":{"old":180,"new":180}}', '{}',
      '{"ticket_number":"199-0000555102","status":"refunded","refund_amount":180,"cost":320,"currency":"TND"}', '{}', d_rome, 'apply'),
    (b2, 4, '1990000555150', 'new', '[]', null, '{}', jsonb_build_object('ticket_number','199-0000555150','pnr','PX7Q2M','passenger_name','BEN AMMAR/HELA',
      'description','TU — TUN-CDG — BEN AMMAR/HELA','start_date', d0 + 9,'fare',690,'taxes',200,'cost',890,'currency','TND','status','issued'), array[d_billet], d_billet, 'apply'),
    (b2, 5, '1990000555160', 'ambiguous', '[]', null, '{}', '{"ticket_number":"199-0000555160","passenger_name":"TRABELSI/F","status":"issued"}',
      array[d_omra, '33333333-0000-0000-0000-000000000000'::uuid], null, 'pending'),
    (b2, 6, null, 'invalid', '[{"field":"start_date","message":"Date invalide : « 31/02/2026 »"}]', null, '{}', '{}', '{}', null, 'skip');
  update public.import_rows set candidate_dossier_ids = array[d_omra] where batch_id = b2 and row_number = 5;

  -- -------------------------------------------------------------------
  -- Tâches : rouge / orange / planifié / attente / bloquée / terminée / sans responsable
  -- -------------------------------------------------------------------
  insert into public.tasks (title, description, dossier_id, assignee_id, due_at, status, financial_risk, waiting_reason, completion_note, manual_priority, manual_priority_reason) values
    ('Relancer le client pour le solde', 'Solde Omra à encaisser avant la date limite fournisseur.', d_omra, s_com, t0 - interval '1 day', 'todo', true, null, null, null, null),
    ('Confirmer la salle plénière (option expire)', null, d_mice, s_ops, t0 + interval '3 hours', 'in_progress', true, null, null, null, null),
    ('Envoyer la rooming list Omra au fournisseur', null, d_omra, s_ops, (d0 + 0) + time '17:00', 'todo', false, null, null, null, null),
    ('Préparer le carnet de voyage Rome', null, d_rome, s_com, t0 + interval '6 days', 'todo', false, null, null, null, null),
    ('Rappeler MedTech pour la visite de repérage', null, null, s_com, t0 + interval '2 days', 'todo', false, null, null, null, null),
    ('Vérifier le transfert retour Rome (même van qu''un autre dossier)', null, d_rome, s_ops, t0 + interval '1 day', 'blocked', false,
      'Conflit de véhicule TU-5521 à 21 h avec le dossier Bouaziz', null, null, null),
    ('Envoyer le voucher Marina Palace', null, d_hotel, s_ops, t0 - interval '2 days', 'done', false, null, 'Voucher publié dans l''espace client', null, null),
    ('Client VIP : appeler avant le départ', null, d_hotel, s_com, t0 + interval '9 days', 'todo', false, null, null, 'red', 'Client fidèle, demande particulière'),
    ('Mettre à jour les photos de l''offre Omra', null, null, s_site, t0 + interval '3 days', 'todo', false, null, null, null, null),
    ('Attribuer la demande Djerba (site)', null, null, null, t0 + interval '4 hours', 'todo', false, null, null, null, null),
    ('Rapprocher le relevé bancaire du mois', null, null, s_fin, t0 + interval '5 days', 'todo', false, null, null, null, null),
    ('Relancer le chèque rejeté de H. Ben Ammar', null, d_billet, s_fin, t0 + interval '1 day', 'todo', true, null, null, null, null);
  insert into public.external_deadlines (dossier_id, kind, label, due_at, source)
  values (d_mice, 'rooming_list', 'Rooming list séminaire à envoyer', null, null);

  -- Contrôles avant départ
  perform public.generate_departure_checklist(d_hotel);
  perform public.generate_departure_checklist(d_billet);
  perform public.generate_departure_checklist(d_rome);
  update public.dossier_checks set status = 'ok', owner_id = s_ops, note = 'Contrôlé' where dossier_id in (d_hotel, d_rome);
  update public.dossier_checks set status = 'blocking', note = 'Billet non émis' where dossier_id = d_billet and code like 'ticket:%';

  -- -------------------------------------------------------------------
  -- Alertes (À examiner / Justifiée / Corrigée / Résolue) et messages préparés
  -- -------------------------------------------------------------------
  insert into public.alerts (kind, severity, title, dossier_id, details, owner_id, status, resolution_note, dedupe_key) values
    ('negative_margin', 'red', 'Marge négative sur le forfait Omra (coût SAR au taux du jour)', d_omra,
      '{"compared":"vente 20 700 DT vs coûts prévus 18 155 DT + change"}', s_fin, 'to_review', null, 'demo:margin-omra'),
    ('unpaid_due', 'orange', 'Échéance client dépassée : tranche 1 du dossier Istanbul', d_istanbul, '{"due":"Tranche 1"}', s_com, 'to_review', null, 'demo:overdue-istanbul'),
    ('supplier_cost_gap', 'orange', 'Écart de 60 DT entre coût prévu et facturé (Rome)', d_rome, '{"planned":2268,"invoiced":2328}', s_fin, 'justified',
      'Geste commercial accordé suite à réclamation, validé par la direction', 'demo:gap-rome'),
    ('missing_document', 'orange', 'Voucher manquant (Marina Palace)', d_hotel, '{}', s_ops, 'corrected', 'Voucher reçu et publié', 'demo:voucher-hotel'),
    ('duplicate_supplier_invoice', 'info', 'Référence TS-2026-0912 utilisée deux fois', null, '{"supplier":"Transport Sahel"}', s_fin, 'resolved',
      'Facture rectificative justifiée', 'demo:dup-ts');
  insert into public.outbox_messages (channel, recipient, subject, body, dossier_id, status, dedupe_key) values
    ('email', 'client3@hitravel.test', 'Votre confirmation de séjour', 'Bonjour Nadia, votre séjour au Marina Palace est confirmé…', d_hotel, 'draft', 'demo:mail-hotel'),
    ('whatsapp', '+216 23 567 890', null, 'Bonjour M. Mansour, il manque vos relevés bancaires et votre assurance pour le rendez-vous.', d_visa, 'blocked_channel_disabled', 'demo:wa-visa');

  -- -------------------------------------------------------------------
  -- Offres : brouillon, à valider, masquée (workflow de publication)
  -- -------------------------------------------------------------------
  insert into public.offers (slug, title, activity, destination, country, duration_days, nights, summary, inclusions, price_amount, price_basis,
    occupancy_basis, deposit_amount, status, owner_id) values
    ('marrakech-5-jours', 'Marrakech — 5 jours / 4 nuits', 'organized_trip', 'Marrakech', 'MA', 5, 4, 'Médina, jardins Majorelle et désert d''Agafay.',
      '{"Vols","4 nuits en riad","Excursion Agafay"}', 1690, 'per_person', 'Base chambre double', 400, 'review', s_site),
    ('visa-turquie-evisa', 'e-Visa Turquie', 'visa', 'Turquie', 'TR', null, null, 'Constitution et dépôt de votre e-Visa.', '{"Formulaire","Suivi"}',
      120, 'per_person', null, null, 'draft', s_site),
    ('tabarka-week-end', 'Week-end à Tabarka', 'hotel_tn', 'Tabarka', 'TN', 3, 2, 'Offre saisonnière masquée hors saison.', '{"2 nuits DP"}',
      210, 'from', 'Par personne, chambre double', null, 'hidden', s_site);
end $$;
