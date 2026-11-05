-- Sprint 6H : code caisse stable et prix par lots configurables
alter table public.products add column if not exists checkout_code integer;
alter table public.products add constraint products_checkout_code_range check (checkout_code is null or checkout_code between 1 and 999999);
create unique index if not exists products_checkout_code_unique_per_org on public.products(organization_id,checkout_code) where checkout_code is not null;
comment on column public.products.checkout_code is 'Code caisse manuel, unique et stable par organisation. Ne dépend ni du nom, ni du SKU, ni du volume de ventes.';

create table if not exists public.product_unit_price_tiers (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 quantity integer not null check(quantity between 2 and 1000),
 price_ht numeric(12,2) not null check(price_ht>0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id,product_id,quantity)
);
create index if not exists product_unit_price_tiers_product_idx on public.product_unit_price_tiers(organization_id,product_id);
alter table public.product_unit_price_tiers enable row level security;
create policy product_unit_price_tiers_org on public.product_unit_price_tiers for all to authenticated
 using (organization_id=public.current_organization_id())
 with check (organization_id=public.current_organization_id());
grant select,insert,update,delete on public.product_unit_price_tiers to authenticated;

create or replace function public.unit_bundle_price_ht(
 p_org uuid, p_product uuid, p_quantity numeric, p_unit_price numeric
) returns numeric language plpgsql stable set search_path=public
as $$
declare
 q integer; i integer; t record;
 costs numeric[];
 candidate numeric;
begin
 if p_quantity is null or p_quantity<=0 or p_unit_price is null or p_unit_price<0 then
   raise exception 'Prix ou quantité invalide';
 end if;
 if not exists (select 1 from public.product_unit_price_tiers
                where organization_id=p_org and product_id=p_product and active) then
   return round(p_quantity*p_unit_price,2);
 end if;
 if p_quantity<>trunc(p_quantity) or p_quantity>1000 then
   raise exception 'Les tarifs par lot exigent une quantité entière de 1 à 1000 unités';
 end if;
 q:=p_quantity::integer;
 costs:=array_fill(null::numeric,ARRAY[q+1]);
 costs[1]:=0;
 for i in 1..q loop
   costs[i+1]:=costs[i]+p_unit_price;
   for t in (
      select quantity,price_ht from public.product_unit_price_tiers
      where organization_id=p_org and product_id=p_product and active and quantity<=i
   ) loop
      candidate:=costs[i-t.quantity+1]+t.price_ht;
      if candidate<costs[i+1] then costs[i+1]:=candidate;end if;
   end loop;
 end loop;
 return round(costs[q+1],2);
end;
$$;
grant execute on function public.unit_bundle_price_ht(uuid,uuid,numeric,numeric) to authenticated;
