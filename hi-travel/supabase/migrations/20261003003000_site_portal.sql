-- =====================================================================
-- Site public, espace client et paiement en ligne (FO05–FO07)
-- Fonctions « security definer » appelées par le client connecté : chacune
-- vérifie que le dossier / document appartient à portal_client_id().
-- Additif uniquement.
-- =====================================================================

-- Majoration appliquée aux tarifs des API hôtels pour obtenir le prix de vente (FO05)
insert into public.app_settings (key, value, description, is_public)
values ('hotel_markup_pct', '{"pct": 10}', 'Majoration appliquée aux tarifs API hôtels (prix de vente site)', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Contrôle d'appartenance commun
-- ---------------------------------------------------------------------
create or replace function public._portal_owned_dossier(p_dossier_id uuid)
returns public.dossiers
language plpgsql stable security definer set search_path = public
as $$
declare
  v_client uuid := public.portal_client_id();
  v_dossier public.dossiers;
begin
  if auth.uid() is null or v_client is null then
    raise exception 'Accès réservé aux clients connectés' using errcode = '42501';
  end if;
  select * into v_dossier from public.dossiers where id = p_dossier_id and client_id = v_client;
  if not found then
    raise exception 'Dossier introuvable' using errcode = '42501';
  end if;
  return v_dossier;
end;
$$;
revoke execute on function public._portal_owned_dossier(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Résumé de confirmation des prestations, sans coûts ni fournisseurs (FO06)
-- ---------------------------------------------------------------------
create or replace function public.portal_dossier_service_summary(p_dossier_id uuid)
returns table (total int, confirmed int, on_option int, requested int, cancelled int)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public._portal_owned_dossier(p_dossier_id);
  return query
    select count(*)::int,
           count(*) filter (where s.status = 'confirmed')::int,
           count(*) filter (where s.status = 'option')::int,
           count(*) filter (where s.status = 'requested')::int,
           count(*) filter (where s.status = 'cancelled')::int
      from public.services s
     where s.dossier_id = p_dossier_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Dépôt d'une pièce par le client : notification du responsable (REC51)
-- ---------------------------------------------------------------------
create or replace function public.portal_notify_upload(p_document_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.portal_client_id();
  v_doc public.documents;
  v_owner uuid;
  v_ref text;
  v_task uuid;
begin
  if auth.uid() is null or v_client is null then
    raise exception 'Accès réservé aux clients connectés' using errcode = '42501';
  end if;
  select * into v_doc from public.documents where id = p_document_id;
  if not found or v_doc.client_id is distinct from v_client or v_doc.uploaded_via <> 'portal' then
    raise exception 'Document introuvable' using errcode = '42501';
  end if;

  if v_doc.dossier_id is not null then
    select owner_id, reference into v_owner, v_ref from public.dossiers where id = v_doc.dossier_id;
  end if;
  if v_owner is null then
    select owner_id into v_owner from public.clients where id = v_client;
  end if;

  insert into public.document_access_log (document_id, user_id, action)
  values (v_doc.id, auth.uid(), 'upload');

  insert into public.tasks (title, description, dossier_id, assignee_id, dedupe_key, source, due_at, created_by)
  values (format('Pièce déposée par le client%s : %s', coalesce(' (' || v_ref || ')', ''), v_doc.title),
          format('Le client a déposé « %s » (%s, %s Ko) depuis l''espace client. Vérifier la pièce et la classer.',
                 v_doc.title, v_doc.mime_type, ceil(v_doc.size_bytes / 1024.0)),
          v_doc.dossier_id, v_owner, 'portal-upload:' || v_doc.id, 'portal:upload', now() + interval '1 day', auth.uid())
  on conflict (dedupe_key) do nothing
  returning id into v_task;
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------
-- Demande de modification / annulation : transmise au responsable,
-- jamais d'annulation automatique (FO06)
-- ---------------------------------------------------------------------
create or replace function public.portal_request_change(p_dossier_id uuid, p_kind text, p_message text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_dossier public.dossiers;
  v_interaction uuid;
  v_task uuid;
  v_recent int;
  v_label text;
begin
  v_dossier := public._portal_owned_dossier(p_dossier_id);
  if p_kind not in ('modification', 'cancellation') then
    raise exception 'Type de demande inconnu';
  end if;
  if length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'Merci de décrire votre demande (10 caractères minimum)';
  end if;
  if length(p_message) > 3000 then
    raise exception 'Message trop long (3 000 caractères maximum)';
  end if;
  select count(*) into v_recent from public.interactions
   where dossier_id = p_dossier_id and channel = 'site' and occurred_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'Trop de demandes récentes sur ce dossier, merci de nous contacter par téléphone';
  end if;

  v_label := case p_kind when 'modification' then 'Demande de modification' else 'Demande d''annulation' end;

  insert into public.interactions (client_id, dossier_id, channel, direction, summary, author_id)
  values (v_dossier.client_id, v_dossier.id, 'site', 'in',
          v_label || ' (espace client) : ' || trim(p_message), null)
  returning id into v_interaction;

  insert into public.tasks (title, description, dossier_id, assignee_id, dedupe_key, source, due_at, created_by)
  values (format('%s — %s', v_label, v_dossier.reference),
          'Demande reçue depuis l''espace client. Aucune réservation n''a été modifiée ni annulée automatiquement. Message : '
            || trim(p_message),
          v_dossier.id, v_dossier.owner_id, 'portal-change:' || v_interaction, 'portal:change_request',
          now() + case when p_kind = 'cancellation' then interval '4 hours' else interval '1 day' end, auth.uid())
  returning id into v_task;

  return jsonb_build_object('interaction_id', v_interaction, 'task_id', v_task);
end;
$$;

-- ---------------------------------------------------------------------
-- Paiement en ligne (FO07)
-- ---------------------------------------------------------------------

-- Paiement en ligne réellement disponible : paramètre activé ET connecteur actif
create or replace function public.portal_payment_options()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'enabled',
      coalesce((select (value ->> 'enabled')::boolean from public.app_settings where key = 'online_payment'), false)
      and coalesce((select enabled from public.integration_connectors where code = 'payment_mockpay'), false),
    'provider', (select value ->> 'provider' from public.app_settings where key = 'online_payment'),
    'manual_instructions', (select value ->> 'manual_instructions' from public.app_settings where key = 'online_payment'))
$$;

create or replace function public.portal_create_payment_intent(p_dossier_id uuid, p_schedule_item_id uuid, p_amount numeric)
returns public.payment_intents
language plpgsql security definer set search_path = public
as $$
declare
  v_dossier public.dossiers;
  v_balance numeric(14,3);
  v_amount numeric(14,3) := round(coalesce(p_amount, 0), 3);
  v_intent public.payment_intents;
  v_opts jsonb := public.portal_payment_options();
begin
  v_dossier := public._portal_owned_dossier(p_dossier_id);
  if not coalesce((v_opts ->> 'enabled')::boolean, false) then
    raise exception 'Le paiement en ligne n''est pas disponible actuellement';
  end if;
  if v_dossier.status in ('cancelled', 'archived', 'request', 'quote_prepared', 'quote_sent') then
    raise exception 'Ce dossier ne peut pas être réglé en ligne';
  end if;
  if p_schedule_item_id is not null
     and not exists (select 1 from public.payment_schedule_items where id = p_schedule_item_id and dossier_id = p_dossier_id) then
    raise exception 'Échéance inconnue pour ce dossier';
  end if;
  select balance into v_balance from public.portal_dossier_balances where dossier_id = p_dossier_id;
  if v_amount <= 0 then
    raise exception 'Le montant doit être supérieur à zéro';
  end if;
  if v_amount > coalesce(v_balance, 0) then
    raise exception 'Le montant dépasse le solde restant dû (% %)', replace(to_char(coalesce(v_balance, 0), 'FM999999990.000'), '.', ','), v_dossier.currency;
  end if;

  insert into public.payment_intents (dossier_id, schedule_item_id, client_id, amount, currency, provider, status, created_by)
  values (v_dossier.id, p_schedule_item_id, v_dossier.client_id, v_amount, v_dossier.currency,
          coalesce(v_opts ->> 'provider', 'mockpay'), 'created', auth.uid())
  returning * into v_intent;
  return v_intent;
end;
$$;

create or replace function public.portal_attach_payment_session(p_intent_id uuid, p_session_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := public.portal_client_id();
  v_intent public.payment_intents;
begin
  if auth.uid() is null or v_client is null then
    raise exception 'Accès réservé aux clients connectés' using errcode = '42501';
  end if;
  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if not found or v_intent.client_id <> v_client then
    raise exception 'Paiement introuvable' using errcode = '42501';
  end if;
  if v_intent.status <> 'created' or v_intent.provider_session_id is not null then
    raise exception 'Session de paiement déjà créée';
  end if;
  if p_session_id is null or length(p_session_id) < 8 then
    raise exception 'Session de paiement invalide';
  end if;
  update public.payment_intents
     set provider_session_id = p_session_id, status = 'pending', updated_at = now()
   where id = p_intent_id;
end;
$$;

-- Droits : clients connectés uniquement
revoke execute on function public.portal_dossier_service_summary(uuid) from public, anon;
revoke execute on function public.portal_notify_upload(uuid) from public, anon;
revoke execute on function public.portal_request_change(uuid, text, text) from public, anon;
revoke execute on function public.portal_payment_options() from public, anon;
revoke execute on function public.portal_create_payment_intent(uuid, uuid, numeric) from public, anon;
revoke execute on function public.portal_attach_payment_session(uuid, text) from public, anon;
grant execute on function public.portal_dossier_service_summary(uuid) to authenticated;
grant execute on function public.portal_notify_upload(uuid) to authenticated;
grant execute on function public.portal_request_change(uuid, text, text) to authenticated;
grant execute on function public.portal_payment_options() to authenticated;
grant execute on function public.portal_create_payment_intent(uuid, uuid, numeric) to authenticated;
grant execute on function public.portal_attach_payment_session(uuid, text) to authenticated;
