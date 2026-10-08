-- Optimize large client imports: no quadratic scans, indexed loyalty per customer.
create index if not exists loyalty_events_org_customer_idx on public.loyalty_events (organization_id, customer_id);

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
  v_name_counts jsonb;
begin
  v_org := public.current_organization_id();
  if v_org is null then raise exception 'Utilisateur sans organisation'; end if;

  select coalesce(loyalty_visits_per_reward,10)
  into v_required
  from public.settings
  where organization_id=v_org;
  v_required := coalesce(v_required,10);

  v_note_prefix := 'Baseline fichier client '||coalesce(p_source_label,'import');

  -- Build the name frequency map once, avoiding O(n²) JSON scans.
  select coalesce(jsonb_object_agg(name_key, name_count),'{}'::jsonb)
  into v_name_counts
  from (
    select lower(trim(x->>'display_name')) name_key, count(*) name_count
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
    group by 1
  ) names;

  for v_item in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    v_code := upper(trim(v_item->>'customer_code'));
    v_name := trim(v_item->>'display_name');

    select id into v_customer
    from public.customers
    where organization_id=v_org and customer_code=v_code
    limit 1;

    if v_customer is null then
      if coalesce((v_name_counts->>lower(v_name))::integer,0) = 1 then
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
        v_org,v_customer,'manual_adjustment',v_delta,
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
