-- Volta de 20261109000100_realtime_sem_pedidos: pedidos de novo na publicação do Realtime
-- (é também o que ativar o KDS exige).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;
