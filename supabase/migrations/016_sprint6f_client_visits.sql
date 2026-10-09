-- Sprint 6F — modifier une fiche client et son compteur réel de passages, en une transaction.
create or replace function public.save_customer_with_visits(
  p_customer_id uuid,
  p_display_name text,
  p_phone text,
  p_email text,
  p_visits integer
)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_org uuid;
  v_customer uuid;
  v_current integer;
  v_delta integer;
  v_code text;
  v_index integer;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Compte sans organisation'; end if;
  if length(btrim(coalesce(p_display_name,''))) < 2 then raise exception 'Nom du client obligatoire'; end if;
  if p_visits is null or p_visits < 0 or p_visits > 1000000 then
    raise exception 'Nombre de passages invalide';
  end if;

  if p_customer_id is null then
    -- Générer une référence stable, sans collisions en cas de deux créations simultanées.
    perform pg_advisory_xact_lock(hashtext(v_org::text));
    select coalesce(max(substring(customer_code from '^CLI-([0-9]{4,})$')::integer),0)+1
    into v_index from public.customers where organization_id=v_org;
    v_code := 'CLI-'||lpad(v_index::text,4,'0');
    insert into public.customers(organization_id,customer_code,display_name,phone,email,active)
    values(v_org,v_code,btrim(p_display_name),nullif(btrim(p_phone),''),nullif(btrim(p_email),''),true)
    returning id into v_customer;
    v_current := 0;
  else
    select id into v_customer from public.customers
    where id=p_customer_id and organization_id=v_org for update;
    if v_customer is null then raise exception 'Client introuvable'; end if;
    update public.customers
    set display_name=btrim(p_display_name),
        phone=nullif(btrim(p_phone),''),
        email=nullif(btrim(p_email),''),
        updated_at=now()
    where id=v_customer;
    select coalesce(sum(points_delta),0)::integer into v_current
    from public.loyalty_events
    where organization_id=v_org and customer_id=v_customer;
  end if;

  v_delta := p_visits-v_current;
  if v_delta <> 0 then
    insert into public.loyalty_events(organization_id,customer_id,event_type,points_delta,note)
    values(v_org,v_customer,'manual_adjustment',v_delta,
      'Correction manuelle des passages : '||v_current||' → '||p_visits);
  end if;
  return v_customer;
end;
$$;
grant execute on function public.save_customer_with_visits(uuid,text,text,text,integer) to authenticated;
