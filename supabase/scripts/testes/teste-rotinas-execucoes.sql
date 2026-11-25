-- Teste da 20261125000600_rotinas_execucoes (entrega 1.1r). Bloco que termina com RAISE: tudo é desfeito; o
-- resultado volta em RESULTADO_TESTE_ROTINAS {...}.
-- Usuários da semente: a632db2c… dono da JM de teste; 0e5e…0001 vendedor da Demonstração (vira superadmin só aqui).
do $teste$
declare
  r jsonb := '{}';
  e text;
  v jsonb;
  v_id bigint;
  v_n int;
  v_dono1 constant text := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  v_super constant uuid := '0e5e0000-0000-4000-8000-000000000001';
  v_ini timestamptz := now() - interval '1 second';
begin
  -- 1. envelope: uma empresa com erro marca a execução 'com_erro', com a empresa e a mensagem
  v := rotina_registrar('posvenda-rotina-diaria', v_ini,
         '{"1": {"3": {"perdidos_por_tolerancia": 0}}, "5": {"erro": "deu ruim na 5"}}'::jsonb);
  select id into v_id from rotinas_execucoes where rotina = 'posvenda-rotina-diaria' and origem = 'sql' order by id desc limit 1;
  r := r || jsonb_build_object(
    't1_devolve_igual', v = '{"1": {"3": {"perdidos_por_tolerancia": 0}}, "5": {"erro": "deu ruim na 5"}}'::jsonb,
    't1_execucao', (select jsonb_build_object('status', status, 'total', empresas_total, 'com_erro', empresas_erro, 'erro', erro, 'tem_fim', fim is not null)
                      from rotinas_execucoes where id = v_id),
    't1_empresas', (select jsonb_agg(jsonb_build_object('empresa', empresa_id, 'status', status, 'erro', erro) order by empresa_id)
                      from rotinas_execucoes_empresas where execucao_id = v_id));

  -- 2. sem erro: 'ok'
  perform rotina_registrar('liberacao-diaria-esteira', v_ini, '{"1": {"3": {"pulado": "já liberado hoje"}, "6": {"liberados": 10}}}'::jsonb);
  r := r || jsonb_build_object('t2_ok', (select status from rotinas_execucoes where rotina = 'liberacao-diaria-esteira' order by id desc limit 1));

  -- 3. nunca levanta erro: resultado que não é objeto vira resumo; rotina nula (insert falha) só avisa
  v := rotina_registrar('liberacao-diaria-esteira', v_ini, '"texto solto"'::jsonb);
  r := r || jsonb_build_object('t3_texto_igual', v = '"texto solto"'::jsonb,
    't3_resumo', (select resumo from rotinas_execucoes where rotina = 'liberacao-diaria-esteira' order by id desc limit 1));
  select count(*) into v_n from rotinas_execucoes;
  begin v := rotina_registrar(null, v_ini, '{"1": {}}'::jsonb); e := 'devolveu'; exception when others then e := 'levantou'; end;
  r := r || jsonb_build_object('t3_rotina_nula', e, 't3_nada_gravado', v_n = (select count(*) from rotinas_execucoes));

  -- 4. rota: abrir e fechar; empresa com erro vira 'com_erro'; exceção vira 'falhou'
  v_id := rotina_execucao_abrir('ponte-vendas');
  r := r || jsonb_build_object('t4_aberta', (select status from rotinas_execucoes where id = v_id));
  perform rotina_execucao_fechar(v_id, 'ok', '{"ok": false}', '[{"empresa": 1, "status": "ok", "contagens": {"vendas": 3}}, {"empresa": 5, "status": "erro", "erro": "timeout"}]', null);
  r := r || jsonb_build_object('t4_fechada', (select jsonb_build_object('status', status, 'total', empresas_total, 'com_erro', empresas_erro) from rotinas_execucoes where id = v_id));
  v_id := rotina_execucao_abrir('automacoes-hora');
  perform rotina_execucao_fechar(v_id, 'falhou', null, null, 'Erro no cron');
  r := r || jsonb_build_object('t4_falhou', (select status || ':' || erro from rotinas_execucoes where id = v_id));
  -- fechar de novo não muda nada (só fecha o que está 'rodando')
  perform rotina_execucao_fechar(v_id, 'ok', null, null, null);
  r := r || jsonb_build_object('t4_fecha_uma_vez', (select status from rotinas_execucoes where id = v_id));

  -- 5. conferidor: rota que ficou 'rodando' mais de 30 min vira 'falhou'; idempotente
  insert into rotinas_execucoes (rotina, origem, inicio, status) values ('lgpd-exportacoes-limpar', 'http', now() - interval '40 minutes', 'rodando') returning id into v_id;
  v := rotinas_conferir();
  r := r || jsonb_build_object('t5_vencida', (select status from rotinas_execucoes where id = v_id),
    't5_segunda_vez', (rotinas_conferir() ->> 'rodando_vencidas')::int);

  -- 6. jobs: a mesma chamada, agora envolvida; conferidor agendado
  r := r || jsonb_build_object(
    't6_posvenda_envolvido', (select command ~ 'rotina_registrar\(''posvenda-rotina-diaria'', now\(\), public\.posvenda_rotina_diaria\(\)\)' from cron.job where jobname = 'posvenda-rotina-diaria'),
    't6_posvenda_agenda', (select schedule from cron.job where jobname = 'posvenda-rotina-diaria'),
    't6_liberacao_envolvido', (select command ~ 'rotina_registrar\(''liberacao-diaria-esteira'', now\(\), public\.core_liberar_lotes_do_dia\(\)\)' from cron.job where jobname = 'liberacao-diaria-esteira'),
    't6_liberacao_agenda', (select schedule from cron.job where jobname = 'liberacao-diaria-esteira'),
    't6_conferidor', (select schedule from cron.job where jobname = 'rotinas-conferir'));

  -- 7. privilégios: ninguém da API grava nem chama as funções internas
  r := r || jsonb_build_object(
    't7_insert_authenticated', has_table_privilege('authenticated', 'public.rotinas_execucoes', 'insert'),
    't7_registrar_authenticated', has_function_privilege('authenticated', 'public.rotina_registrar(text,timestamptz,jsonb)', 'execute'),
    't7_abrir_authenticated', has_function_privilege('authenticated', 'public.rotina_execucao_abrir(text)', 'execute'),
    't7_conferir_authenticated', has_function_privilege('authenticated', 'public.rotinas_conferir()', 'execute'),
    't7_situacao_anon', has_function_privilege('anon', 'public.rotinas_situacao()', 'execute'));

  -- 8. dono de empresa: não lê as execuções nem a situação
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('t8_dono_le_execucoes', (select count(*) from rotinas_execucoes));
  begin v := rotinas_situacao(); e := 'leu'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('t8_dono_situacao', e);
  execute 'reset role';

  -- 9. superadmin: vê a situação com os problemas; "marcar como visto" tira o problema da lista
  execute 'alter table usuarios disable trigger trg_prevent_privilege_escalation';
  update usuarios set is_super_admin = true where id = v_super;
  execute 'alter table usuarios enable trigger trg_prevent_privilege_escalation';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  v := rotinas_situacao();
  r := r || jsonb_build_object(
    't9_rotinas_no_catalogo', jsonb_array_length(v -> 'rotinas'),
    't9_problemas', (select jsonb_agg(p ->> 'rotina' || ':' || (p ->> 'status') order by p ->> 'rotina') from jsonb_array_elements(v -> 'problemas') p),
    't9_empresa_com_erro', (select p -> 'empresas' -> 0 ->> 'erro' from jsonb_array_elements(v -> 'problemas') p where p ->> 'rotina' = 'posvenda-rotina-diaria'),
    't9_le_execucoes', (select count(*) > 0 from rotinas_execucoes));
  perform rotina_execucao_reconhecer(((select p from jsonb_array_elements(v -> 'problemas') p where p ->> 'rotina' = 'posvenda-rotina-diaria') ->> 'id')::bigint);
  r := r || jsonb_build_object('t9_depois_de_visto', (select jsonb_agg(p ->> 'rotina' order by p ->> 'rotina') from jsonb_array_elements(rotinas_situacao() -> 'problemas') p));
  execute 'reset role';

  -- 10. atraso: rotina do catálogo criada há mais tempo que o intervalo e sem execução fica atrasada;
  --     condicional sem execução não fica; recém-criada não fica
  update rotinas set criado_em = now() - interval '3 days' where nome in ('sync-stripe', 'entrada-parada');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  v := rotinas_situacao();
  r := r || jsonb_build_object(
    't10_sync_stripe', (select jsonb_build_object('atrasada', x -> 'atrasada', 'motivo', x ->> 'motivo_atraso') from jsonb_array_elements(v -> 'rotinas') x where x ->> 'nome' = 'sync-stripe'),
    't10_reter_audio_recente', (select x -> 'atrasada' from jsonb_array_elements(v -> 'rotinas') x where x ->> 'nome' = 'reter-audio'));

  raise exception 'RESULTADO_TESTE_ROTINAS %', r::text;
end $teste$;
