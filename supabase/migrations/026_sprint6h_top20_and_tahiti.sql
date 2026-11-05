-- Ordre manuel et stable choisi par Benoît le 05/11/2026.
-- Les codes ne sont jamais recalculés depuis les statistiques de vente.
do $$
declare v_count integer; v_duplicates integer;
begin
 select count(*) into v_count from public.products where sku in ('PRD-0088','PRD-0080','PRD-0030','PRD-0034','PRD-0003','PRD-0045','PRD-0005','PRD-0083','PRD-0087','PRD-0085','PRD-0078','PRD-0084','PRD-0072','PRD-000022','PRD-0068','PRD-0059','PRD-0055','PRD-0017','PRD-0105','PRD-0075');
 if v_count<>20 then raise exception 'Codes caisse : seulement % des 20 références trouvées',v_count; end if;
 select count(*) into v_duplicates from public.products where checkout_code is not null;
 if v_duplicates<>0 then raise exception 'Codes caisse déjà attribués : intervention humaine requise'; end if;
 update public.products set checkout_code=m.n,top20_hint=true,updated_at=now()
 from (values ('PRD-0088',1),
('PRD-0080',2),
('PRD-0030',3),
('PRD-0034',4),
('PRD-0003',5),
('PRD-0045',6),
('PRD-0005',7),
('PRD-0083',8),
('PRD-0087',9),
('PRD-0085',10),
('PRD-0078',11),
('PRD-0084',12),
('PRD-0072',13),
('PRD-000022',14),
('PRD-0068',15),
('PRD-0059',16),
('PRD-0055',17),
('PRD-0017',18),
('PRD-0105',19),
('PRD-0075',20)) as m(sku,n)
 where products.sku=m.sku;
 update public.products set top20_hint=false,updated_at=now()
 where checkout_code is null and top20_hint=true;
 -- Archiver le doublon sans perdre ses références et sans vente historique.
 if exists (select 1 from public.sale_lines sl join public.products p on p.id=sl.product_id
            where p.sku='PRD-000021') then
   raise exception 'FOIE TISANE a des ventes, archivage manuel requis';
 end if;
 update public.products set active=false,updated_at=now()
 where sku='PRD-000021' and name='FOIE TISANE';
 if not found then raise exception 'FOIE TISANE introuvable';end if;
 -- Première attribution aux autres produits actifs : tri alphabétique figé à l'installation.
 -- Les codes restent stables ensuite, même quand le produit change de nom ou de popularité.
 with others as (
   select id, 20+row_number() over(order by lower(name),sku) as new_code
   from public.products where active=true and checkout_code is null
 )
 update public.products p set checkout_code=o.new_code,updated_at=now()
 from others o where p.id=o.id;
end $;

-- Tarif du lot de Vanille de Tahiti, sans changer le prix 1 gousse = 10 €.
insert into public.product_unit_price_tiers(organization_id,product_id,quantity,price_ht)
select organization_id,id,3,26 from public.products
where sku='PRD-0183' and pricing_mode='fixed_unit' and sale_price_ht=10
on conflict (organization_id,product_id,quantity) do nothing;
