-- Sprint 6C — historique mensuel pour comparaison N / N-1
-- Source 2025 : Prev Benoit_RevMB_160426.xlsx / feuille "CA et saisonnalité".
-- Idempotent.

create table if not exists public.historical_monthly_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year integer not null check (year >= 2000 and year <= 2100),
  month integer not null check (month between 1 and 12),
  ca_ttc numeric not null default 0 check (ca_ttc >= 0),
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, year, month)
);

create index if not exists historical_monthly_sales_org_year_idx
  on public.historical_monthly_sales(organization_id, year, month);

alter table public.historical_monthly_sales enable row level security;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='historical_monthly_sales'
      and policyname='historical_monthly_sales_select_org'
  ) then
    create policy historical_monthly_sales_select_org
      on public.historical_monthly_sales
      for select
      to authenticated
      using (organization_id=public.current_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='historical_monthly_sales'
      and policyname='historical_monthly_sales_write_org'
  ) then
    create policy historical_monthly_sales_write_org
      on public.historical_monthly_sales
      for all
      to authenticated
      using (organization_id=public.current_organization_id())
      with check (organization_id=public.current_organization_id());
  end if;
end;
$policy$;

insert into public.historical_monthly_sales(
  organization_id, year, month, ca_ttc, source_label
)
select
  s.organization_id,
  2025,
  v.month,
  v.ca_ttc,
  'Prev Benoit_RevMB_160426.xlsx — CA et saisonnalité'
from public.settings s
cross join (
  values
    (1, 4570.00::numeric),
    (2, 6110.00::numeric),
    (3, 5304.00::numeric),
    (4, 7176.00::numeric),
    (5, 10566.00::numeric),
    (6, 6067.00::numeric),
    (7, 11271.00::numeric),
    (8, 14483.00::numeric),
    (9, 7249.99::numeric),
    (10, 3249.00::numeric),
    (11, 5270.90::numeric),
    (12, 7074.90::numeric)
) as v(month, ca_ttc)
on conflict (organization_id, year, month)
do update set
  ca_ttc=excluded.ca_ttc,
  source_label=excluded.source_label,
  updated_at=now();
