-- Sprint 6E — catalogue V4, fournisseurs et imports massifs
-- Idempotent.

alter table public.products add column if not exists preferred_supplier text;
alter table public.products add column if not exists supplier_reference text;
alter table public.products add column if not exists top20_hint boolean not null default false;
alter table public.products add column if not exists stock_pending boolean not null default false;

do $$
declare
  v_org uuid;
begin
  v_org := public.current_organization_id();
  if v_org is null then
    raise exception 'Utilisateur sans organisation';
  end if;

  insert into public.product_categories(organization_id,name,active,sort_order)
  select v_org,v.name,true,v.sort_order
  from (values
    ('Cafés',10),('Thés',20),('Tisanes & rooibos',30),('Épices',40),
    ('Herbes & graines',50),('Sucres',60),('Accessoires',70)
  ) as v(name,sort_order)
  where not exists (
    select 1 from public.product_categories pc
    where pc.organization_id=v_org and lower(pc.name)=lower(v.name)
  );

  update public.product_categories pc
  set active=true,
      sort_order=v.sort_order
  from (values
    ('Cafés',10),('Thés',20),('Tisanes & rooibos',30),('Épices',40),
    ('Herbes & graines',50),('Sucres',60),('Accessoires',70)
  ) as v(name,sort_order)
  where pc.organization_id=v_org and lower(pc.name)=lower(v.name);
end $$;

create or replace function public.import_products_catalog_v4(
  p_rows jsonb,
  p_full_catalog boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
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
      insert into public.products(
        organization_id,sku,name,category_id,subfamily,pricing_mode,active,
        stock_unit,purchase_unit,purchase_unit_quantity,purchase_unit_stock_equivalent,
        stock_quantity,stock_alert_threshold,stock_pending,
        purchase_price_ht,purchase_price_basis,
        sale_price_ht,sale_price_basis,vat_rate_purchase,vat_rate_sale,
        loyalty_eligible,loyalty_reward_quantity,
        preferred_supplier,supplier_reference,top20_hint
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
        coalesce((v_item->>'top20_hint')::boolean,false)
      )
      returning id into v_product;
      v_created := v_created + 1;
    else
      update public.products
      set name=trim(v_item->>'name'),
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
$$;

grant execute on function public.import_products_catalog_v4(jsonb,boolean)
to authenticated;

create or replace function public.import_clients_with_loyalty_v2(
  p_rows jsonb,
  p_source_label text default '08/10/2026'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_required integer;
  v_item jsonb;
  v_customer uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_existing_points numeric;
  v_existing_used integer;
  v_desired_points numeric;
  v_delta numeric;
  v_to_add_used integer;
  v_code text;
  v_name text;
  v_note_prefix text;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  select coalesce(loyalty_visits_per_reward,10)
  into v_required
  from public.settings
  where organization_id=v_org;
  v_required := coalesce(v_required,10);

  v_note_prefix := 'Baseline fichier client '||coalesce(p_source_label,'import');

  for v_item in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    v_code := upper(trim(v_item->>'customer_code'));
    v_name := trim(v_item->>'display_name');

    select id into v_customer
    from public.customers
    where organization_id=v_org and customer_code=v_code
    limit 1;

    if v_customer is null then
      if (
        select count(*) from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
        where lower(trim(x->>'display_name'))=lower(v_name)
      ) = 1 then
        select id into v_customer
        from public.customers
        where organization_id=v_org and lower(trim(display_name))=lower(v_name)
        order by created_at
        limit 1;
      end if;
    end if;

    if v_customer is null then
      insert into public.customers(
        organization_id,customer_code,display_name,phone,email,notes,active
      ) values(
        v_org,v_code,v_name,
        nullif(v_item->>'phone',''),
        nullif(v_item->>'email',''),
        nullif(v_item->>'notes',''),
        coalesce((v_item->>'active')::boolean,true)
      )
      returning id into v_customer;
      v_created := v_created + 1;
    else
      update public.customers
      set customer_code=v_code,
          display_name=v_name,
          phone=coalesce(nullif(v_item->>'phone',''),phone),
          email=coalesce(nullif(v_item->>'email',''),email),
          notes=case
            when notes is null
              or notes like 'Import fichier Benoît%'
              or notes like 'Source fichier client %'
            then nullif(v_item->>'notes','')
            else notes
          end,
          active=coalesce((v_item->>'active')::boolean,true),
          updated_at=now()
      where id=v_customer;
      v_updated := v_updated + 1;
    end if;

    delete from public.loyalty_events
    where organization_id=v_org
      and customer_id=v_customer
      and note like v_note_prefix||'%';

    select coalesce(sum(points_delta),0)
    into v_existing_points
    from public.loyalty_events
    where organization_id=v_org and customer_id=v_customer;

    select count(*)
    into v_existing_used
    from public.loyalty_events
    where organization_id=v_org
      and customer_id=v_customer
      and event_type='reward_used';

    v_desired_points :=
      (
        coalesce((v_item->>'historical_rewards_used')::integer,0)
        + coalesce((v_item->>'pending_rewards')::integer,0)
      ) * v_required
      + coalesce((v_item->>'loyalty_progress')::integer,0);

    v_delta := v_desired_points-v_existing_points;

    if abs(v_delta)>0.0001 then
      insert into public.loyalty_events(
        organization_id,customer_id,event_type,points_delta,note
      ) values(
        v_org,v_customer,'import_adjustment',v_delta,
        v_note_prefix||' — ajustement au cumul source'
      );
    end if;

    v_to_add_used := greatest(
      0,
      coalesce((v_item->>'historical_rewards_used')::integer,0)-v_existing_used
    );

    if v_to_add_used>0 then
      insert into public.loyalty_events(
        organization_id,customer_id,event_type,points_delta,note
      )
      select
        v_org,v_customer,'reward_used',0,
        v_note_prefix||' — cadeau historique'
      from generate_series(1,v_to_add_used);
    end if;
  end loop;

  return jsonb_build_object('created',v_created,'updated',v_updated);
end;
$$;

grant execute on function public.import_clients_with_loyalty_v2(jsonb,text)
to authenticated;
