-- Référentiel de fournisseurs contrôlé (un nom unique par organisation)
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 150),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists suppliers_org_name_ci_idx on public.suppliers (organization_id, lower(btrim(name)));
create index if not exists suppliers_org_active_idx on public.suppliers (organization_id,active);
alter table public.suppliers enable row level security;
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public'
    and tablename='suppliers' and policyname='suppliers_org_isolation') then
    create policy suppliers_org_isolation on public.suppliers for all to authenticated
      using (organization_id=public.current_organization_id())
      with check (organization_id=public.current_organization_id());
  end if;
end $$;
grant select,insert,update on public.suppliers to authenticated;

insert into public.suppliers (organization_id,name,active)
select organization_id,btrim(name),true
from (
  select organization_id,preferred_supplier as name from public.products where preferred_supplier is not null
  union
  select organization_id,alternative_supplier as name from public.products where alternative_supplier is not null
) x
where length(btrim(name))>=2
on conflict do nothing;
