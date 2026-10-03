-- =====================================================================
-- Espace client : lecture des dossiers par une vue aux colonnes sûres.
-- Les clients n'ont plus d'accès direct aux lignes de `dossiers`
-- (notes internes, dérogations, notes de clôture restaient lisibles via l'API).
-- =====================================================================

-- Propriété d'un dossier par le client connecté (sans dépendre de la RLS de `dossiers`)
create or replace function public.portal_owns_dossier(p_dossier_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.dossiers d
     where d.id = p_dossier_id and d.client_id = public.portal_client_id())
$$;
grant execute on function public.portal_owns_dossier(uuid) to authenticated;

-- Dossiers : collaborateurs uniquement
drop policy if exists dossiers_select on public.dossiers;
create policy dossiers_select on public.dossiers for select to authenticated
  using (public.has_perm('dossiers', 'read'));

-- Vue client : colonnes publiables seulement, filtrée sur le client connecté
create view public.portal_dossiers
with (security_barrier = true)
as
select d.id, d.reference, d.title, d.activity, d.is_omra, d.destination, d.start_date, d.end_date,
       d.status, d.total_price, d.currency, d.adults, d.children, d.infants, d.departure_id, d.created_at,
       s.full_name as owner_name
from public.dossiers d
left join public.staff_profiles s on s.id = d.owner_id
where d.client_id = public.portal_client_id();
revoke all on public.portal_dossiers from anon;
grant select on public.portal_dossiers to authenticated;

-- Politiques qui vérifiaient la propriété via une sous-requête soumise à la RLS
drop policy if exists dossier_travellers_select on public.dossier_travellers;
create policy dossier_travellers_select on public.dossier_travellers for select to authenticated
  using (public.has_perm('dossiers', 'read') or public.portal_owns_dossier(dossier_id));

drop policy if exists schedule_select on public.payment_schedule_items;
create policy schedule_select on public.payment_schedule_items for select to authenticated
  using (public.has_perm('dossiers', 'read') or public.has_perm('finance', 'read') or public.portal_owns_dossier(dossier_id));

drop policy if exists documents_insert_portal on public.documents;
create policy documents_insert_portal on public.documents for insert to authenticated
  with check (not public.is_staff() and uploaded_via = 'portal' and client_id = public.portal_client_id()
              and (dossier_id is null or public.portal_owns_dossier(dossier_id)));

-- Solde client : la vue ne dépend plus de la RLS de `dossiers`
drop view if exists public.portal_dossier_balances;
create view public.portal_dossier_balances
with (security_barrier = true)
as
select d.id as dossier_id, d.reference, d.total_price,
       coalesce((select sum(total_ttc) from public.invoices i where i.dossier_id = d.id and i.kind = 'credit_note' and i.status = 'validated'), 0) as credit_notes,
       public.dossier_paid_amount(d.id) as paid,
       d.total_price
         - coalesce((select sum(total_ttc) from public.invoices i where i.dossier_id = d.id and i.kind = 'credit_note' and i.status = 'validated'), 0)
         - public.dossier_paid_amount(d.id) as balance
from public.dossiers d
where public.has_perm('dossiers', 'read') or d.client_id = public.portal_client_id();
revoke all on public.portal_dossier_balances from anon;
grant select on public.portal_dossier_balances to authenticated;

-- Règlements visibles par le client : sans clé d'idempotence ni notes internes
create view public.portal_payments
with (security_barrier = true)
as
select p.id, p.reference, p.method, p.amount, p.currency, p.received_at, p.status, pa.dossier_id, pa.amount as allocated
from public.payments p
join public.payment_allocations pa on pa.payment_id = p.id
left join public.invoices i on i.id = pa.invoice_id
where p.status = 'validated' and p.direction = 'in' and p.client_id = public.portal_client_id()
  and coalesce(pa.dossier_id, i.dossier_id) is not null;
revoke all on public.portal_payments from anon;
grant select on public.portal_payments to authenticated;

-- Le client ne lit plus directement les tables de règlements (passage par portal_payments)
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (public.has_perm('finance', 'read'));
drop policy if exists allocations_select on public.payment_allocations;
create policy allocations_select on public.payment_allocations for select to authenticated using (public.has_perm('finance', 'read'));
