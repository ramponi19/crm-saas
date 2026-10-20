-- Limpeza de 20/10, item 2.8: índice para a view leads.
--
-- A consulta que mais pesa na view (contagem de leads ativos com mensagem não lida, o
-- contador do topo/menu: 431 chamadas e 56 s em 2 h, 15% do tempo do banco) calcula, para
-- cada negócio, o "principal" do contato: negocios do mesmo contato ordenados por ativo,
-- created_at e id, LIMIT 1. Este índice entrega essa ordem pronta, sem ordenar em cada
-- repetição. CONCURRENTLY: aplicar fora de transação (operador da limpeza).
create index concurrently if not exists negocios_contato_principal_idx
  on public.negocios (contato_id, (coalesce((dados -> '_lead' ->> 'ativo')::boolean, true)) desc, created_at desc, id desc);
