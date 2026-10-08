-- Sprint 6F: le fonds de caisse physique n'est pas une vente.
alter table public.cash_closings
  add column if not exists opening_cash_float numeric(12,2) not null default 0;

alter table public.cash_closings
  add constraint cash_closings_opening_cash_float_nonnegative
  check (opening_cash_float >= 0);

comment on column public.cash_closings.opening_cash_float is
  'Espèces présentes au début de la journée ; ne constituent pas du chiffre d affaires.';
