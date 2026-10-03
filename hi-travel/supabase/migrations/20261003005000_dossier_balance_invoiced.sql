-- =====================================================================
-- Solde et chiffre d'affaires d'un dossier fondés sur la facturation
-- Avant : vente = prix du devis − avoirs. Une facture comprend aussi le droit de timbre
-- (et toute révision facturée), et un dossier annulé ne doit plus que ce qui est facturé.
-- Conséquences corrigées : solde de −1 DT sur un dossier soldé (timbre), solde fantôme
-- sur un dossier annulé, clôture financière impossible dans ces deux cas.
-- Marge « définitive » uniquement pour un voyage terminé dont tous les coûts réels sont constatés.
-- Règle : base de vente = facturé si dossier annulé, sinon max(prix convenu, facturé) ;
--         vente nette = base − avoirs ; solde = vente nette − encaissé net validé.
-- =====================================================================

create or replace view public.dossier_financials
with (security_invoker = true)
as
with credits as (
  select dossier_id, sum(total_ttc) as total from public.invoices
   where kind = 'credit_note' and status = 'validated' group by dossier_id
), invoiced as (
  select dossier_id, sum(total_ttc) as total from public.invoices
   where kind = 'invoice' and status = 'validated' group by dossier_id
), svc as (
  select dossier_id,
         sum(round(cost_planned * fx_rate, 3)) filter (where status <> 'cancelled') as cost_planned,
         sum(round(coalesce(cost_confirmed, cost_planned) * fx_rate, 3)) filter (where status <> 'cancelled') as cost_confirmed,
         bool_or(status <> 'cancelled' and coalesce(cost_confirmed, cost_planned) = 0) as has_missing_cost,
         count(*) filter (where status <> 'cancelled') as active_services
    from public.services group by dossier_id
), actual as (
  select coalesce(ca.dossier_id, s.dossier_id) as dossier_id, sum(ca.amount_tnd) as total
    from public.cost_allocations ca left join public.services s on s.id = ca.service_id
   where ca.status = 'validated' group by 1
), sched as (
  select dossier_id, sum(amount) as total,
         sum(amount) filter (where due_date <= current_date) as due_to_date
    from public.payment_schedule_items group by dossier_id
)
select d.id as dossier_id, d.reference, d.client_id, d.status, d.activity, d.start_date, d.owner_id,
       d.total_price as sale_planned,
       coalesce(c.total, 0) as credit_notes,
       b.sale_base - coalesce(c.total, 0) as sale_net,
       coalesce(inv.total, 0) as invoiced,
       coalesce(inv.total, 0) - coalesce(c.total, 0) as invoiced_net,
       public.dossier_paid_amount(d.id) as paid,
       b.sale_base - coalesce(c.total, 0) - public.dossier_paid_amount(d.id) as balance,
       coalesce(sch.total, 0) as scheduled,
       greatest(coalesce(sch.due_to_date, 0) - public.dossier_paid_amount(d.id), 0) as overdue,
       -- Coûts et marges masqués sans le droit « margins » (REC20)
       case when public.can_see_margins() then coalesce(svc.cost_planned, 0) end as cost_planned,
       case when public.can_see_margins() then coalesce(svc.cost_confirmed, 0) end as cost_confirmed,
       case when public.can_see_margins() then coalesce(act.total, 0) end as cost_actual,
       case when public.can_see_margins() then b.sale_base - coalesce(c.total, 0) - coalesce(svc.cost_planned, 0) end as margin_forecast,
       case when public.can_see_margins() then b.sale_base - coalesce(c.total, 0) - coalesce(svc.cost_confirmed, 0) end as margin_confirmed,
       case when public.can_see_margins() then b.sale_base - coalesce(c.total, 0) - coalesce(act.total, 0) end as margin_actual,
       -- Marge définitive : voyage terminé, aucun coût manquant et coûts réels constatés
       case when d.status in ('completed', 'archived') and not coalesce(svc.has_missing_cost, false) and coalesce(act.total, 0) > 0
            then 'final' else 'provisional' end as margin_state,
       coalesce(svc.has_missing_cost, false) as costs_incomplete
from public.dossiers d
left join credits c on c.dossier_id = d.id
left join invoiced inv on inv.dossier_id = d.id
left join svc on svc.dossier_id = d.id
left join actual act on act.dossier_id = d.id
left join sched sch on sch.dossier_id = d.id
cross join lateral (
  select case when d.status = 'cancelled' then coalesce(inv.total, 0)
              else greatest(d.total_price, coalesce(inv.total, 0)) end as sale_base
) b;

-- Vue client : même règle de solde
create or replace view public.portal_dossier_balances
with (security_barrier = true)
as
select d.id as dossier_id, d.reference, d.total_price,
       coalesce(cr.total, 0) as credit_notes,
       public.dossier_paid_amount(d.id) as paid,
       case when d.status = 'cancelled' then coalesce(inv.total, 0) else greatest(d.total_price, coalesce(inv.total, 0)) end
         - coalesce(cr.total, 0) - public.dossier_paid_amount(d.id) as balance
from public.dossiers d
left join lateral (select sum(total_ttc) as total from public.invoices i
                    where i.dossier_id = d.id and i.kind = 'credit_note' and i.status = 'validated') cr on true
left join lateral (select sum(total_ttc) as total from public.invoices i
                    where i.dossier_id = d.id and i.kind = 'invoice' and i.status = 'validated') inv on true
where public.has_perm('dossiers', 'read') or d.client_id = public.portal_client_id();
