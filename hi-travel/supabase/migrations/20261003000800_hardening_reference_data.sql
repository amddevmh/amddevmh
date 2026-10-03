-- =====================================================================
-- Durcissement des droits d'exécution + données de référence de production
-- =====================================================================

-- Fonctions : aucun accès anonyme par défaut, sauf la soumission de demande du site
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.submit_site_request(jsonb) to anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Fonctions utilisées par les politiques RLS évaluées pour anon (elles renvoient « faux » sans session)
grant execute on function public.offer_is_public(public.offers) to anon;
grant execute on function public.is_staff() to anon;
grant execute on function public.has_perm(text, public.perm_action) to anon;
grant execute on function public.current_staff_role() to anon;
grant execute on function public.portal_client_id() to anon;

-- Recherche de doublons réservée aux collaborateurs du CRM
create or replace function public.find_client_duplicates(p_email text, p_phone text, p_name text default null)
returns table (id uuid, display_name text, email text, phone text, match_reason text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.display_name, c.email, c.phone,
         concat_ws(', ',
           case when p_email is not null and lower(c.email) = lower(p_email) then 'e-mail identique' end,
           case when nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
                 and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
                then 'téléphone identique' end,
           case when p_name is not null and lower(c.display_name) = lower(p_name) then 'nom identique' end
         ) as match_reason
  from public.clients c
  where c.merged_into_id is null
    and (public.is_internal_context() or public.has_perm('crm', 'read'))
    and (
      (p_email is not null and lower(c.email) = lower(p_email))
      or (nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
          and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8))
      or (p_name is not null and lower(c.display_name) = lower(p_name))
    )
  limit 10
$$;
revoke execute on function public.find_client_duplicates(text, text, text) from public, anon;

-- Variante interne sans contrôle de droits, réservée aux fonctions propriétaires (ex. submit_site_request)
create or replace function public._client_duplicate_ids(p_email text, p_phone text)
returns uuid[]
language sql stable security definer set search_path = public
as $$
  select array_agg(c.id) from public.clients c
   where c.merged_into_id is null
     and ((p_email is not null and lower(c.email) = lower(p_email))
       or (nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') is not null
           and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)))
$$;
revoke execute on function public._client_duplicate_ids(text, text) from public, anon, authenticated;

-- Montant encaissé : visible au personnel ou au client propriétaire du dossier
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
     and (public.is_staff() or public.is_internal_context()
          or exists (select 1 from public.dossiers d where d.id = p_dossier_id and d.client_id = public.portal_client_id()))
$$;

-- Numérotation : nécessaire aux valeurs par défaut des références (devis, dossiers, demandes)

-- Vue client : situation financière d'un dossier sans coûts ni marges
create view public.portal_dossier_balances
with (security_invoker = true)
as
select d.id as dossier_id, d.reference, d.total_price,
       coalesce((select sum(total_ttc) from public.invoices i where i.dossier_id = d.id and i.kind = 'credit_note' and i.status = 'validated'), 0) as credit_notes,
       public.dossier_paid_amount(d.id) as paid,
       d.total_price
         - coalesce((select sum(total_ttc) from public.invoices i where i.dossier_id = d.id and i.kind = 'credit_note' and i.status = 'validated'), 0)
         - public.dossier_paid_amount(d.id) as balance
from public.dossiers d;

-- =====================================================================
-- Données de référence
-- =====================================================================

-- Matrice de droits proposée (section 3) — modifiable dans Paramètres
insert into public.role_permissions (role, module, action)
select 'direction'::public.app_role, m, a
  from unnest(array['crm', 'quotes', 'dossiers', 'departures', 'suppliers', 'finance', 'accounting', 'documents',
                    'identity', 'tasks', 'site', 'reports', 'settings', 'imports', 'integrations', 'margins']) m,
       unnest(enum_range(null::public.perm_action)) a;

insert into public.role_permissions (role, module, action) values
  -- Commercial et réservation
  ('commercial', 'crm', 'read'), ('commercial', 'crm', 'create'), ('commercial', 'crm', 'update'), ('commercial', 'crm', 'export'),
  ('commercial', 'quotes', 'read'), ('commercial', 'quotes', 'create'), ('commercial', 'quotes', 'update'), ('commercial', 'quotes', 'validate'), ('commercial', 'quotes', 'export'),
  ('commercial', 'dossiers', 'read'), ('commercial', 'dossiers', 'create'), ('commercial', 'dossiers', 'update'), ('commercial', 'dossiers', 'export'),
  ('commercial', 'departures', 'read'), ('commercial', 'departures', 'update'),
  ('commercial', 'suppliers', 'read'),
  ('commercial', 'finance', 'read'),
  ('commercial', 'margins', 'read'),
  ('commercial', 'documents', 'read'), ('commercial', 'documents', 'create'), ('commercial', 'documents', 'update'),
  ('commercial', 'identity', 'read'), ('commercial', 'identity', 'update'),
  ('commercial', 'tasks', 'read'), ('commercial', 'tasks', 'create'), ('commercial', 'tasks', 'update'),
  ('commercial', 'site', 'read'),
  -- Opérations
  ('operations', 'crm', 'read'),
  ('operations', 'quotes', 'read'),
  ('operations', 'dossiers', 'read'), ('operations', 'dossiers', 'create'), ('operations', 'dossiers', 'update'), ('operations', 'dossiers', 'export'),
  ('operations', 'departures', 'read'), ('operations', 'departures', 'create'), ('operations', 'departures', 'update'), ('operations', 'departures', 'export'),
  ('operations', 'suppliers', 'read'), ('operations', 'suppliers', 'create'), ('operations', 'suppliers', 'update'),
  ('operations', 'documents', 'read'), ('operations', 'documents', 'create'), ('operations', 'documents', 'update'),
  ('operations', 'identity', 'read'), ('operations', 'identity', 'update'),
  ('operations', 'tasks', 'read'), ('operations', 'tasks', 'create'), ('operations', 'tasks', 'update'), ('operations', 'tasks', 'validate'),
  ('operations', 'imports', 'read'), ('operations', 'imports', 'create'), ('operations', 'imports', 'validate'),
  ('operations', 'integrations', 'read'),
  -- Finance
  ('finance', 'crm', 'read'),
  ('finance', 'quotes', 'read'),
  ('finance', 'dossiers', 'read'), ('finance', 'dossiers', 'export'),
  ('finance', 'departures', 'read'),
  ('finance', 'suppliers', 'read'), ('finance', 'suppliers', 'update'),
  ('finance', 'finance', 'read'), ('finance', 'finance', 'create'), ('finance', 'finance', 'update'), ('finance', 'finance', 'export'), ('finance', 'finance', 'validate'),
  ('finance', 'accounting', 'read'), ('finance', 'accounting', 'create'), ('finance', 'accounting', 'update'), ('finance', 'accounting', 'export'), ('finance', 'accounting', 'validate'),
  ('finance', 'margins', 'read'),
  ('finance', 'documents', 'read'), ('finance', 'documents', 'create'),
  ('finance', 'tasks', 'read'), ('finance', 'tasks', 'create'), ('finance', 'tasks', 'update'),
  ('finance', 'reports', 'read'), ('finance', 'reports', 'export'),
  ('finance', 'imports', 'read'), ('finance', 'imports', 'create'),
  -- Gestion du site : contenus publics, sans passeports ni marges
  ('site', 'site', 'read'), ('site', 'site', 'create'), ('site', 'site', 'update'), ('site', 'site', 'validate'), ('site', 'site', 'archive'),
  ('site', 'tasks', 'read');

insert into public.number_series (code, prefix, per_year, padding, label) values
  ('LEAD', 'DEM', true, 5, 'Demandes'),
  ('QUOTE', 'DEV', true, 5, 'Devis'),
  ('DOSSIER', 'DOS', true, 5, 'Dossiers'),
  ('INVOICE', 'FAC', true, 5, 'Factures'),
  ('CREDIT_NOTE', 'AV', true, 5, 'Avoirs'),
  ('PROFORMA', 'PF', true, 5, 'Pro formas'),
  ('PAYMENT', 'REG', true, 6, 'Règlements'),
  ('DEPOSIT', 'BRD', true, 5, 'Bordereaux de remise'),
  ('JOURNAL_VT', 'VT', true, 6, 'Journal des ventes'),
  ('JOURNAL_AC', 'AC', true, 6, 'Journal des achats'),
  ('JOURNAL_BQ', 'BQ', true, 6, 'Journal de banque'),
  ('JOURNAL_CA', 'CA', true, 6, 'Journal de caisse'),
  ('JOURNAL_OD', 'OD', true, 6, 'Opérations diverses');

-- Plan de comptes de départ (à approuver par le comptable de HI Travel)
insert into public.accounts (code, label, type, is_auxiliary) values
  ('401', 'Fournisseurs', 'liability', true),
  ('411', 'Clients', 'asset', true),
  ('4191', 'Clients — avances et acomptes reçus', 'liability', false),
  ('4366', 'TVA collectée', 'liability', false),
  ('4367', 'Droit de timbre', 'liability', false),
  ('4453', 'Retenues à la source', 'liability', false),
  ('5111', 'Chèques et effets à encaisser', 'asset', false),
  ('5321', 'Banque', 'asset', false),
  ('5322', 'Banque — paiement en ligne', 'asset', false),
  ('541', 'Caisse', 'asset', false),
  ('581', 'Virements internes', 'asset', false),
  ('604', 'Achats de prestations touristiques', 'expense', false),
  ('627', 'Frais bancaires', 'expense', false),
  ('706', 'Prestations de services touristiques', 'income', false),
  ('7091', 'Rabais, remises et avoirs accordés', 'income', false),
  ('766', 'Gains de change', 'income', false),
  ('666', 'Pertes de change', 'expense', false);

insert into public.journals (code, label, kind) values
  ('VT', 'Ventes', 'sales'), ('AC', 'Achats', 'purchases'), ('BQ', 'Banque', 'bank'),
  ('CA', 'Caisse', 'cash'), ('OD', 'Opérations diverses', 'misc');

insert into public.posting_rules (event, journal_code, debit_account, credit_account, label) values
  ('invoice_revenue', 'VT', '411', '706', 'Facture client — chiffre d''affaires HT'),
  ('invoice_tax', 'VT', '411', '4366', 'Facture client — taxes'),
  ('invoice_stamp', 'VT', '411', '4367', 'Facture client — timbre'),
  ('credit_note', 'VT', '7091', '411', 'Avoir client'),
  ('client_receipt', 'BQ', '5321', '411', 'Encaissement client'),
  ('client_refund', 'BQ', '411', '5321', 'Remboursement / rejet client'),
  ('supplier_invoice', 'AC', '604', '401', 'Pièce fournisseur'),
  ('supplier_payment', 'BQ', '401', '5321', 'Règlement fournisseur'),
  ('supplier_refund', 'BQ', '5321', '401', 'Remboursement fournisseur'),
  ('internal_transfer', 'OD', '581', '581', 'Transfert interne (comptes de trésorerie surchargés)');

-- Règles fiscales : valeurs indicatives NON validées — à confirmer par le comptable (FIN08)
insert into public.tax_rules (code, label, kind, rate, fixed_amount, effective_from, validated_by_accountant) values
  ('VAT_STD', 'TVA taux normal (à valider)', 'vat', 0.19, null, '2026-01-01', false),
  ('VAT_EXEMPT', 'Exonéré / hors champ', 'vat', 0, null, '2026-01-01', false),
  ('STAMP', 'Droit de timbre sur facture (à valider)', 'stamp', null, 1.000, '2026-01-01', false),
  ('WHT_STD', 'Retenue à la source (à valider)', 'withholding', 0.01, null, '2026-01-01', false);

insert into public.fiscal_periods (label, start_date, end_date) values
  ('Exercice 2026', '2026-01-01', '2026-12-31'),
  ('Exercice 2027', '2027-01-01', '2027-12-31');

insert into public.treasury_accounts (kind, name, account_code, bank_name, opening_balance, opening_date) values
  ('cash', 'Caisse principale', '541', null, 0, '2026-01-01'),
  ('bank', 'Banque principale', '5321', 'Banque à préciser', 0, '2026-01-01'),
  ('bank', 'Compte paiement en ligne', '5322', 'Prestataire de paiement (simulé)', 0, '2026-01-01');

insert into public.app_settings (key, value, description, is_public)
select 'online_payment_account', jsonb_build_object('treasury_account_id', id), 'Compte de trésorerie crédité par le paiement en ligne', false
  from public.treasury_accounts where name = 'Compte paiement en ligne';

insert into public.app_settings (key, value, description, is_public) values
  ('agency', jsonb_build_object(
     'name', 'HI Travel',
     'email', 'resa@hitravel.tn',
     'phone', '+216 28 88 44 88',
     'whatsapp', '+21628884488',
     'address', 'Tunisie — adresse à compléter',
     'hours', 'Lundi – samedi, 9h00 – 18h00 (à confirmer)',
     'socials', jsonb_build_object(
        'facebook', 'https://www.facebook.com/people/Hi-Travel/61557116889915/',
        'instagram', 'https://www.instagram.com/hi_travel_tunisie/')),
   'Coordonnées affichées sur le site', true),
  ('priority_thresholds', '{"red_hours": 4, "escalation_hours": 24}', 'Seuils du classement des urgences (JOU02) — à valider', false),
  ('online_payment', '{"enabled": true, "provider": "mockpay", "manual_instructions": "Virement bancaire ou règlement en agence"}', 'Paiement en ligne (FO07)', true),
  ('channels', '{"email_auto_send": false, "whatsapp_auto_send": false}', 'Envois automatiques désactivés tant que non configurés', false);

insert into public.integration_connectors (code, label, kind, enabled, mode, capabilities, notes) values
  ('hotel_api_tunisiabeds', 'API hôtels Tunisie — fournisseur A (simulé)', 'hotel_api', true, 'mock',
   '{"search": true, "book": true, "confirm": true, "voucher": true, "modify": false, "cancel": true, "idempotency_key": true}',
   'Connecteur simulé : remplacer par l''API réelle après réception de la documentation (API01).'),
  ('hotel_api_mygo', 'API hôtels Tunisie — fournisseur B (simulé)', 'hotel_api', true, 'mock',
   '{"search": true, "book": true, "confirm": false, "voucher": false, "modify": false, "cancel": false, "idempotency_key": false}',
   'Connecteur simulé sans idempotence native : contrôle du statut avant toute nouvelle tentative.'),
  ('payment_mockpay', 'Paiement en ligne (simulé)', 'payment', true, 'mock',
   '{"hosted_checkout": true, "webhook_signature": "hmac-sha256", "refund": false}', 'Prestataire à sélectionner avec HI Travel.'),
  ('messaging', 'E-mail / WhatsApp (simulé)', 'messaging', false, 'mock', '{"email": true, "whatsapp": true}',
   'Envois automatiques désactivés ; brouillons uniquement.'),
  ('fx_mock', 'Taux de change (simulé)', 'fx', true, 'mock', '{"currencies": ["EUR", "USD", "SAR"]}', null);

insert into public.import_templates (kind, version, label, delimiter, column_mapping) values
  ('ticketing', 1, 'Rapport billetterie — plateforme externe v1', ',',
   '{"ticket_number": "Ticket", "pnr": "PNR", "passenger_name": "Passenger", "carrier": "Airline", "route": "Route", "start_date": "Travel date", "issue_date": "Issue date", "fare": "Fare", "taxes": "Taxes", "fees": "Fees", "currency": "Currency", "status": "Status", "refund_amount": "Refund", "dossier_reference": "Booking ref", "movement": "Movement"}'),
  ('hotel_intl', 1, 'Rapport hôtels étrangers — plateforme externe v1', ',',
   '{"booking_ref": "Booking ref", "supplier": "Supplier", "hotel": "Hotel", "city": "City", "country": "Country", "guests": "Guests", "rooms": "Rooms", "room_type": "Room type", "board": "Board", "start_date": "Check-in", "end_date": "Check-out", "cost": "Cost", "currency": "Currency", "status": "Status", "dossier_reference": "Agency ref"}');

insert into public.site_pages (slug, title, body, status) values
  ('agence', 'L''agence HI Travel', 'HI Travel accompagne vos voyages en Tunisie et à l''étranger : hôtels, voyages organisés, Omra, visas, billetterie, circuits, transport et événements.', 'published'),
  ('conditions-de-vente', 'Conditions de vente', 'Texte à valider par HI Travel avant mise en ligne.', 'published'),
  ('confidentialite', 'Politique de confidentialité', 'Texte à valider par HI Travel avant mise en ligne.', 'published'),
  ('mentions-legales', 'Mentions légales', 'Texte à valider par HI Travel avant mise en ligne.', 'published');
