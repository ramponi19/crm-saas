-- PENDENTE — APLICAR SÓ COM AUTORIZAÇÃO DO LUCAS.
--
-- Avisos do Supabase "função SECURITY DEFINER executável por anon/logado".
--
-- 1. Seis funções de GATILHO. Chamadas pela API, o Postgres já recusa
--    ("trigger functions can only be called as triggers") — não é falha
--    explorável, é ruído no linter. Testado em 15/10 (transação desfeita):
--    sem EXECUTE para logado, o gatilho continua disparando (insert em
--    `tarefas` como logado preencheu a loja = 3).
set local lock_timeout = '5s';

revoke execute on function public.preencher_filial(), public.preencher_filial_do_lead(), public.sincronizar_nao_lidas(),
  public.marcar_cliente_proprietario(), public.numerar_cotacao_troca(), public.propagar_filial_do_lead()
  from public, anon, authenticated;

-- 2. Quatro funções que só fazem sentido com sessão, abertas ao anônimo.
--    Todos os usos no código (app/api/assistente, canais/meta, canais/whatsapp,
--    canais/instagram/retorno, superadmin/impersonar, lib/supabase/server)
--    chamam com usuário logado. Sem sessão elas devolvem vazio/recusam — o
--    fechamento é higiene, não conserto de vazamento.
revoke execute on function public.filiais_visiveis(), public.filial_atual(), public.filial_gravacao(bigint),
  public.encerrar_impersonacao() from public, anon;
grant execute on function public.filiais_visiveis(), public.filial_atual(), public.filial_gravacao(bigint),
  public.encerrar_impersonacao() to authenticated;

-- As de superadmin (set_super_admin, set_impersonation, hard_delete_empresa) e
-- get_empresa_id/is_super_admin/is_empresa_admin ficam como estão: precisam ser
-- chamáveis por logado (RLS e telas) e conferem superadmin por dentro.
-- VOLTA ATRÁS: 04_funcoes_fora_da_api.volta.sql.
