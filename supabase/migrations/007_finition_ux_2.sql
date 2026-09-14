-- Tant qu'il y aura des Épices — Finition UX 2
-- Complète les données de démonstration sans supprimer ni écraser l'existant.

insert into public.product_categories(organization_id, name, sort_order, active)
select s.organization_id, x.name, x.sort_order, true
from public.settings s
cross join (
  values
    ('Cafés', 10),
    ('Thés', 20),
    ('Tisanes', 30),
    ('Épices', 40)
) as x(name, sort_order)
where not exists (
  select 1 from public.product_categories pc
  where pc.organization_id = s.organization_id
    and lower(pc.name) = lower(x.name)
);

insert into public.bank_category_rules(organization_id, keyword, category, priority, active)
select s.organization_id, x.keyword, x.category, x.priority, true
from public.settings s
cross join (
  values
    ('tpe','Encaissement CB',10),
    ('carte','Encaissement CB',20),
    ('cb ','Encaissement CB',30),
    ('urssaf','URSSAF',10),
    ('loyer','Loyer',10),
    ('assurance','Assurance',10),
    ('orange','Télécom',20),
    ('sfr','Télécom',20),
    ('free','Télécom',20),
    ('edf','Énergie',20),
    ('totalenergies','Énergie',20),
    ('fournisseur','Fournisseurs',30)
) as x(keyword, category, priority)
where not exists (
  select 1 from public.bank_category_rules r
  where r.organization_id = s.organization_id
    and lower(r.keyword) = lower(x.keyword)
);
