-- Sprint 6B — Remises & caisse
-- Gestion des espèces et chèques : préparation, dépôt, crédit bancaire et fonds de caisse.
-- Idempotent.

alter table public.settings
  add column if not exists cash_float_target numeric not null default 200
  check (cash_float_target >= 0);

create table if not exists public.remittance_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  remittance_number text not null,
  payment_method text not null check (payment_method in ('cash','cheque')),
  remittance_kind text not null check (remittance_kind in ('bank_deposit','cash_reserve')),
  status text not null default 'prepared' check (status in ('prepared','deposited','credited','cancelled')),
  prepared_at timestamptz not null default now(),
  deposit_date date,
  credited_date date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, remittance_number)
);

create index if not exists remittance_batches_org_idx
  on public.remittance_batches(organization_id);
create index if not exists remittance_batches_method_idx
  on public.remittance_batches(organization_id,payment_method,status);

create table if not exists public.remittance_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null references public.remittance_batches(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(payment_id)
);

create index if not exists remittance_items_batch_idx
  on public.remittance_items(batch_id);
create index if not exists remittance_items_org_idx
  on public.remittance_items(organization_id);

alter table public.remittance_batches enable row level security;
alter table public.remittance_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='remittance_batches'
      and policyname='remittance_batches_select_org'
  ) then
    create policy remittance_batches_select_org
      on public.remittance_batches for select to authenticated
      using (organization_id=public.current_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='remittance_batches'
      and policyname='remittance_batches_write_org'
  ) then
    create policy remittance_batches_write_org
      on public.remittance_batches for all to authenticated
      using (organization_id=public.current_organization_id())
      with check (organization_id=public.current_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='remittance_items'
      and policyname='remittance_items_select_org'
  ) then
    create policy remittance_items_select_org
      on public.remittance_items for select to authenticated
      using (organization_id=public.current_organization_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='remittance_items'
      and policyname='remittance_items_write_org'
  ) then
    create policy remittance_items_write_org
      on public.remittance_items for all to authenticated
      using (organization_id=public.current_organization_id())
      with check (organization_id=public.current_organization_id());
  end if;
end $$;

create or replace function public.next_remittance_number(
  p_payment_method text,
  p_kind text
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_prefix text;
  v_year int;
  v_next int;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  v_year:=extract(year from current_date);
  v_prefix:=case
    when p_kind='cash_reserve' then 'CAISSE'
    when p_payment_method='cash' then 'ESP'
    when p_payment_method='cheque' then 'CHQ'
    else 'REM'
  end;

  select coalesce(max(
    nullif(substring(remittance_number from '([0-9]{3})
  into v_next
  from public.remittance_batches
  where organization_id=v_org
    and remittance_number like v_prefix||'-'||v_year||'-%';

  return v_prefix||'-'||v_year||'-'||lpad(v_next::text,3,'0');
end;
$$;

grant execute on function public.next_remittance_number(text,text) to authenticated;

create or replace function public.create_remittance_batch(
  p_payment_method text,
  p_kind text,
  p_payment_ids uuid[],
  p_name text default null,
  p_deposit_date date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_batch uuid;
  v_name text;
  v_payment_id uuid;
  v_payment public.payments%rowtype;
  v_existing_kind text;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  if p_payment_method not in ('cash','cheque') then
    raise exception 'Mode de paiement invalide';
  end if;
  if p_kind not in ('bank_deposit','cash_reserve') then
    raise exception 'Type de remise invalide';
  end if;
  if p_payment_method='cheque' and p_kind='cash_reserve' then
    raise exception 'Un chèque ne peut pas être affecté au fonds de caisse';
  end if;
  if coalesce(array_length(p_payment_ids,1),0)=0 then
    raise exception 'Aucun paiement sélectionné';
  end if;

  v_name:=coalesce(nullif(trim(p_name),''),public.next_remittance_number(p_payment_method,p_kind));

  insert into public.remittance_batches(
    organization_id,remittance_number,payment_method,remittance_kind,status,deposit_date,note,created_by
  ) values (
    v_org,v_name,p_payment_method,p_kind,
    case when p_deposit_date is null then 'prepared' else 'deposited' end,
    p_deposit_date,p_note,auth.uid()
  ) returning id into v_batch;

  foreach v_payment_id in array p_payment_ids
  loop
    select * into v_payment
    from public.payments
    where id=v_payment_id and organization_id=v_org
    for update;

    if not found then raise exception 'Paiement introuvable'; end if;
    if v_payment.payment_method<>p_payment_method then
      raise exception 'Le paiement % ne correspond pas au mode sélectionné',v_payment_id;
    end if;
    if coalesce(v_payment.status,'completed')<>'completed' then
      raise exception 'Paiement annulé ou invalide';
    end if;

    select b.remittance_kind into v_existing_kind
    from public.remittance_items i
    join public.remittance_batches b on b.id=i.batch_id
    where i.payment_id=v_payment_id and b.status<>'cancelled'
    limit 1;

    if v_existing_kind is not null then
      if v_existing_kind='cash_reserve'
         and p_payment_method='cash'
         and p_kind='bank_deposit' then
        delete from public.remittance_items where payment_id=v_payment_id;
      else
        raise exception 'Ce paiement appartient déjà à une remise active';
      end if;
    else
      -- Nettoie une éventuelle ancienne affectation annulée avant réutilisation.
      delete from public.remittance_items i
      using public.remittance_batches b
      where i.payment_id=v_payment_id
        and i.batch_id=b.id
        and b.status='cancelled';
    end if;

    insert into public.remittance_items(
      organization_id,batch_id,payment_id,amount
    ) values(v_org,v_batch,v_payment_id,v_payment.amount);
  end loop;

  return v_batch;
end;
$$;

grant execute on function public.create_remittance_batch(text,text,uuid[],text,date,text)
to authenticated;

create or replace function public.update_remittance_batch(
  p_batch_id uuid,
  p_deposit_date date default null,
  p_credited_date date default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  update public.remittance_batches
  set deposit_date=coalesce(p_deposit_date,deposit_date),
      credited_date=coalesce(p_credited_date,credited_date),
      note=coalesce(p_note,note),
      status=case
        when coalesce(p_credited_date,credited_date) is not null then 'credited'
        when coalesce(p_deposit_date,deposit_date) is not null then 'deposited'
        else 'prepared'
      end,
      updated_at=now()
  where id=p_batch_id and organization_id=v_org and status<>'cancelled';

  if not found then raise exception 'Remise introuvable'; end if;
end;
$$;

grant execute on function public.update_remittance_batch(uuid,date,date,text)
to authenticated;

create or replace function public.cancel_remittance_batch(
  p_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  update public.remittance_batches
  set status='cancelled',updated_at=now()
  where id=p_batch_id and organization_id=v_org and status<>'credited';

  if not found then
    raise exception 'Remise introuvable ou déjà créditée';
  end if;
end;
$$;

grant execute on function public.cancel_remittance_batch(uuid) to authenticated;

create or replace function public.update_cash_float_target(
  p_cash_float_target numeric
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;
  update public.settings
  set cash_float_target=greatest(0,coalesce(p_cash_float_target,0))
  where organization_id=v_org;
end;
$$;

grant execute on function public.update_cash_float_target(numeric) to authenticated;
),'')::int
  ),0)+1
  into v_next
  from public.remittance_batches
  where organization_id=v_org
    and remittance_number like v_prefix||'-'||v_year||'-%';

  return v_prefix||'-'||v_year||'-'||lpad(v_next::text,3,'0');
end;
$$;

grant execute on function public.next_remittance_number(text,text) to authenticated;

create or replace function public.create_remittance_batch(
  p_payment_method text,
  p_kind text,
  p_payment_ids uuid[],
  p_name text default null,
  p_deposit_date date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_batch uuid;
  v_name text;
  v_payment_id uuid;
  v_payment public.payments%rowtype;
  v_existing_kind text;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  if p_payment_method not in ('cash','cheque') then
    raise exception 'Mode de paiement invalide';
  end if;
  if p_kind not in ('bank_deposit','cash_reserve') then
    raise exception 'Type de remise invalide';
  end if;
  if p_payment_method='cheque' and p_kind='cash_reserve' then
    raise exception 'Un chèque ne peut pas être affecté au fonds de caisse';
  end if;
  if coalesce(array_length(p_payment_ids,1),0)=0 then
    raise exception 'Aucun paiement sélectionné';
  end if;

  v_name:=coalesce(nullif(trim(p_name),''),public.next_remittance_number(p_payment_method,p_kind));

  insert into public.remittance_batches(
    organization_id,remittance_number,payment_method,remittance_kind,status,deposit_date,note,created_by
  ) values (
    v_org,v_name,p_payment_method,p_kind,
    case when p_deposit_date is null then 'prepared' else 'deposited' end,
    p_deposit_date,p_note,auth.uid()
  ) returning id into v_batch;

  foreach v_payment_id in array p_payment_ids
  loop
    select * into v_payment
    from public.payments
    where id=v_payment_id and organization_id=v_org
    for update;

    if not found then raise exception 'Paiement introuvable'; end if;
    if v_payment.payment_method<>p_payment_method then
      raise exception 'Le paiement % ne correspond pas au mode sélectionné',v_payment_id;
    end if;
    if coalesce(v_payment.status,'completed')<>'completed' then
      raise exception 'Paiement annulé ou invalide';
    end if;

    select b.remittance_kind into v_existing_kind
    from public.remittance_items i
    join public.remittance_batches b on b.id=i.batch_id
    where i.payment_id=v_payment_id and b.status<>'cancelled'
    limit 1;

    if v_existing_kind is not null then
      if v_existing_kind='cash_reserve'
         and p_payment_method='cash'
         and p_kind='bank_deposit' then
        delete from public.remittance_items where payment_id=v_payment_id;
      else
        raise exception 'Ce paiement appartient déjà à une remise active';
      end if;
    end if;

    insert into public.remittance_items(
      organization_id,batch_id,payment_id,amount
    ) values(v_org,v_batch,v_payment_id,v_payment.amount);
  end loop;

  return v_batch;
end;
$$;

grant execute on function public.create_remittance_batch(text,text,uuid[],text,date,text)
to authenticated;

create or replace function public.update_remittance_batch(
  p_batch_id uuid,
  p_deposit_date date default null,
  p_credited_date date default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  update public.remittance_batches
  set deposit_date=coalesce(p_deposit_date,deposit_date),
      credited_date=coalesce(p_credited_date,credited_date),
      note=coalesce(p_note,note),
      status=case
        when coalesce(p_credited_date,credited_date) is not null then 'credited'
        when coalesce(p_deposit_date,deposit_date) is not null then 'deposited'
        else 'prepared'
      end,
      updated_at=now()
  where id=p_batch_id and organization_id=v_org and status<>'cancelled';

  if not found then raise exception 'Remise introuvable'; end if;
end;
$$;

grant execute on function public.update_remittance_batch(uuid,date,date,text)
to authenticated;

create or replace function public.cancel_remittance_batch(
  p_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  update public.remittance_batches
  set status='cancelled',updated_at=now()
  where id=p_batch_id and organization_id=v_org and status<>'credited';

  if not found then
    raise exception 'Remise introuvable ou déjà créditée';
  end if;
end;
$$;

grant execute on function public.cancel_remittance_batch(uuid) to authenticated;

create or replace function public.update_cash_float_target(
  p_cash_float_target numeric
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
begin
  v_org:=public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;
  update public.settings
  set cash_float_target=greatest(0,coalesce(p_cash_float_target,0))
  where organization_id=v_org;
end;
$$;

grant execute on function public.update_cash_float_target(numeric) to authenticated;
