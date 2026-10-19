-- =====================================================================================
-- Passo A, item 6: ninguém executa função de public sem precisar.
--
-- REVOKE de tudo para PUBLIC, anon e authenticated (PUBLIC entra porque toda função
-- nasce com EXECUTE para PUBLIC, e anon/authenticated herdam por ali). Depois o
-- GRANT volta só para authenticated, e só nas funções de que o app logado depende:
--   - RLS (policies de public, de storage.objects e de realtime.messages) e a view
--     v_empresas_plano: get_empresa_id, filiais_visiveis, is_empresa_admin, is_super_admin;
--   - RPC chamado com a sessão do usuário (grep de .rpc( em app/, lib/, components/,
--     hooks/, 19/10/2026): encerrar_impersonacao, set_impersonation, set_super_admin,
--     hard_delete_empresa, chat_nao_lidas_por_conversa, chat_marcar_lido,
--     buscar_lead_por_numero, filial_atual, filial_gravacao e as RPCs do ZapIntel.
-- anon não fica com nenhuma: nenhuma rota pública chama RPC ou lê tabela sem a
-- chave de serviço. service_role e postgres não são afetados (têm GRANT próprio).
-- Gatilho não precisa de EXECUTE para disparar (supabase/pendentes/04).
--
-- Produção antes desta migração (19/10): anon executava 18 funções, authenticated 34.
-- Função nova chamada pelo app logado precisa de GRANT na própria migração.
-- =====================================================================================
begin;

revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS e view
grant execute on function public.get_empresa_id() to authenticated;
grant execute on function public.filiais_visiveis() to authenticated;
grant execute on function public.is_empresa_admin(emp bigint) to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- RPC com a sessão do usuário
grant execute on function public.encerrar_impersonacao() to authenticated;
grant execute on function public.set_impersonation(p_empresa_id bigint, p_ttl_seconds integer) to authenticated;
grant execute on function public.set_super_admin(p_target uuid, p_value boolean) to authenticated;
grant execute on function public.hard_delete_empresa(p_empresa_id bigint) to authenticated;
grant execute on function public.chat_nao_lidas_por_conversa() to authenticated;
grant execute on function public.chat_marcar_lido(p_conversa text) to authenticated;
grant execute on function public.buscar_lead_por_numero(p_id bigint) to authenticated;
grant execute on function public.filial_atual() to authenticated;
grant execute on function public.filial_gravacao(p_empresa bigint) to authenticated;

-- RPC do ZapIntel (painel, lista, atendimento, insights, pós-venda, conversa)
grant execute on function public.zapintel_escopo(p_filial bigint, p_empresa bigint) to authenticated;
grant execute on function public.zapintel_resumo(p_empresa bigint) to authenticated;
grant execute on function public.zapintel_dashboard(p_filial bigint, p_empresa bigint, p_versao text) to authenticated;
grant execute on function public.zapintel_dashboard_lista(p_tipo text, p_valor text, p_filial bigint, p_empresa bigint, p_versao text) to authenticated;
grant execute on function public.zapintel_leads_lista(p_filtros jsonb, p_ordem text, p_pagina integer, p_por_pagina integer, p_filial bigint, p_empresa bigint, p_versao text) to authenticated;
grant execute on function public.zapintel_atendimento(p_dias integer, p_filial bigint, p_empresa bigint) to authenticated;
grant execute on function public.zapintel_insights(p_dias integer, p_filial bigint, p_empresa bigint) to authenticated;
grant execute on function public.zapintel_posvenda(p_filial bigint, p_empresa bigint) to authenticated;
grant execute on function public.zapintel_conversa(p_dias integer, p_filial bigint, p_empresa bigint, p_recalcular boolean) to authenticated;

-- Conferência: anon sem nenhuma, authenticated com exatamente as 22.
do $$
declare v_anon int; v_auth int;
begin
  select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')),
         count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute'))
    into v_anon, v_auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if v_anon <> 0 or v_auth <> 22 then
    raise exception 'revoke_rpc: anon executa %, authenticated executa % (esperado 0 e 22)', v_anon, v_auth;
  end if;
end $$;

commit;
