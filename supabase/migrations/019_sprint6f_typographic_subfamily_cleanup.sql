-- Sprint 6F — harmonisation strictement typographique, sans changer la nature des produits.
update public.products p
set subfamily='Thé vert',updated_at=now()
from public.product_categories c
where p.category_id=c.id
  and c.name='Thés'
  and lower(trim(p.subfamily))=lower('Thé vert')
  and p.subfamily <> 'Thé vert';
