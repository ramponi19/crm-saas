-- TESTE de 20261123000300 (ganho arquivado + arquivamento) e 20261123000400 (4A) — produção, sem rastro.
-- Uso: [ANTES] + migração 0300 + migração 0400 + [DEPOIS], numa única execução. O [DEPOIS] termina
-- em RAISE EXCEPTION: tudo é desfeito e a mensagem traz os resultados.
-- Leitura do ZapIntel como o dono da JM (a632db2c…); cenários de canal na empresa 5 (demonstração).

-- [ANTES] -------------------------------------------------------------------------------------------
create temp table _t (k text primary key, v jsonb) on commit drop;
do $antes$
declare d jsonb; p int := 1; r jsonb; ids bigint[] := '{}';
begin
  perform set_config('request.jwt.claims', '{"sub":"a632db2c-c42b-4973-8008-2d5ca2dbf479","role":"authenticated"}', true);
  d := zapintel_dashboard(null, null, 'p2');
  insert into _t values ('antes_fila_parados', (select to_jsonb(sum((e->>'leads')::int)) from jsonb_array_elements(d->'inatividade') e));
  insert into _t values ('antes_clientes', jsonb_path_query_first(d, '$.**.clientesLidos'));
  insert into _t values ('antes_sem_registro', jsonb_path_query_first(d, '$.**.semRegistro'));
  insert into _t values ('antes_contagens', zapintel_leads_lista('{}'::jsonb, 'prioridade', 1, 10)->'contagens');
  -- os ganhos com ficha que não diz cliente (eram 26 + 7 restaurados)
  insert into _t values ('ganhos_nao_cliente', (select to_jsonb(array_agg(n.id order by n.id)) from negocios n
     left join zapintel_lead_perfil p on p.lead_id = n.id
     where n.empresa_id = 1 and n.status = 'ganho' and coalesce(p.perfil->>'classificacao', '') <> 'customer'));
  -- ganhos que hoje aparecem na fila de parados (30+ dias, a faixa maior)
  loop
    r := zapintel_leads_lista('{"parado":"30+"}'::jsonb, 'parados', p, 200);
    exit when jsonb_array_length(r->'leads') = 0;
    ids := ids || array(select (x->>'leadId')::bigint from jsonb_array_elements(r->'leads') x);
    p := p + 1; exit when p > 20;
  end loop;
  insert into _t values ('antes_parados30_ids', to_jsonb(ids));
end $antes$;

-- >>> aqui entram as migrações 20261123000300 e 20261123000400 <<<

-- [DEPOIS] ------------------------------------------------------------------------------------------
do $depois$
declare
  res jsonb := '{}'; d jsonb; p int; r jsonb; linhas jsonb := '[]'; ids bigint[] := '{}';
  g bigint[]; ca bigint; na bigint; ret bigint; v_owner5 uuid := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
begin
  perform set_config('request.jwt.claims', '{"sub":"a632db2c-c42b-4973-8008-2d5ca2dbf479","role":"authenticated"}', true);
  d := zapintel_dashboard(null, null, 'p2');
  res := res || jsonb_build_object(
    'fila_parados', jsonb_build_object('antes', (select v from _t where k = 'antes_fila_parados'),
                                       'depois', (select sum((e->>'leads')::int) from jsonb_array_elements(d->'inatividade') e)),
    'clientes_lidos', jsonb_build_object('antes', (select v from _t where k = 'antes_clientes'), 'depois', jsonb_path_query_first(d, '$.**.clientesLidos')),
    'sem_registro', jsonb_build_object('antes', (select v from _t where k = 'antes_sem_registro'), 'depois', jsonb_path_query_first(d, '$.**.semRegistro')),
    'contagens', jsonb_build_object('antes', (select v from _t where k = 'antes_contagens'), 'depois', zapintel_leads_lista('{}'::jsonb, 'prioridade', 1, 10)->'contagens'),
    'fila_esperando_tem_jaCliente', (select count(*) from jsonb_array_elements(d->'fila') f where f ? 'jaCliente'));

  -- a lista inteira, depois
  p := 1;
  loop
    r := zapintel_leads_lista('{}'::jsonb, 'recentes', p, 200);
    exit when jsonb_array_length(r->'leads') = 0;
    linhas := linhas || (r->'leads');
    p := p + 1; exit when p > 40;
  end loop;

  -- 1. os ganhos que não eram cliente: como aparecem agora
  g := array(select jsonb_array_elements_text((select v from _t where k = 'ganhos_nao_cliente'))::bigint);
  res := res || jsonb_build_object('ganhos_que_nao_eram_cliente', jsonb_build_object(
    'total', cardinality(g),
    'na_lista_como_cliente', (select count(*) from jsonb_array_elements(linhas) x where (x->>'leadId')::bigint = any (g) and x->>'classificacao' = 'customer'),
    'na_lista_com_outra_classe', (select count(*) from jsonb_array_elements(linhas) x where (x->>'leadId')::bigint = any (g) and x->>'classificacao' <> 'customer'),
    'fora_da_lista', (select count(*) from unnest(g) i where not exists (select 1 from jsonb_array_elements(linhas) x where (x->>'leadId')::bigint = i)),
    'fora_da_lista_motivo', (select jsonb_object_agg(motivo, n) from (
        select case when not n.ativo then 'arquivado'
                    when exists (select 1 from negocios o where o.contato_id = n.contato_id and o.filial_id is not distinct from n.filial_id and o.ativo and o.created_at > n.created_at) then 'conversa_no_negocio_mais_novo'
                    else 'sem_conversa' end motivo, count(*) n
          from negocios n where n.id = any (g) and not exists (select 1 from jsonb_array_elements(linhas) x where (x->>'leadId')::bigint = n.id)
         group by 1) m)));

  -- 2. ganhos na fila de parados (30+): antes e depois
  p := 1;
  loop
    r := zapintel_leads_lista('{"parado":"30+"}'::jsonb, 'parados', p, 200);
    exit when jsonb_array_length(r->'leads') = 0;
    ids := ids || array(select (x->>'leadId')::bigint from jsonb_array_elements(r->'leads') x);
    p := p + 1; exit when p > 20;
  end loop;
  res := res || jsonb_build_object('ganhos_na_fila_parados_30', jsonb_build_object(
    'antes', (select count(*) from negocios n where n.status = 'ganho' and n.id in (select jsonb_array_elements_text((select v from _t where k = 'antes_parados30_ids'))::bigint)),
    'depois', (select count(*) from negocios n where n.status = 'ganho' and n.id = any (ids)),
    'abertos_na_fila_antes', (select count(*) from negocios n where n.status = 'aberto' and n.id in (select jsonb_array_elements_text((select v from _t where k = 'antes_parados30_ids'))::bigint)),
    'abertos_na_fila_depois', (select count(*) from negocios n where n.status = 'aberto' and n.id = any (ids))));

  -- 3. abertos que a IA lê como cliente: agora followup + selo, e nenhum como customer
  res := res || jsonb_build_object('abertos_ia_cliente', jsonb_build_object(
    'abertos_na_lista_como_customer', (select count(*) from jsonb_array_elements(linhas) x join negocios n on n.id = (x->>'leadId')::bigint
                                        where n.status = 'aberto' and x->>'classificacao' = 'customer'),
    'abertos_com_selo_jaCliente', (select count(*) from jsonb_array_elements(linhas) x join negocios n on n.id = (x->>'leadId')::bigint
                                    where n.status = 'aberto' and (x->>'jaCliente')::boolean),
    'desses_followup', (select count(*) from jsonb_array_elements(linhas) x join negocios n on n.id = (x->>'leadId')::bigint
                         where n.status = 'aberto' and (x->>'jaCliente')::boolean and x->>'classificacao' = 'followup'),
    'ficha_ia_customer_em_aberto', (select count(*) from jsonb_array_elements(linhas) x join negocios n on n.id = (x->>'leadId')::bigint
                         join zapintel_lead_perfil pf on pf.lead_id = n.id where n.status = 'aberto' and pf.perfil->>'classificacao' = 'customer')));

  -- 4. recompra: o contato tem um ganho e um aberto novo (647 → 8242, 487 → 8246)
  res := res || jsonb_build_object('recompra', (select jsonb_object_agg(x->>'leadId', jsonb_build_object('classe', x->>'classificacao', 'jaCliente', x->'jaCliente'))
                                               from jsonb_array_elements(linhas) x where (x->>'leadId')::bigint in (647, 8242, 487, 8246, 1007, 8244)));

  -- 5. pós-venda e insights continuam respondendo
  res := res || jsonb_build_object('posvenda_total', zapintel_posvenda(null, null)->'total',
                                   'insights_ok', (zapintel_insights(30, null, null) is not null));

  -- 6. M1b: ganho ARQUIVADO dentro da janela recebe a mensagem (empresa 5)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner5, 'role', 'authenticated')::text, true);
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1b arquivado') returning id into ca;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, ca, 10, 76, 'ganho', now() - interval '1 hour', '{"_lead":{"ativo":false}}') returning id into na;
  ret := core_negocio_do_canal(5, ca, 1, 'chegou certinho');
  res := res || jsonb_build_object('m1b_ganho_arquivado_na_janela', jsonb_build_object(
    'devolveu_o_ganho', ret = na, 'negocios_do_contato', (select count(*) from negocios where contato_id = ca),
    'status', (select status from negocios where id = na)));

  -- 7. M1b: arquivar e desarquivar vão para o histórico com o usuário
  update negocios set dados = jsonb_set(dados, '{_lead,ativo}', 'true') where id = na;
  update negocios set dados = jsonb_set(dados, '{_lead,ativo}', 'false') where id = na;
  update negocios set dados = jsonb_set(dados, '{_lead,primeira_msg}', '"x"') where id = na;  -- sem mudar ativo: não grava
  res := res || jsonb_build_object('m1b_historico_arquivamento', (select jsonb_agg(jsonb_build_object('acao', acao, 'por_usuario', por_usuario) order by id)
                                                                 from negocio_historico where negocio_id = na and acao in ('arquivado', 'desarquivado')));

  raise exception 'RESULTADO_TESTE_4A %', res::text;
end $depois$;
