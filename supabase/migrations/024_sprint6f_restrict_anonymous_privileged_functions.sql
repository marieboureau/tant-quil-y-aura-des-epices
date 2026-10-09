-- Bloquer l'exécution anonyme de toutes les fonctions SECURITY DEFINER exposées.
-- Maintenir les appels des membres connectés à l'application.
do $$
declare item record;
begin
  for item in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prokind='f'
  loop
    execute format('revoke execute on function %s from public, anon',item.signature);
    execute format('grant execute on function %s to authenticated',item.signature);
  end loop;
end;
$$;