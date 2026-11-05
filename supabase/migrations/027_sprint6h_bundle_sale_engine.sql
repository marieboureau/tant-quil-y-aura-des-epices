-- Prix par lots dans le moteur d'encaissement (également utilisé lors des ventes hors ligne synchronisées).
-- Un tarif par lot ne touche pas aux autres lignes et ne modifie pas discount_percent.
CREATE OR REPLACE FUNCTION public.complete_sale_v2(p_customer_id uuid, p_lines jsonb, p_payments jsonb, p_discount_percent numeric DEFAULT 0, p_commercial_gift_amount numeric DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_sale uuid;
  v_line jsonb;
  v_payment jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_unit_override numeric;
  v_line_note text;
  v_q_low numeric;
  v_p_low numeric;
  v_q_high numeric;
  v_p_high numeric;
  v_line_gross_ht numeric;
  v_line_gross_ttc numeric;
  v_line_discount_ht numeric;
  v_line_discount_ttc numeric;
  v_line_after_discount_ht numeric;
  v_line_after_discount_ttc numeric;
  v_line_gift_ht numeric;
  v_line_gift_ttc numeric;
  v_line_net_ht numeric;
  v_line_net_ttc numeric;
  v_total_gross_ht numeric := 0;
  v_total_gross_ttc numeric := 0;
  v_total_discount_ht numeric := 0;
  v_total_discount_ttc numeric := 0;
  v_total_after_discount_ht numeric := 0;
  v_total_after_discount_ttc numeric := 0;
  v_total_gift_ht numeric := 0;
  v_total_gift_ttc numeric := 0;
  v_total_net_ht numeric := 0;
  v_total_net_ttc numeric := 0;
  v_payment_total numeric := 0;
  v_discount numeric;
  v_gift numeric;
  v_ratio numeric;
  v_line_count integer;
  v_idx integer := 0;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id=p_customer_id and organization_id=v_org and active=true
  ) then raise exception 'Client invalide'; end if;

  v_discount := greatest(0, least(100, coalesce(p_discount_percent,0)));
  v_gift := greatest(0, coalesce(p_commercial_gift_amount,0));

  insert into public.sales(
    organization_id, customer_id, status, note, created_by, discount_percent
  )
  values(v_org,p_customer_id,'draft',p_note,auth.uid(),v_discount)
  returning id into v_sale;

  -- Premier passage : calcul des prix bruts et stockage temporaire en lignes.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_product
    from public.products
    where id=(v_line->>'product_id')::uuid
      and organization_id=v_org
      and active=true
    for update;

    if not found then raise exception 'Produit invalide'; end if;

    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantité invalide'; end if;
    if v_product.stock_tracked and v_product.stock_quantity < v_qty then
      raise exception 'Stock insuffisant pour %', v_product.name;
    end if;

    v_unit_override := nullif(v_line->>'unit_price_ht','')::numeric;
    v_line_note := nullif(v_line->>'line_note','');

    if v_product.pricing_mode='free_unit' then
      if v_unit_override is null or v_unit_override < 0 then
        raise exception 'Prix libre manquant pour %', v_product.name;
      end if;
      v_line_gross_ht := round((v_unit_override * v_qty)::numeric,2);

    elsif v_product.pricing_mode='fixed_unit' then
      v_line_gross_ht := public.unit_bundle_price_ht(
        v_org, v_product.id, v_qty,
        v_product.sale_price_ht / nullif(v_product.sale_price_basis,0)
      );

    else
      -- Prix par palier ; interpolation linéaire entre deux paliers.
      select quantity,price_ht into v_q_low,v_p_low
      from public.product_price_tiers
      where organization_id=v_org and product_id=v_product.id and active=true
        and quantity <= v_qty
      order by quantity desc limit 1;

      select quantity,price_ht into v_q_high,v_p_high
      from public.product_price_tiers
      where organization_id=v_org and product_id=v_product.id and active=true
        and quantity >= v_qty
      order by quantity asc limit 1;

      if v_q_low is null and v_q_high is null then
        v_line_gross_ht := round((
          v_product.sale_price_ht * v_qty / nullif(v_product.sale_price_basis,0)
        )::numeric,2);
      elsif v_q_low is null then
        v_line_gross_ht := round((v_p_high * v_qty / v_q_high)::numeric,2);
      elsif v_q_high is null then
        v_line_gross_ht := round((v_p_low * v_qty / v_q_low)::numeric,2);
      elsif v_q_low=v_q_high then
        v_line_gross_ht := round(v_p_low::numeric,2);
      else
        v_line_gross_ht := round((
          v_p_low + ((v_qty-v_q_low)/(v_q_high-v_q_low))*(v_p_high-v_p_low)
        )::numeric,2);
      end if;
    end if;

    v_line_gross_ttc := round((
      v_line_gross_ht * (1 + v_product.vat_rate_sale/100)
    )::numeric,2);

    insert into public.sale_lines(
      organization_id,sale_id,product_id,quantity,unit,unit_price_ht,vat_rate,
      gross_line_total_ht,gross_line_total_ttc,line_total_ht,line_total_ttc,
      line_cost_ht,line_note,pricing_source
    ) values (
      v_org,v_sale,v_product.id,v_qty,v_product.stock_unit,
      case when v_product.pricing_mode='free_unit' then v_unit_override else v_product.sale_price_ht end,
      v_product.vat_rate_sale,
      v_line_gross_ht,v_line_gross_ttc,v_line_gross_ht,v_line_gross_ttc,
      round((v_product.purchase_price_ht * v_qty / nullif(v_product.purchase_price_basis,0))::numeric,2),
      v_line_note,v_product.pricing_mode
    );

    v_total_gross_ht := v_total_gross_ht + v_line_gross_ht;
    v_total_gross_ttc := v_total_gross_ttc + v_line_gross_ttc;
  end loop;

  v_total_discount_ht := round((v_total_gross_ht * v_discount/100)::numeric,2);
  v_total_discount_ttc := round((v_total_gross_ttc * v_discount/100)::numeric,2);
  v_total_after_discount_ht := greatest(0,v_total_gross_ht-v_total_discount_ht);
  v_total_after_discount_ttc := greatest(0,v_total_gross_ttc-v_total_discount_ttc);

  if v_gift > v_total_after_discount_ttc + 0.01 then
    raise exception 'Montant offert supérieur au total après remise';
  end if;
  v_total_gift_ttc := least(v_gift,v_total_after_discount_ttc);
  v_total_gift_ht := case
    when v_total_after_discount_ttc=0 then 0
    else round((v_total_after_discount_ht * v_total_gift_ttc / v_total_after_discount_ttc)::numeric,2)
  end;

  v_total_net_ht := greatest(0,v_total_after_discount_ht-v_total_gift_ht);
  v_total_net_ttc := greatest(0,v_total_after_discount_ttc-v_total_gift_ttc);

  -- Répartition proportionnelle remise + offert sur les lignes.
  select count(*) into v_line_count from public.sale_lines where sale_id=v_sale;
  for v_line in
    select jsonb_build_object(
      'id',sl.id,'gross_ht',sl.gross_line_total_ht,'gross_ttc',sl.gross_line_total_ttc
    )
    from public.sale_lines sl where sl.sale_id=v_sale order by sl.id
  loop
    v_idx := v_idx + 1;
    v_ratio := case when v_total_gross_ttc=0 then 0
      else (v_line->>'gross_ttc')::numeric / v_total_gross_ttc end;

    if v_idx=v_line_count then
      -- Dernière ligne : absorbe les centimes de répartition.
      select
        v_total_discount_ht-coalesce(sum(discount_amount_ht),0),
        v_total_discount_ttc-coalesce(sum(discount_amount_ttc),0),
        v_total_gift_ht-coalesce(sum(commercial_gift_amount_ht),0),
        v_total_gift_ttc-coalesce(sum(commercial_gift_amount_ttc),0)
      into v_line_discount_ht,v_line_discount_ttc,v_line_gift_ht,v_line_gift_ttc
      from public.sale_lines
      where sale_id=v_sale and id<>(v_line->>'id')::uuid;
    else
      v_line_discount_ht := round((v_total_discount_ht*v_ratio)::numeric,2);
      v_line_discount_ttc := round((v_total_discount_ttc*v_ratio)::numeric,2);
      v_line_gift_ht := round((v_total_gift_ht*v_ratio)::numeric,2);
      v_line_gift_ttc := round((v_total_gift_ttc*v_ratio)::numeric,2);
    end if;

    v_line_after_discount_ht := (v_line->>'gross_ht')::numeric-v_line_discount_ht;
    v_line_after_discount_ttc := (v_line->>'gross_ttc')::numeric-v_line_discount_ttc;
    v_line_net_ht := greatest(0,v_line_after_discount_ht-v_line_gift_ht);
    v_line_net_ttc := greatest(0,v_line_after_discount_ttc-v_line_gift_ttc);

    update public.sale_lines
    set discount_amount_ht=v_line_discount_ht,
        discount_amount_ttc=v_line_discount_ttc,
        commercial_gift_amount_ht=v_line_gift_ht,
        commercial_gift_amount_ttc=v_line_gift_ttc,
        line_total_ht=round(v_line_net_ht,2),
        line_total_ttc=round(v_line_net_ttc,2)
    where id=(v_line->>'id')::uuid;
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb))
  loop
    if (v_payment->>'amount')::numeric < 0 then raise exception 'Paiement invalide'; end if;
    insert into public.payments(organization_id,sale_id,payment_method,amount)
    values(v_org,v_sale,v_payment->>'method',(v_payment->>'amount')::numeric);
    v_payment_total := v_payment_total + (v_payment->>'amount')::numeric;
  end loop;

  if abs(v_payment_total-v_total_net_ttc) > 0.01 then
    raise exception 'Total paiements (%) différent du montant à régler (%)',
      v_payment_total,v_total_net_ttc;
  end if;

  -- Stock + mouvements une seule fois, après validation financière.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_product
    from public.products
    where id=(v_line->>'product_id')::uuid and organization_id=v_org
    for update;
    v_qty := (v_line->>'quantity')::numeric;

    if v_product.stock_tracked then
    update public.products
    set stock_quantity=stock_quantity-v_qty,updated_at=now()
    where id=v_product.id;

    insert into public.stock_movements(
      organization_id,product_id,movement_type,quantity_delta,stock_unit,
      reference_sale_id,customer_id,created_by,note
    ) values(
      v_org,v_product.id,
      'sale',
      -v_qty,v_product.stock_unit,v_sale,p_customer_id,auth.uid(),
      case when v_total_gift_ttc>0 then 'Vente avec montant offert' else null end
    );
    end if;
  end loop;

  update public.sales
  set gross_total_ht=v_total_gross_ht,
      gross_total_ttc=v_total_gross_ttc,
      discount_amount_ht=v_total_discount_ht,
      discount_amount_ttc=v_total_discount_ttc,
      commercial_gift_amount_ht=v_total_gift_ht,
      commercial_gift_amount_ttc=v_total_gift_ttc,
      total_ht=round(v_total_net_ht,2),
      total_ttc=round(v_total_net_ttc,2),
      status='completed'
  where id=v_sale;

  if p_customer_id is not null then
    insert into public.loyalty_events(
      organization_id,customer_id,event_type,points_delta,sale_id,note
    ) values(v_org,p_customer_id,'visit',1,v_sale,'Passage lié à une vente');
  end if;

  return v_sale;
exception when others then
  raise;
end;
$function$;