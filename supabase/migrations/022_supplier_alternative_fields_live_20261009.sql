-- Ajout non destructif : fournisseur secondaire / référence / prix catalogue HT.
-- L'interface Sprint 6F affichera ces champs une fois déployée.
alter table public.products add column if not exists alternative_supplier text;
alter table public.products add column if not exists alternative_supplier_reference text;
alter table public.products add column if not exists alternative_purchase_price_ht numeric(12,4);
comment on column public.products.alternative_purchase_price_ht is
  'Prix HT du fournisseur secondaire, sur la base produit (100 g ou unité). TVA non recuperable exclue.';

