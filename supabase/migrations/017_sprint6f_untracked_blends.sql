-- Sprint 6F : produits sans stock suivi. Pas de retrait des matières premières des mélanges maison.
alter table public.products add column if not exists stock_tracked boolean not null default true;

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
      v_line_gross_ht := round((
        v_product.sale_price_ht * v_qty / nullif(v_product.sale_price_basis,0)
      )::numeric,2);

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


CREATE OR REPLACE FUNCTION public.cancel_sale(p_sale_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_sale public.sales%rowtype;
  v_line record;
  v_has_visit boolean := false;
begin
  v_org := public.current_organization_id();
  if v_org is null then
    raise exception 'Utilisateur sans organisation';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and organization_id = v_org
  for update;

  if not found then
    raise exception 'Vente introuvable';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'Cette vente est déjà annulée';
  end if;

  if v_sale.status <> 'completed' then
    raise exception 'Seule une vente validée peut être annulée';
  end if;

  -- Restitution du stock pour chaque ligne de vente.
  for v_line in
    select sl.product_id, sl.quantity, sl.unit
    from public.sale_lines sl
    where sl.sale_id = p_sale_id
      and sl.organization_id = v_org
  loop
    -- Ne réintégrer le stock que s'il avait réellement été sorti à la vente.
    if exists (
      select 1 from public.stock_movements
      where organization_id=v_org and reference_sale_id=p_sale_id
        and product_id=v_line.product_id and movement_type='sale'
    ) then
    update public.products
    set stock_quantity = stock_quantity + v_line.quantity,
        updated_at = now()
    where id = v_line.product_id
      and organization_id = v_org;

    insert into public.stock_movements(
      organization_id,
      product_id,
      movement_type,
      quantity_delta,
      stock_unit,
      reference_sale_id,
      customer_id,
      note,
      created_by
    )
    values(
      v_org,
      v_line.product_id,
      'sale_cancel',
      v_line.quantity,
      v_line.unit,
      p_sale_id,
      v_sale.customer_id,
      coalesce('Annulation vente ' || v_sale.sale_number ||
               case when p_reason is not null and btrim(p_reason) <> ''
                    then ' — ' || p_reason else '' end,
               'Annulation de vente'),
      auth.uid()
    );
    end if;
  end loop;

  -- Retrait du passage fidélité créé par cette vente.
  select exists(
    select 1
    from public.loyalty_events
    where organization_id = v_org
      and customer_id = v_sale.customer_id
      and sale_id = p_sale_id
      and event_type = 'visit'
  ) into v_has_visit;

  if v_sale.customer_id is not null and v_has_visit then
    insert into public.loyalty_events(
      organization_id,
      customer_id,
      event_type,
      points_delta,
      sale_id,
      note
    )
    values(
      v_org,
      v_sale.customer_id,
      'manual_adjustment',
      -1,
      p_sale_id,
      'Annulation du passage lié à la vente ' || v_sale.sale_number
    );
  end if;

  update public.payments
  set status = 'cancelled'
  where sale_id = p_sale_id
    and organization_id = v_org;

  update public.sales
  set status = 'cancelled',
      note = trim(
        both ' ' from
        coalesce(note || ' | ', '') ||
        'ANNULÉE' ||
        case when p_reason is not null and btrim(p_reason) <> ''
             then ' — ' || p_reason else '' end
      )
  where id = p_sale_id
    and organization_id = v_org;
end;
$function$;


CREATE OR REPLACE FUNCTION public.use_loyalty_reward(p_customer_id uuid, p_product_id uuid, p_quantity numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_quantity <= 0 or (v_product.stock_tracked and v_product.stock_quantity < p_quantity) then raise exception 'Stock insuffisant'; end if;

  if v_product.stock_tracked then
  update public.products set stock_quantity=stock_quantity-p_quantity, updated_at=now() where id=v_product.id;
  insert into public.stock_movements(organization_id,product_id,movement_type,quantity_delta,stock_unit,customer_id,created_by,note)
  values(v_org,v_product.id,'loyalty_gift',-p_quantity,v_product.stock_unit,p_customer_id,auth.uid(),'Cadeau fidélité');

  end if;

  insert into public.loyalty_events(organization_id,customer_id,event_type,points_delta,product_id,quantity,note)
  values(v_org,p_customer_id,'reward_used',0,p_product_id,p_quantity,'Cadeau fidélité') returning id into v_event;
  return v_event;
end;
$function$;


CREATE OR REPLACE FUNCTION public.import_products_catalog_v4(p_rows jsonb, p_full_catalog boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_item jsonb;
  v_product uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_deactivated integer := 0;
  v_stock_pending boolean;
  v_stock numeric;
  v_stock_unit text;
  v_pricing_mode text;
  v_fallback_qty numeric;
  v_fallback_price numeric;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    v_pricing_mode := coalesce(nullif(v_item->>'pricing_mode',''),'tiered_weight');
    v_stock_unit := case when v_pricing_mode='tiered_weight' then 'g' else 'unit' end;
    v_stock_pending := coalesce((v_item->>'stock_pending')::boolean,false);
    v_stock := nullif(v_item->>'stock_quantity','')::numeric;

    if v_stock is null then
      v_stock := case when v_stock_pending
        then case when v_stock_unit='g' then 100000 else 1000 end
        else 0
      end;
    end if;

    v_fallback_qty := null;
    v_fallback_price := null;

    if v_pricing_mode='tiered_weight' then
      select quantity,price_ht
      into v_fallback_qty,v_fallback_price
      from jsonb_to_recordset(coalesce(v_item->'tiers','[]'::jsonb))
        as t(quantity numeric,price_ht numeric)
      order by case when quantity=100 then 0 else 1 end, quantity
      limit 1;
    else
      v_fallback_qty := 1;
      v_fallback_price := coalesce(nullif(v_item->>'sale_price_ht','')::numeric,0);
    end if;

    select id into v_product
    from public.products
    where organization_id=v_org
      and sku=upper(trim(v_item->>'sku'))
    limit 1;

    if v_product is null then
      select id into v_product
      from public.products
      where organization_id=v_org
        and lower(trim(name))=lower(trim(v_item->>'name'))
      limit 1;
    end if;

    if v_product is null then
      insert into public.products(
        organization_id,sku,name,category_id,subfamily,pricing_mode,active,
        stock_unit,purchase_unit,purchase_unit_quantity,purchase_unit_stock_equivalent,
        stock_quantity,stock_alert_threshold,stock_pending,
        purchase_price_ht,purchase_price_basis,
        sale_price_ht,sale_price_basis,vat_rate_purchase,vat_rate_sale,
        loyalty_eligible,loyalty_reward_quantity,
        preferred_supplier,supplier_reference,top20_hint,stock_tracked
      ) values(
        v_org,upper(trim(v_item->>'sku')),trim(v_item->>'name'),
        nullif(v_item->>'category_id','')::uuid,
        nullif(v_item->>'subfamily',''),
        v_pricing_mode,
        coalesce((v_item->>'active')::boolean,true),
        v_stock_unit,
        case when v_stock_unit='g' then 'sachet' else 'unité' end,
        case when v_stock_unit='g' then 500 else 1 end,
        case when v_stock_unit='g' then 500 else 1 end,
        v_stock,
        coalesce(nullif(v_item->>'stock_alert_threshold','')::numeric,0),
        v_stock_pending,
        coalesce(nullif(v_item->>'purchase_price_ht','')::numeric,0),
        coalesce(nullif(v_item->>'purchase_price_basis','')::numeric,case when v_stock_unit='g' then 100 else 1 end),
        coalesce(v_fallback_price,0),
        coalesce(v_fallback_qty,case when v_stock_unit='g' then 100 else 1 end),
        coalesce(nullif(v_item->>'vat_rate_purchase','')::numeric,0),
        coalesce(nullif(v_item->>'vat_rate_sale','')::numeric,0),
        coalesce((v_item->>'loyalty_eligible')::boolean,false),
        coalesce(nullif(v_item->>'loyalty_reward_quantity','')::numeric,case when v_stock_unit='g' then 100 else 1 end),
        nullif(v_item->>'preferred_supplier',''),
        nullif(v_item->>'supplier_reference',''),
        coalesce((v_item->>'top20_hint')::boolean,false),
        coalesce((v_item->>'stock_tracked')::boolean,true)
      )
      returning id into v_product;
      v_created := v_created + 1;
    else
      update public.products
      set sku=upper(trim(v_item->>'sku')),
          name=trim(v_item->>'name'),
          category_id=nullif(v_item->>'category_id','')::uuid,
          subfamily=nullif(v_item->>'subfamily',''),
          pricing_mode=v_pricing_mode,
          active=coalesce((v_item->>'active')::boolean,true),
          stock_unit=v_stock_unit,
          purchase_unit=case when v_stock_unit='g' then 'sachet' else 'unité' end,
          purchase_unit_quantity=case when v_stock_unit='g' then 500 else 1 end,
          purchase_unit_stock_equivalent=case when v_stock_unit='g' then 500 else 1 end,
          stock_quantity=v_stock,
          stock_alert_threshold=coalesce(nullif(v_item->>'stock_alert_threshold','')::numeric,0),
          stock_pending=v_stock_pending,
          purchase_price_ht=coalesce(nullif(v_item->>'purchase_price_ht','')::numeric,0),
          purchase_price_basis=coalesce(nullif(v_item->>'purchase_price_basis','')::numeric,case when v_stock_unit='g' then 100 else 1 end),
          sale_price_ht=coalesce(v_fallback_price,0),
          sale_price_basis=coalesce(v_fallback_qty,case when v_stock_unit='g' then 100 else 1 end),
          vat_rate_purchase=coalesce(nullif(v_item->>'vat_rate_purchase','')::numeric,0),
          vat_rate_sale=coalesce(nullif(v_item->>'vat_rate_sale','')::numeric,0),
          loyalty_eligible=coalesce((v_item->>'loyalty_eligible')::boolean,false),
          loyalty_reward_quantity=coalesce(nullif(v_item->>'loyalty_reward_quantity','')::numeric,case when v_stock_unit='g' then 100 else 1 end),
          preferred_supplier=nullif(v_item->>'preferred_supplier',''),
          supplier_reference=nullif(v_item->>'supplier_reference',''),
          top20_hint=coalesce((v_item->>'top20_hint')::boolean,false),
          stock_tracked=coalesce((v_item->>'stock_tracked')::boolean,stock_tracked),
          updated_at=now()
      where id=v_product;
      v_updated := v_updated + 1;
    end if;

    delete from public.product_price_tiers where product_id=v_product;

    insert into public.product_price_tiers(
      organization_id,product_id,quantity,price_ht,active
    )
    select v_org,v_product,t.quantity,t.price_ht,true
    from jsonb_to_recordset(coalesce(v_item->'tiers','[]'::jsonb))
      as t(quantity numeric,price_ht numeric)
    where t.quantity>0 and t.price_ht>0;
  end loop;

  if p_full_catalog then
    update public.products p
    set active=false,updated_at=now()
    where p.organization_id=v_org
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
        where upper(trim(x->>'sku'))=upper(trim(p.sku))
      );
    get diagnostics v_deactivated = row_count;
  end if;

  return jsonb_build_object(
    'created',v_created,'updated',v_updated,'deactivated',v_deactivated
  );
end;
$function$;

