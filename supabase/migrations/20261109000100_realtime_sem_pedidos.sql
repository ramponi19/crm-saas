-- FAXINA 09/11/2026 (item 6, aprovado pelo Lucas): pedidos sai da publicação do Realtime.
-- Só a tela do KDS assina postgres_changes em pedidos, e o KDS está "em preparação"
-- (core/modulos.ts): ninguém usa. Cada escrita em pedidos ia para o WAL decodificado
-- do Realtime à toa. ATIVAR O KDS EXIGE POR DE VOLTA (manifesto: `realtime: ['pedidos']`;
-- 05, "Como nasce um módulo").
-- acessos FICA: a tela Equipe assina para a presença ao vivo (decisão do Lucas, 09/11).
-- Volta: supabase/scripts/volta/volta-realtime-pedidos.sql
do $$
begin
  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime drop table public.pedidos;
  end if;
end $$;
