-- Teste da 20261124002300_posvenda_revisao. JM de teste (empresa 1, loja 3, M1/M2 vendedores, A admin) e empresa 5.
-- Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}'; M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  A uuid := '0e5e0000-0000-4000-8000-000000000201'; hoje date := posvenda_dia_local(1, now());
  cad bigint; cad5 bigint; cadr bigint; ct bigint; n1 bigint; n2 bigint; n3 bigint; x bigint; y bigint; err text; v jsonb;
  p_rep bigint; p_d1 bigint; p_d40 bigint;

begin
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  update posvenda_cadencias set ativo = false where empresa_id = 1;

  -- 1. passo na régua de outra empresa: recusado (mesmo como serviço); responsável de fora da empresa: recusado
  insert into empresa_modulos (empresa_id, modulo, ativo) values (5, 'posvenda', true) on conflict (empresa_id, modulo) do update set ativo = true;
  insert into posvenda_cadencias (empresa_id, nome) values (5, 'Régua da empresa 5') returning id into cad5;
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, cad5, 1, 1, 'whatsapp', 'intruso');
    err := 'passou';
  exception when others then err := split_part(sqlerrm, ':', 1);
  end;
  res := res || jsonb_build_object('1_passo_em_regua_alheia', err);
  insert into posvenda_cadencias (empresa_id, nome, prioridade, filtros, ao_recomprar) values (1, 'Revisão', 50, '{"categorias":[1]}', 'reiniciar') returning id into cad;
  begin
    insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, responsavel)
      values (1, cad, 90, 1, 'ligacao', 'x', 'usuario:' || (select usuario_id from empresa_usuarios where empresa_id = 5 limit 1));
    err := 'passou';
  exception when others then err := split_part(sqlerrm, ':', 1);
  end;
  res := res || jsonb_build_object('1_responsavel_de_fora', err);

  -- régua: D+1 por M2 (manual), D+40 do produto, mensal que repete
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, responsavel)
    values (1, cad, 1, 1, 'ligacao', 'D+1 M2', 'usuario:' || M2) returning id into p_d1;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, grupo)
    values (1, cad, 2, 40, 'whatsapp', 'D+40 produto', 'produto') returning id into p_d40;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, repetir_intervalo, repetir_unidade)
    values (1, cad, 3, 0, 'tarefa_interna', 'mensal', 1, 'meses') returning id into p_rep;

  -- 7. responsável manual inativo: o passo segue a regra padrão
  update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = M2;
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Revisão 1') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, now(), jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n1;
  res := res || jsonb_build_object('7_responsavel_inativo', (select origem_responsavel || ':' || (responsavel_id = M2)::text from posvenda_acompanhamentos where negocio_id = n1 and passo_id = p_d1));
  update empresa_usuarios set ativo = true where empresa_id = 1 and usuario_id = M2;

  -- 4. juntado: o principal feito leva o juntado junto (e o juntado repete)
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, now(), jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n2;
  select id into x from posvenda_acompanhamentos where negocio_id = n1 and passo_id = p_rep;
  select id into y from posvenda_acompanhamentos where negocio_id = n2 and passo_id = p_rep;
  res := res || jsonb_build_object('4_juntado_antes', (select status from posvenda_acompanhamentos where id = y),
    '2_reiniciar_produto_da_1a', (select status || ':' || coalesce(motivo, '') from posvenda_acompanhamentos where negocio_id = n1 and passo_id = p_d40));
  update posvenda_acompanhamentos set status = 'feito', feito_em = now(), resultado = 'ok' where id = x;
  res := res || jsonb_build_object('4_juntado_depois', (select status || ':' || coalesce(resultado, '') from posvenda_acompanhamentos where id = y),
    '4_juntado_repete', (select count(*) from posvenda_acompanhamentos where negocio_id = n2 and passo_id = p_rep and ocorrencia = 2));

  -- 2. ao_recomprar: manter não mexe; encerrar cancela os pendentes e conclui a jornada anterior
  update posvenda_cadencias set ao_recomprar = 'manter' where id = cad;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, now(), jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n3;
  res := res || jsonb_build_object('2_manter_produto_da_2a', (select status from posvenda_acompanhamentos where negocio_id = n2 and passo_id = p_d40));
  update posvenda_cadencias set ao_recomprar = 'encerrar' where id = cad;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, now(), jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1)));
  res := res || jsonb_build_object('2_encerrar', jsonb_build_object(
    'jornada_da_3a', (select status || ':' || coalesce(motivo_fim, '') from posvenda_jornadas where negocio_id = n3),
    'pendentes_da_3a', (select count(*) from posvenda_acompanhamentos where negocio_id = n3 and status = 'pendente')));

  -- 3. reancorar: a venda passa a ser de 40 dias atrás e depois volta para hoje
  update posvenda_cadencias set ao_recomprar = 'reiniciar' where id = cad;
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Revisão 2') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, now(), jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', hoje::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n1;
  perform set_config('nexus.corrigir_data_venda', n1::text, true);
  update negocios set ganho_em = ((hoje - 45) + time '12:00') at time zone 'America/Sao_Paulo' where id = n1;
  perform posvenda_reancorar_jornada(n1);
  v := (select jsonb_object_agg(pp.titulo, a.status || ':oc' || a.ocorrencia) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n1 and a.status <> 'cancelado');
  perform posvenda_reancorar_jornada(n1);
  res := res || jsonb_build_object('3_para_tras', v,
    '3_idempotente', v = (select jsonb_object_agg(pp.titulo, a.status || ':oc' || a.ocorrencia) from posvenda_acompanhamentos a join posvenda_cadencia_passos pp on pp.id = a.passo_id where a.negocio_id = n1 and a.status <> 'cancelado'),
    '3_mensal_dias', (select posvenda_dia_local(1, previsto_para) - hoje between 0 and 33 from posvenda_acompanhamentos where negocio_id = n1 and passo_id = p_rep and status = 'pendente'));
  update negocios set ganho_em = now() where id = n1;
  perform posvenda_reancorar_jornada(n1);
  res := res || jsonb_build_object('3_para_frente_nascem', (select count(*) from posvenda_acompanhamentos where negocio_id = n1 and passo_id = p_d1 and status = 'pendente'));
  perform set_config('nexus.corrigir_data_venda', '', true);

  -- 5. ativar vendas antigas: com passo que repete, venda de 400 dias entra
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Revisão 3') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, ((hoje - 400) + time '12:00') at time zone 'America/Sao_Paulo', jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', (hoje - 400)::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n2;
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  perform posvenda_ativar_existentes(1);
  res := res || jsonb_build_object('5_antiga_com_repeticao', (select ocorrencia > 1 from posvenda_acompanhamentos where negocio_id = n2 and passo_id = p_rep));

  -- 6. data fixa com ajuste negativo perto da âncora: venda em 22/12, passo "5 dias antes do Natal" → próximo ano
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Datas') returning id into cadr;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, ancora_tipo, ancora_mes_dia)
    values (1, cadr, 1, -5, 'whatsapp', 'natal', 'data_fixa', '12-25') returning id into x;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, (date '2026-12-22' + time '12:00') at time zone 'America/Sao_Paulo', jsonb_build_object('_lead', jsonb_build_object('ativo', false),
      'venda', jsonb_build_object('data', '2026-12-22', 'categoria_id', 2, 'condicao', 'novo', 'valor', 1))) returning id into n3;
  res := res || jsonb_build_object('6_natal_depois_da_venda', posvenda_data_do_passo(n3, x));

  -- 8. NPS com a pesquisa desativada
  update posvenda_pesquisas set ativo = false where empresa_id = 1 and tipo = 'nps';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  begin
    v := posvenda_nps_registrar(n1, 9, null, null, 'manual');
    err := 'ok';
  exception when others then err := split_part(sqlerrm, ':', 1);
  end;
  perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('8_nps_pesquisa_desativada', err);

  res := res || jsonb_build_object('9_so_servidor', has_function_privilege('authenticated', 'posvenda_nascer_passo(bigint,bigint,bigint)', 'execute'));
  raise exception 'RESULTADO_TESTE_REVISAO %', res::text;
end $t$;
