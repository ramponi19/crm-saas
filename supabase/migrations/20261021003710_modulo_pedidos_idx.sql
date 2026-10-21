-- Um pedido ABERTO por módulo e empresa: o dono que clica duas vezes não cria dois.
-- CONCURRENTLY por regra da casa (índice sempre sem travar a tabela), mesmo sendo
-- tabela nova; por isso em arquivo próprio, fora de transação.
create unique index concurrently if not exists modulo_pedidos_aberto
  on public.modulo_pedidos (empresa_id, modulo) where atendido_em is null;

-- A FK de empresa_id já é coberta por este índice (coluna líder).
