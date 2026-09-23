-- Consolidation de l'état réellement exécuté dans Supabase avant le Sprint 6.
-- Cette migration archive la protection d'idempotence UX2 déjà installée en production.
-- Idempotente : elle peut être exécutée sans recréer les données.

create table if not exists public.offline_sale_sync_keys (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  local_id uuid not null,
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, local_id)
);

alter table public.offline_sale_sync_keys enable row level security;

create or replace function public.complete_sale_offline_idempotent(
  p_local_id uuid,
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
  v_claimed uuid;
  v_sale uuid;
begin
  v_org := public.current_organization_id();
  if v_org is null then
    raise exception 'Utilisateur sans organisation';
  end if;

  insert into public.offline_sale_sync_keys(organization_id, local_id)
  values(v_org, p_local_id)
  on conflict (organization_id, local_id) do nothing
  returning local_id into v_claimed;

  if v_claimed is null then
    select sale_id into v_sale
    from public.offline_sale_sync_keys
    where organization_id = v_org and local_id = p_local_id;

    if v_sale is not null then
      return v_sale;
    end if;

    raise exception 'Synchronisation déjà en cours pour cette vente hors ligne';
  end if;

  select public.complete_sale(
    p_customer_id,
    p_lines,
    p_payments,
    p_note
  ) into v_sale;

  update public.offline_sale_sync_keys
  set sale_id = v_sale
  where organization_id = v_org and local_id = p_local_id;

  return v_sale;
end;
$$;

grant execute on function public.complete_sale_offline_idempotent(uuid,uuid,jsonb,jsonb,text)
to authenticated;
