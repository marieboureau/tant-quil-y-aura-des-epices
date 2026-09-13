-- Sprint 2 — Vente, paiements, stock et fidélité
-- À exécuter une seule fois dans Supabase SQL Editor.

create or replace function public.complete_sale(
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_sale uuid;
  v_line jsonb;
  v_payment jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_payment_total numeric := 0;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers where id=p_customer_id and organization_id=v_org and active=true
  ) then raise exception 'Client invalide'; end if;

  insert into public.sales(organization_id, customer_id, status, note, created_by)
  values (v_org, p_customer_id, 'draft', p_note, auth.uid())
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_product
    from public.products
    where id=(v_line->>'product_id')::uuid and organization_id=v_org and active=true
    for update;

    if not found then raise exception 'Produit invalide'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantité invalide'; end if;
    if v_product.stock_quantity < v_qty then raise exception 'Stock insuffisant pour %', v_product.name; end if;

    v_line_ht := round((v_product.sale_price_ht * v_qty / nullif(v_product.sale_price_basis,0))::numeric, 2);
    v_line_ttc := round((v_line_ht * (1 + v_product.vat_rate_sale/100))::numeric, 2);

    insert into public.sale_lines(
      organization_id,sale_id,product_id,quantity,unit,unit_price_ht,vat_rate,line_total_ht,line_total_ttc
    ) values (
      v_org,v_sale,v_product.id,v_qty,v_product.stock_unit,v_product.sale_price_ht,
      v_product.vat_rate_sale,v_line_ht,v_line_ttc
    );

    update public.products set stock_quantity=stock_quantity-v_qty, updated_at=now() where id=v_product.id;
    insert into public.stock_movements(
      organization_id,product_id,movement_type,quantity_delta,stock_unit,reference_sale_id,customer_id,created_by
    ) values (v_org,v_product.id,'sale',-v_qty,v_product.stock_unit,v_sale,p_customer_id,auth.uid());

    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    if (v_payment->>'amount')::numeric < 0 then raise exception 'Paiement invalide'; end if;
    insert into public.payments(organization_id,sale_id,payment_method,amount)
    values (v_org,v_sale,v_payment->>'method',(v_payment->>'amount')::numeric);
    v_payment_total := v_payment_total + (v_payment->>'amount')::numeric;
  end loop;

  if abs(v_payment_total-v_total_ttc) > 0.01 then
    raise exception 'Total paiements (%) différent du ticket (%)', v_payment_total, v_total_ttc;
  end if;

  update public.sales set total_ht=v_total_ht,total_ttc=v_total_ttc,status='completed' where id=v_sale;

  if p_customer_id is not null then
    insert into public.loyalty_events(organization_id,customer_id,event_type,points_delta,sale_id,note)
    values(v_org,p_customer_id,'visit',1,v_sale,'Passage lié à une vente');
  end if;

  return v_sale;
end;
$$;

grant execute on function public.complete_sale(uuid,jsonb,jsonb,text) to authenticated;

create or replace function public.use_loyalty_reward(
  p_customer_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_product public.products%rowtype;
  v_required int;
  v_points int;
  v_used int;
  v_available int;
  v_event uuid;
begin
  v_org := public.current_organization_id();
  select loyalty_visits_per_reward into v_required from public.settings where organization_id=v_org;
  select coalesce(sum(points_delta),0) into v_points from public.loyalty_events where organization_id=v_org and customer_id=p_customer_id;
  select count(*) into v_used from public.loyalty_events where organization_id=v_org and customer_id=p_customer_id and event_type='reward_used';
  v_available := floor(v_points::numeric / nullif(v_required,0))::int - v_used;
  if v_available < 1 then raise exception 'Aucun cadeau disponible'; end if;

  select * into v_product from public.products
  where id=p_product_id and organization_id=v_org and active=true and loyalty_eligible=true
  for update;
  if not found then raise exception 'Produit non éligible'; end if;
  if p_quantity <= 0 or v_product.stock_quantity < p_quantity then raise exception 'Stock insuffisant'; end if;

  update public.products set stock_quantity=stock_quantity-p_quantity, updated_at=now() where id=v_product.id;
  insert into public.stock_movements(organization_id,product_id,movement_type,quantity_delta,stock_unit,customer_id,created_by,note)
  values(v_org,v_product.id,'loyalty_gift',-p_quantity,v_product.stock_unit,p_customer_id,auth.uid(),'Cadeau fidélité');

  insert into public.loyalty_events(organization_id,customer_id,event_type,points_delta,product_id,quantity,note)
  values(v_org,p_customer_id,'reward_used',0,p_product_id,p_quantity,'Cadeau fidélité') returning id into v_event;
  return v_event;
end;
$$;

grant execute on function public.use_loyalty_reward(uuid,uuid,numeric) to authenticated;
