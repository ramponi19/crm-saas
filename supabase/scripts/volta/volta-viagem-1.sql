-- Volta da viagem 1 (20261024000100 + 20261024000110), escrita na noite de 03/11/2026.
-- Usar junto com o Instant Rollback do app: o código anterior não conhece empresa_segredos
-- nem modulo_pedidos.status.
--
-- Rodar em DUAS partes, como a ida:
--
-- PARTE A — sozinha, fora de transação (CONCURRENTLY):
--   drop index concurrently if exists public.modulo_pedidos_pendente;
--
-- PARTE B — numa transação (o resto deste arquivo).
--
-- Pedido RECUSADO não existia antes (o recusar apagava, com registro em superadmin_logs):
-- ele sai, senão travaria o índice antigo "um pedido aberto por módulo" (atendido_em nulo).
-- O token de portal guardado em empresa_segredos se perde com a tabela; o código anterior
-- não o lia (lib/portal-token.ts devolvia null até a viagem 1).

begin;
delete from public.modulo_pedidos where status = 'recusado';
alter table public.modulo_pedidos
  drop constraint if exists modulo_pedidos_status_coerente,
  drop constraint if exists modulo_pedidos_status_check,
  drop column if exists recusado_por,
  drop column if exists recusado_em,
  drop column if exists status;
drop table if exists public.empresa_segredos;
commit;

-- PARTE C — sozinha, fora de transação, depois da B:
--   create unique index concurrently if not exists modulo_pedidos_aberto
--     on public.modulo_pedidos (empresa_id, modulo) where atendido_em is null;
