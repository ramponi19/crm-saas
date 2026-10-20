-- Item 2.9 da limpeza: tarefas sai da publicação do Realtime. Nenhuma tela assina
-- postgres_changes em tarefas (conferido em 20/10/2026); cada escrita nela ia para o WAL
-- decodificado do Realtime à toa. Ficam: acessos (equipe), contatos e conversas (kanban
-- do v1), mensagens, mensagens_internas (chat), negocios e pedidos (kds).
do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tarefas') then
    alter publication supabase_realtime drop table public.tarefas;
  end if;
end $$;
