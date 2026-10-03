-- =====================================================================
-- Back office finances / connexions / site / paramètres — compléments additifs
-- (aucune règle comptable ni métier n'est déplacée côté application)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paramètres : modification avec justification enregistrée dans le journal d'audit
-- (la justification et la mise à jour partagent la même transaction).
-- SECURITY INVOKER : la RLS d'app_settings s'applique (settings.update, ou site.update pour « agency »).
-- ---------------------------------------------------------------------
create or replace function public.set_app_setting(p_key text, p_value jsonb, p_reason text default null)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if p_reason is not null then
    perform set_config('app.change_reason', p_reason, true);
  end if;
  update public.app_settings set value = p_value where key = p_key;
  if not found then
    raise exception 'Paramètre % introuvable ou modification non autorisée', p_key using errcode = '42501';
  end if;
end;
$$;

-- Le profil « gestion du site » administre les coordonnées publiques de l'agence (section 7)
drop policy if exists app_settings_site_agency on public.app_settings;
create policy app_settings_site_agency on public.app_settings
  for update to authenticated
  using (key = 'agency' and public.has_perm('site', 'update'))
  with check (key = 'agency' and public.has_perm('site', 'update'));

-- Matrice des droits : ajout / retrait d'un droit avec justification auditée
create or replace function public.set_role_permission(
  p_role public.app_role, p_module text, p_action public.perm_action, p_granted boolean, p_reason text default null)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  perform public.require_perm('settings', 'update');
  if p_role = 'direction' and p_module = 'settings' and not p_granted then
    raise exception 'La direction conserve l''accès aux paramètres (garde-fou contre le verrouillage)';
  end if;
  if p_reason is not null then
    perform set_config('app.change_reason', p_reason, true);
  end if;
  if p_granted then
    insert into public.role_permissions (role, module, action) values (p_role, p_module, p_action)
    on conflict do nothing;
  else
    delete from public.role_permissions where role = p_role and module = p_module and action = p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Réservation hôtel via API : un délai dépassé crée une alerte « à vérifier » (API03, REC25)
-- ---------------------------------------------------------------------
create or replace function public.flag_hotel_booking_to_verify(p_booking_request_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_req public.hotel_booking_requests;
  v_alert uuid;
begin
  perform public.require_perm('dossiers', 'update');
  select * into v_req from public.hotel_booking_requests where id = p_booking_request_id;
  if not found then raise exception 'Demande de réservation introuvable'; end if;
  insert into public.alerts (kind, severity, title, dossier_id, service_id, details, dedupe_key)
  values ('hotel_booking_to_verify', 'red',
          'Réservation hôtel à vérifier : aucune nouvelle tentative sans contrôle du statut',
          v_req.dossier_id, v_req.service_id,
          jsonb_build_object('request_id', v_req.request_id, 'connector', v_req.connector_code, 'reason', p_reason),
          'hotel-booking:' || v_req.request_id)
  on conflict (dedupe_key) do update set status = 'to_review', details = excluded.details
  returning id into v_alert;
  return v_alert;
end;
$$;
revoke execute on function public.flag_hotel_booking_to_verify(uuid, text) from public, anon;
grant execute on function public.flag_hotel_booking_to_verify(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Piste d'audit complémentaire sur les référentiels administrés depuis Paramètres
-- ---------------------------------------------------------------------
drop trigger if exists staff_profiles_audit on public.staff_profiles;
create trigger staff_profiles_audit after insert or update on public.staff_profiles
  for each row execute function public.tg_audit();
drop trigger if exists number_series_audit on public.number_series;
create trigger number_series_audit after insert or update or delete on public.number_series
  for each row execute function public.tg_audit();
drop trigger if exists lead_rules_audit on public.lead_assignment_rules;
create trigger lead_rules_audit after insert or update or delete on public.lead_assignment_rules
  for each row execute function public.tg_audit();
drop trigger if exists hotel_mappings_audit on public.hotel_mappings;
create trigger hotel_mappings_audit after insert or update or delete on public.hotel_mappings
  for each row execute function public.tg_audit();
drop trigger if exists hotel_booking_requests_audit on public.hotel_booking_requests;
create trigger hotel_booking_requests_audit after insert or update on public.hotel_booking_requests
  for each row execute function public.tg_audit();
drop trigger if exists treasury_accounts_audit on public.treasury_accounts;
create trigger treasury_accounts_audit after insert or update on public.treasury_accounts
  for each row execute function public.tg_audit();
drop trigger if exists site_pages_audit on public.site_pages;
create trigger site_pages_audit after insert or update or delete on public.site_pages
  for each row execute function public.tg_audit();
drop trigger if exists accounts_audit on public.accounts;
create trigger accounts_audit after insert or update on public.accounts
  for each row execute function public.tg_audit();

grant execute on function public.set_app_setting(text, jsonb, text) to authenticated;
grant execute on function public.set_role_permission(public.app_role, text, public.perm_action, boolean, text) to authenticated;
revoke execute on function public.set_app_setting(text, jsonb, text) from anon;
revoke execute on function public.set_role_permission(public.app_role, text, public.perm_action, boolean, text) from anon;
