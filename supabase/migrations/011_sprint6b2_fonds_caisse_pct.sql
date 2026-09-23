-- Sprint 6B.2 — fonds de caisse en montant ou en pourcentage
-- Idempotent.

alter table public.settings
  add column if not exists cash_float_target_percent numeric not null default 0
  check (cash_float_target_percent >= 0 and cash_float_target_percent <= 100);

alter table public.settings
  add column if not exists cash_float_target_mode text not null default 'amount'
  check (cash_float_target_mode in ('amount','percent'));

create or replace function public.update_cash_float_settings(
  p_cash_float_target numeric,
  p_cash_float_target_percent numeric,
  p_cash_float_target_mode text
)
returns void
language plpgsql
security definer
set search_path=public
as $fn$
declare
  v_org uuid;
  v_mode text;
begin
  v_org:=public.current_organization_id();
  if v_org is null then
    raise exception 'Utilisateur sans organisation';
  end if;

  v_mode:=case
    when p_cash_float_target_mode='percent' then 'percent'
    else 'amount'
  end;

  update public.settings
  set cash_float_target=greatest(0,coalesce(p_cash_float_target,0)),
      cash_float_target_percent=least(100,greatest(0,coalesce(p_cash_float_target_percent,0))),
      cash_float_target_mode=v_mode
  where organization_id=v_org;
end;
$fn$;

grant execute on function public.update_cash_float_settings(numeric,numeric,text)
to authenticated;
