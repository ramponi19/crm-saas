-- "Um pedido aberto por módulo" passa a ser "um pedido PENDENTE por módulo" (23/10/2026):
-- com o recusar deixando de apagar, um pedido recusado tem atendido_em nulo e travaria um
-- pedido novo do mesmo módulo. CONCURRENTLY, fora de transação (como a 20261021003710):
-- aplicar este arquivo SOZINHO, depois da 20261024000100.
drop index concurrently if exists public.modulo_pedidos_aberto;
create unique index concurrently if not exists modulo_pedidos_pendente
  on public.modulo_pedidos (empresa_id, modulo) where status = 'pendente';
