-- Teste do passo A, item 6 (20261020000000_revoke_rpc.sql), numa cópia do banco.
-- Faz como o app logado (dono da JM, role authenticated, sob RLS): lê as tabelas que
-- as telas leem, grava e apaga um lead (gatilhos disparam), e chama cada RPC que o
-- código chama com a sessão. Tudo é desfeito no fim. FALHA se qualquer passo der
-- "permissão negada"; erro de outra natureza (regra de negócio) só é listado.
-- Uso: psql -v ON_ERROR_STOP=1 -d <copia> -f supabase/testes/revoke_rpc.sql
\set ON_ERROR_STOP on
begin;

create temp table _r (passo text, ok boolean, detalhe text) on commit drop;
grant all on _r to authenticated, anon, service_role;

do $$
declare
  v_dono uuid := (select usuario_id from empresa_usuarios where empresa_id = 1 and role = 'owner' and ativo limit 1);
  v_lead bigint;
  c text;
  chamadas text[] := array[
    'select count(*) from leads', 'select count(*) from clientes', 'select count(*) from lead_mensagens',
    'select count(*) from vendas', 'select count(*) from inventario_unidades', 'select count(*) from tarefas',
    'select count(*) from configuracoes_sistema', 'select count(*) from funil_etapas', 'select count(*) from empresas',
    'select count(*) from v_leads_nao_lidas', 'select count(*) from v_empresas_plano',
    'select get_empresa_id()', 'select filiais_visiveis()', 'select filial_atual()', 'select is_super_admin()',
    'select is_empresa_admin(1)', 'select filial_gravacao(1)',
    'select count(*) from chat_nao_lidas_por_conversa()', $q$select chat_marcar_lido('mural')$q$,
    'select count(*) from buscar_lead_por_numero(1)',
    'select zapintel_escopo(null, 1)', 'select zapintel_resumo(1)',
    $q$select zapintel_dashboard(null, 1, 'p2')$q$,
    $q$select zapintel_dashboard_lista('classe', 'sem_resposta', null, 1, 'p2')$q$,
    $q$select zapintel_leads_lista('{}'::jsonb, 'recentes', 1, 20, null, 1, 'p2')$q$,
    'select zapintel_atendimento(30, null, 1)', 'select zapintel_insights(30, null, 1)',
    'select zapintel_posvenda(null, 1)', 'select zapintel_conversa(30, null, 1, false)'];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_dono, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_dono::text, true);
  execute 'set local role authenticated';

  foreach c in array chamadas loop
    begin
      execute c;
      insert into _r values (c, true, null);
    exception when others then
      insert into _r values (c, sqlerrm !~* '(permission denied|permissão negada)', sqlerrm);
    end;
  end loop;

  begin
    insert into leads (empresa_id, nome, telefone, origem, kanban_status)
      values (1, 'Teste revoke', '19999990002', 'manual', 'novo') returning id into v_lead;
    update leads set valor_estimado = 10 where id = v_lead;
    insert into lead_mensagens (lead_id, empresa_id, direcao, conteudo) values (v_lead, 1, 'recebida', 'oi');
    delete from leads where id = v_lead;
    raise exception 'desfazer';
  exception when others then
    -- a linha de resultado vai DEPOIS do bloco desfeito, senão some junto
    insert into _r values ('insert/update/delete de lead e mensagem (gatilhos)',
      sqlerrm = 'desfazer' or sqlerrm !~* '(permission denied|permissão negada)',
      nullif(sqlerrm, 'desfazer'));
  end;
  execute 'reset role';
end $$;

-- Quem fica com o quê
insert into _r
select 'anon executa ' || count(*) || ' funções', count(*) = 0, string_agg(p.proname, ', ')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
insert into _r
select 'service_role executa rate_limit_bump e fundir_clientes',
       has_function_privilege('service_role', 'public.rate_limit_bump(text,timestamptz)', 'execute')
       and has_function_privilege('service_role', 'public.fundir_clientes(bigint,bigint,bigint)', 'execute'), null;

select passo, ok, detalhe from _r order by ok, passo;
do $$ begin
  if exists (select 1 from _r where not ok) then raise exception 'revoke_rpc: há passo com permissão negada (ver acima)'; end if;
end $$;
rollback;
