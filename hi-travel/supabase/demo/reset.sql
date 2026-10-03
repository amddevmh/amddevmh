-- =====================================================================
-- Remise à zéro d'un environnement de RECETTE avant rechargement des données de démonstration.
-- Efface toutes les données métier et TOUS les comptes (auth.users) ; conserve les données de
-- référence (droits, séries, plan comptable, journaux, règles, connecteurs, modèles d'import, pages).
-- Ne jamais exécuter en production : utiliser scripts/demo-data.mjs, qui protège la production.
-- Les fichiers du bucket « documents » sont supprimés par le script (API Storage).
-- =====================================================================

do $$
declare
  keep text[] := array[
    'role_permissions', 'number_series', 'accounts', 'journals', 'posting_rules', 'tax_rules',
    'fiscal_periods', 'treasury_accounts', 'app_settings', 'integration_connectors', 'import_templates',
    'site_pages'];
  tables text;
begin
  select string_agg(format('public.%I', tablename), ', ') into tables
    from pg_tables
   where schemaname = 'public' and not (tablename = any (keep));
  execute 'truncate table ' || tables || ' restart identity cascade';

  -- Comptes : collaborateurs et clients (après les données métier qui les référencent)
  delete from auth.users;

  -- Données de référence remises dans leur état initial
  delete from public.fiscal_periods where label like '%(démo)';
  update public.fiscal_periods set status = 'open', closed_at = null, closed_by = null;
  update public.integration_connectors set config = config - 'simulate', enabled = code <> 'messaging';
  update public.app_settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'online_payment';
end $$;
