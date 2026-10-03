-- =====================================================================
-- Ventes & opérations : une version de devis envoyée est figée (en-tête compris)
-- Les lignes sont déjà protégées par tg_quote_lines_frozen ; on protège ici le contenu
-- de la version (dates, voyageurs, prix, échéancier, inclusions…). Seuls les champs de
-- cycle de vie (statut, envoi, réponse) restent modifiables, par les fonctions métier.
-- =====================================================================

create or replace function public.tg_quote_versions_frozen()
returns trigger
language plpgsql
as $$
begin
  if old.status is distinct from 'draft' and (
       new.label is distinct from old.label
    or new.language is distinct from old.language
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.adults is distinct from old.adults
    or new.children is distinct from old.children
    or new.infants is distinct from old.infants
    or new.currency is distinct from old.currency
    or new.valid_until is distinct from old.valid_until
    or new.program is distinct from old.program
    or new.inclusions is distinct from old.inclusions
    or new.exclusions is distinct from old.exclusions
    or new.payment_terms is distinct from old.payment_terms
    or new.client_notes is distinct from old.client_notes
    or new.quote_id is distinct from old.quote_id
    or new.version_no is distinct from old.version_no
  ) then
    raise exception 'Version de devis figée (statut %) : créer une nouvelle version', old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_versions_frozen on public.quote_versions;
create trigger quote_versions_frozen before update on public.quote_versions
  for each row execute function public.tg_quote_versions_frozen();
