-- ESTATÍSTICA PARA AS EXPRESSÕES QUE O ZAPINTEL FILTRA (branch fix/zapintel-core, 21/10/2026).
-- Aplicar depois da 20261022001000_zapintel_le_o_core.sql.
--
-- O EXPLAIN não pediu índice: pediu estatística. Toda tela do ZapIntel filtra os negócios por
-- `coalesce(filial_id, 0) = any (lojas)` e `coalesce((dados->'_lead'->>'ativo')::boolean, true)`. O
-- Postgres não tem estatística dessas expressões e chuta 0,5% por loja: na cópia, 36 negócios
-- estimados onde havia 2.386 — e com isso escolhia nested loop sobre CTE (atendimento: 1.282
-- varreduras da lista de fichas). Com estas, a estimativa acerta e o plano vira hash join.
--
-- Lock: CREATE STATISTICS e ANALYZE pegam SHARE UPDATE EXCLUSIVE, que NÃO bloqueia leitura nem
-- escrita (só outro ANALYZE/VACUUM/DDL na mesma tabela). Não existe CONCURRENTLY para estatística, e
-- não precisa. ANALYZE das duas tabelas: segundos (negocios ~2,5 mil linhas, mensagens ~80 mil).

create statistics if not exists public.negocios_loja_stx on (coalesce(filial_id, 0)) from public.negocios;
create statistics if not exists public.negocios_ativo_stx
  on (coalesce(((dados -> '_lead') ->> 'ativo')::boolean, true)) from public.negocios;
create statistics if not exists public.mensagens_loja_stx on (coalesce(filial_id, 0)) from public.mensagens;

analyze public.negocios;
analyze public.mensagens;
