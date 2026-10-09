-- Sprint 6F: 2 approvisionnements possibles par produit (principal et alternatif).
-- Le fournisseur principal reste preferred_supplier; aucun prix n'est modifié automatiquement.
alter table public.products add column if not exists alternative_supplier text;
alter table public.products add column if not exists alternative_supplier_reference text;
alter table public.products add column if not exists alternative_purchase_price_ht numeric(12,4);
alter table public.products add constraint products_alternative_purchase_price_positive
 check (alternative_purchase_price_ht is null or alternative_purchase_price_ht >= 0);

comment on column public.products.alternative_purchase_price_ht is
 'Prix d achat HT secondaire, sur la meme base que products.purchase_price_basis, sans fret ni TVA non recuperable.';

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
        preferred_supplier,supplier_reference,top20_hint,stock_tracked,
        alternative_supplier,alternative_supplier_reference,alternative_purchase_price_ht
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
        coalesce((v_item->>'stock_tracked')::boolean,true),
        nullif(v_item->>'alternative_supplier',''),
        nullif(v_item->>'alternative_supplier_reference',''),
        nullif(v_item->>'alternative_purchase_price_ht','')::numeric
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
          alternative_supplier=case when v_item ? 'alternative_supplier'
            then nullif(v_item->>'alternative_supplier','') else alternative_supplier end,
          alternative_supplier_reference=case when v_item ? 'alternative_supplier_reference'
            then nullif(v_item->>'alternative_supplier_reference','') else alternative_supplier_reference end,
          alternative_purchase_price_ht=case when v_item ? 'alternative_purchase_price_ht'
            then nullif(v_item->>'alternative_purchase_price_ht','')::numeric else alternative_purchase_price_ht end,
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

