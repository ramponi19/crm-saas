-- Teste da 20261124002200_posvenda_universal. JM de teste (empresa 1, loja 3, vendedor M1, administrador A). Termina com RAISE.
-- 1. datas pela âncora (venda, data fixa, campo de data, uso) e repetição, sem depender de hoje (vendas em datas fixas);
-- 2. filtros por campo; 3. a jornada nasce com as âncoras novas; 4. repetição ao sair da fila; 5. uso informado recalcula;
-- 6. travas; 7. privilégios.
do $t$
declare
  res jsonb := '{}'; M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  hoje date := posvenda_dia_local(1, now());
  cad bigint; ct bigint; n bigint; n2 bigint; n3 bigint; e text; v jsonb; x bigint;
  p_venda bigint; p_rep bigint; p_mes bigint; p_fixa bigint; p_bis bigint; p_campo bigint; p_aniv bigint; p_uso bigint; p_uso_campo bigint;
  p_filtro_sim bigint; p_filtro_nao bigint; p_sem_campo bigint;
begin
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  update posvenda_cadencias set ativo = false where empresa_id = 1;

  -- os campos que a régua usa (dados só aceita chave cadastrada, no tipo dela)
  insert into campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, modulo_dono, obrigatorio_na_venda) values
    (1, 'negocio', 'km', 'Quilometragem', 'numero', 'posvenda', true), (1, 'negocio', 'km_dia', 'Km por dia', 'numero', 'posvenda', false),
    (1, 'negocio', 'cor', 'Cor', 'texto', 'posvenda', false), (1, 'negocio', 'revisao_em', 'Próxima revisão', 'data', 'posvenda', false),
    (1, 'negocio', 'placa', 'Placa', 'texto', 'posvenda', false), (1, 'negocio', 'garantia_fim', 'Fim da garantia', 'data', 'posvenda', false),
    (1, 'contato', 'aniversario', 'Aniversário', 'data', 'posvenda', false)
  on conflict (empresa_id, entidade, chave) do update set ativo = true, tipo = excluded.tipo;
  insert into posvenda_cadencias (empresa_id, nome, prioridade) values (1, 'Régua universal', 50) returning id into cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, cad, 1, 30, 'whatsapp', 'venda D+30') returning id into p_venda;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, repetir_intervalo, repetir_unidade, repetir_max)
    values (1, cad, 2, 30, 'ligacao', 'a cada 30 dias, até 3', 30, 'dias', 3) returning id into p_rep;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, repetir_intervalo, repetir_unidade)
    values (1, cad, 3, 0, 'tarefa_interna', 'todo mês no dia da venda', 1, 'meses') returning id into p_mes;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_mes_dia, repetir_intervalo, repetir_unidade)
    values (1, cad, 4, -5, 'whatsapp', '5 dias antes do Natal', 'data_fixa', '12-25', 12, 'meses') returning id into p_fixa;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_mes_dia)
    values (1, cad, 5, 0, 'tarefa_interna', '29/02', 'data_fixa', '02-29') returning id into p_bis;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo)
    values (1, cad, 6, -7, 'ligacao', 'uma semana antes da revisão', 'campo_data', 'revisao_em') returning id into p_campo;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo, repetir_intervalo, repetir_unidade)
    values (1, cad, 7, 0, 'whatsapp', 'aniversário', 'campo_data', 'aniversario', 12, 'meses') returning id into p_aniv;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo, uso_alvo, uso_ritmo_padrao, repetir_intervalo, repetir_unidade)
    values (1, cad, 8, 0, 'ligacao', 'a cada 10 mil', 'uso', 'km', 10000, 50, 1, 'dias') returning id into p_uso;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo, uso_alvo, uso_ritmo_padrao, uso_ritmo_campo)
    values (1, cad, 9, 0, 'ligacao', 'ritmo do campo', 'uso', 'km', 10000, 50, 'km_dia') returning id into p_uso_campo;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, filtros)
    values (1, cad, 10, 2, 'whatsapp', 'só azul', '{"campos":[{"chave":"cor","op":"igual","valor":"Azul"},{"chave":"km","op":"maior","valor":"5000"}]}') returning id into p_filtro_sim;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, filtros)
    values (1, cad, 11, 2, 'whatsapp', 'só com placa', '{"campos":[{"chave":"placa","op":"preenchido"}]}') returning id into p_filtro_nao;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo)
    values (1, cad, 12, 0, 'ligacao', 'campo vazio', 'campo_data', 'garantia_fim') returning id into p_sem_campo;

  -- 1. datas pela âncora: venda em 10/03/2026 (dia local), km 10.000, revisão em 01/06/2026; cliente nascido em 15/08/1990
  insert into contatos (empresa_id, filial_id, nome, dados) values (1, 3, 'Universal', '{"aniversario":"1990-08-15"}') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, (date '2026-03-10' + time '12:00') at time zone 'America/Sao_Paulo',
            '{"_lead":{"ativo":true},"km":10000,"km_dia":100,"cor":"azul","revisao_em":"2026-06-01","venda":{"data":"2026-03-10","condicao":"novo","valor":1000}}')
    returning id into n;
  res := res || jsonb_build_object('1_datas', jsonb_build_object(
    'venda_d30', posvenda_data_do_passo(n, p_venda),
    'repetir_3a', posvenda_data_do_passo(n, p_rep, 3),
    'mes_2a', posvenda_data_do_passo(n, p_mes, 2),
    'mes_12a', posvenda_data_do_passo(n, p_mes, 12),
    'natal', posvenda_data_do_passo(n, p_fixa),
    'natal_2a', posvenda_data_do_passo(n, p_fixa, 2),
    'bissexto', posvenda_data_do_passo(n, p_bis),
    'revisao', posvenda_data_do_passo(n, p_campo),
    'aniversario_1a', posvenda_data_do_passo(n, p_aniv),
    'aniversario_2a', posvenda_data_do_passo(n, p_aniv, 2),
    'uso_padrao', posvenda_data_do_passo(n, p_uso),
    'uso_padrao_2a', posvenda_data_do_passo(n, p_uso, 2),
    'uso_campo', posvenda_data_do_passo(n, p_uso_campo),
    'campo_vazio', posvenda_data_do_passo(n, p_sem_campo)));
  -- leitura: 15.000 km em 30/04 (50 dias, 100 km/dia) → o 1º alvo (20.000) cai 50 dias depois
  insert into posvenda_uso_leituras (empresa_id, negocio_id, campo, valor, em) values (1, n, 'km', 15000, date '2026-04-29');
  res := res || jsonb_build_object('1_uso_com_leitura', posvenda_data_do_passo(n, p_uso));

  -- 2. filtros por campo
  res := res || jsonb_build_object('2_filtros', jsonb_build_object(
    'azul_e_km', posvenda_passo_filtra(n, (select filtros from posvenda_cadencia_passos where id = p_filtro_sim)),
    'placa', posvenda_passo_filtra(n, (select filtros from posvenda_cadencia_passos where id = p_filtro_nao)),
    'sem_filtro', posvenda_passo_filtra(n, '{}'),
    'contem', posvenda_passo_filtra(n, '{"campos":[{"chave":"cor","op":"contem","valor":"zu"}]}'),
    'menor', posvenda_passo_filtra(n, '{"campos":[{"chave":"km","op":"menor","valor":"9000"}]}'),
    'do_cliente', posvenda_passo_filtra(n, '{"campos":[{"chave":"aniversario","op":"preenchido"}]}')));

  -- 3. a jornada de uma venda de 100 dias atrás: o passo que repete nasce na 1ª ocorrência de hoje em diante
  insert into contatos (empresa_id, filial_id, nome, dados) values (1, 3, 'Universal 2', '{}') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, ((hoje - 100) + time '12:00') at time zone 'America/Sao_Paulo',
            jsonb_build_object('_lead', jsonb_build_object('ativo', true), 'km', 1000, 'cor', 'Azul',
              'venda', jsonb_build_object('data', (hoje - 100)::text, 'condicao', 'novo', 'valor', 1000)))
    returning id into n2;
  perform posvenda_iniciar_jornadas(n2);
  res := res || jsonb_build_object('3_jornada', jsonb_build_object(
    'passos', (select jsonb_object_agg(pp.titulo, a.ocorrencia) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n2),
    'mensal_na_ocorrencia_de_hoje_em_diante', (select a.ocorrencia from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_mes),
    'todos_de_hoje_em_diante', (select bool_and(posvenda_dia_local(1, a.previsto_para) >= hoje) from posvenda_acompanhamentos a where a.negocio_id = n2)));

  -- 4. repetição: o passo de 30 em 30 dias (ocorrência 4 > máximo 3) não repete; o mensal repete ao ser feito
  update posvenda_acompanhamentos set status = 'feito', feito_em = now() where negocio_id = n2 and passo_id = p_mes;
  update posvenda_acompanhamentos set status = 'pulado', motivo = 'teste' where negocio_id = n2 and passo_id = p_uso;
  res := res || jsonb_build_object('4_repeticao', jsonb_build_object(
    'mensal', (select jsonb_agg(a.status || ':' || a.ocorrencia order by a.ocorrencia) from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_mes),
    'mensal_proxima_30_dias_depois', (select max(posvenda_dia_local(1, a.previsto_para)) - min(posvenda_dia_local(1, a.previsto_para)) between 25 and 35
                                        from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_mes),
    'uso_pulado_repete', (select jsonb_agg(a.status || ':' || a.ocorrencia order by a.ocorrencia) from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_uso)));
  -- máximo de repetições: a 2ª ocorrência feita gera a 3ª; a 3ª (máximo 3) não gera a 4ª
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia)
    select 1, 3, a.jornada_id, p_rep, a.contato_id, n2, M1, 'manual', now(), 2 from posvenda_acompanhamentos a where a.negocio_id = n2 limit 1;
  update posvenda_acompanhamentos set status = 'feito' where negocio_id = n2 and passo_id = p_rep and ocorrencia = 2;
  update posvenda_acompanhamentos set status = 'feito' where negocio_id = n2 and passo_id = p_rep and ocorrencia = 3;
  res := res || jsonb_build_object('4_maximo', (select jsonb_agg(a.status || ':' || a.ocorrencia order by a.ocorrencia) from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_rep),
    '4_atrasada_vai_para_amanha', (select posvenda_dia_local(1, a.previsto_para) > hoje from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_rep and ocorrencia = 3));
  -- feito de novo: não duplica a próxima
  update posvenda_acompanhamentos set status = 'pendente' where negocio_id = n2 and passo_id = p_mes and ocorrencia = 1;
  update posvenda_acompanhamentos set status = 'feito' where negocio_id = n2 and passo_id = p_mes and ocorrencia = 1;
  res := res || jsonb_build_object('4_nao_duplica', (select count(*) from posvenda_acompanhamentos a where a.negocio_id = n2 and a.passo_id = p_mes));

  -- 5. uso informado (sessão): o vendedor de outro cliente não pode; o responsável pode e o passo de uso é recalculado
  insert into contatos (empresa_id, filial_id, nome, dados) values (1, 3, 'Universal 3', '{}') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, ((hoje - 10) + time '12:00') at time zone 'America/Sao_Paulo',
            jsonb_build_object('_lead', jsonb_build_object('ativo', true), 'km', 0,
              'venda', jsonb_build_object('data', (hoje - 10)::text, 'condicao', 'novo', 'valor', 1000)))
    returning id into n3;
  perform posvenda_iniciar_jornadas(n3);
  -- 0 km + 50/dia → 10.000 em 200 dias
  res := res || jsonb_build_object('5_antes', (select posvenda_dia_local(1, previsto_para) - (hoje - 10) between 200 and 204 from posvenda_acompanhamentos where negocio_id = n3 and passo_id = p_uso));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M2, 'role', 'authenticated')::text, true);
  begin
    perform posvenda_uso_registrar(n3, 'km', 5000);
    e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1);
  end;
  res := res || jsonb_build_object('5_outro_vendedor', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  begin
    perform posvenda_uso_registrar(n3, 'km', -1);
    e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1);
  end;
  res := res || jsonb_build_object('5_negativo', e);
  -- 5.000 km em 10 dias = 500/dia → faltam 5.000 → 10 dias de hoje
  v := posvenda_uso_registrar(n3, 'km', 5000);
  res := res || jsonb_build_object('5_recalculou', v,
    '5_depois', (select posvenda_dia_local(1, previsto_para) - hoje between 10 and 14 from posvenda_acompanhamentos where negocio_id = n3 and passo_id = p_uso),
    '5_leitura', (select count(*) from posvenda_uso_leituras where negocio_id = n3));
  perform set_config('request.jwt.claims', '', true);

  -- 6. travas
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, cad, 90, -1, 'tarefa_interna', 'x');
    e := 'passou';
  exception when check_violation then e := 'barrado';
  end;
  res := res || jsonb_build_object('6_venda_negativo', e);
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_mes_dia) values (1, cad, 91, 0, 'tarefa_interna', 'x', 'data_fixa', '13-01');
    e := 'passou';
  exception when check_violation then e := 'barrado';
  end;
  res := res || jsonb_build_object('6_mes_invalido', e);
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_campo) values (1, cad, 92, 0, 'tarefa_interna', 'x', 'uso', 'km');
    e := 'passou';
  exception when check_violation then e := 'barrado';
  end;
  res := res || jsonb_build_object('6_uso_sem_alvo', e);
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, repetir_intervalo) values (1, cad, 93, 0, 'tarefa_interna', 'x', 5);
    e := 'passou';
  exception when check_violation then e := 'barrado';
  end;
  res := res || jsonb_build_object('6_repetir_sem_unidade', e);

  -- 7. privilégios: cálculo só no servidor; o registro de uso pela sessão; categorias próprias com RLS
  res := res || jsonb_build_object('7_privilegios', jsonb_build_object(
    'data_do_passo', has_function_privilege('authenticated', 'posvenda_data_do_passo(bigint,bigint,integer)', 'execute'),
    'uso_registrar', has_function_privilege('authenticated', 'posvenda_uso_registrar(bigint,text,numeric,date)', 'execute'),
    'uso_anon', has_function_privilege('anon', 'posvenda_uso_registrar(bigint,text,numeric,date)', 'execute'),
    'categorias_rls', (select relrowsecurity from pg_class where oid = 'public.posvenda_categorias_venda'::regclass),
    'leituras_sem_escrita', not has_table_privilege('authenticated', 'public.posvenda_uso_leituras', 'insert')));
  raise exception 'RESULTADO_TESTE_UNIVERSAL %', res::text;
end $t$;
