-- Enregistrement atomique des paliers d'unités et prévention des doublons.
create or replace function public.replace_product_unit_tiers(p_product_id uuid,p_rows jsonb)
returns void language plpgsql security definer set search_path=public
as $$
declare v_org uuid; v_mode text; item jsonb; cnt int; vals int[];
begin
 v_org:=public.current_organization_id();
 if v_org is null then raise exception 'Utilisateur sans organisation';end if;
 select pricing_mode into v_mode from public.products
 where id=p_product_id and organization_id=v_org for update;
 if not found then raise exception 'Produit absent ou non autorisé';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>20 then
   raise exception 'Maximum 20 paliers, format tableau obligatoire';
 end if;
 if v_mode<>'fixed_unit' and jsonb_array_length(p_rows)>0 then
   raise exception 'Tarifs par lots réservés aux produits vendus à l’unité';
 end if;
 select count(*),array_agg((x->>'quantity')::int)
 into cnt,vals from jsonb_array_elements(p_rows) x;
 if coalesce(cnt,0)<>coalesce(array_length(array(select distinct unnest(vals)),1),0) then
   raise exception 'Quantités de lots en double';
 end if;
 for item in select value from jsonb_array_elements(p_rows) loop
   if (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric)
      or (item->>'quantity')::numeric not between 2 and 1000
      or (item->>'price_ht')::numeric<=0
      or (item->>'price_ht')::numeric>100000 then
     raise exception 'Quantité/prix de lot invalide';
   end if;
 end loop;
 delete from public.product_unit_price_tiers where organization_id=v_org and product_id=p_product_id;
 insert into public.product_unit_price_tiers(organization_id,product_id,quantity,price_ht,active)
 select v_org,p_product_id,(r->>'quantity')::int,(r->>'price_ht')::numeric,true
 from jsonb_array_elements(p_rows) r;
end;
$$;
revoke execute on function public.replace_product_unit_tiers(uuid,jsonb) from public,anon;
grant execute on function public.replace_product_unit_tiers(uuid,jsonb) to authenticated;
