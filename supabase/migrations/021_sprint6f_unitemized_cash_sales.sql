-- Sprint 6F — ventes espèces reelles, non ventilées par article.
-- La donnée est portée sur une clôture unique par jour et par organisation.
-- Aucun mouvement de stock / aucune vente fictive n'est créé.
alter table public.cash_closings
  add column if not exists unitemized_cash_sales numeric(12,2) not null default 0;

alter table public.cash_closings
  add constraint cash_closings_unitemized_cash_sales_nonnegative
  check (unitemized_cash_sales >= 0);

comment on column public.cash_closings.unitemized_cash_sales is
  'Ventes reelles encaissees en especes, non saisies ligne par ligne. Integrer au CA et a la cloture, mais exclure des marges par produit et mouvements de stock.';
