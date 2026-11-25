-- Teste da 20261124000600_posvenda_pendencias_venda (C4). Empresa 5, admin 96867cc0… Termina com RAISE.
do $t$
declare
  res jsonb := '{}';
  ADM uuid := '96867cc0-8331-4c79-be63-09a313b35ea0';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  ct bigint; n bigint; n2 bigint;
begin
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'C4 teste') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, ct, 10, 73, 'aberto', '{"_lead":{"ativo":true}}') returning id into n;
  update negocios set status = 'ganho', etapa_id = 76, ganho_em = (hoje + time '12:00') at time zone 'America/Sao_Paulo',
         dados = dados || jsonb_build_object('venda', jsonb_build_object('data', hoje::text, 'categoria_id', 16, 'condicao', 'novo', 'valor', 5000))
   where id = n;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, ct, 10, 73, 'aberto', '{"_lead":{"ativo":true}}') returning id into n2;
  update negocios set status = 'ganho', etapa_id = 76, ganho_em = (hoje + time '12:00') at time zone 'America/Sao_Paulo' where id = n2;  -- ganho antigo, sem dados.venda

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- 1. corrigir a data: dados.venda.data acompanha o ganho_em
  perform corrigir_data_venda(n, hoje - 10, 'teste da C4: venda foi antes');
  perform corrigir_data_venda(n2, hoje - 10, 'teste da C4: sem dados.venda');
  execute 'reset role';
  res := res || jsonb_build_object('1_corrigir_com_venda', (select jsonb_build_object(
      'venda_data_igual_ganho_em', (dados -> 'venda' ->> 'data') = ((ganho_em at time zone 'America/Sao_Paulo')::date)::text,
      'venda_data_e_a_nova', (dados -> 'venda' ->> 'data') = (hoje - 10)::text,
      'resto_da_venda_intacto', (dados -> 'venda' ->> 'categoria_id') = '16' and (dados -> 'venda' ->> 'valor') = '5000') from negocios where id = n));
  res := res || jsonb_build_object('1b_corrigir_sem_venda_nao_cria_a_chave', (select not (dados ? 'venda') from negocios where id = n2));

  -- 2. reabrir: a venda vai para o histórico e sai do negócio
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  perform reabrir_negocio(n, 'teste da C4: cliente devolveu');
  execute 'reset role';
  res := res || jsonb_build_object('2_reabrir', jsonb_build_object(
    'negocio_sem_venda', (select not (dados ? 'venda') from negocios where id = n),
    'status', (select status from negocios where id = n),
    'historico_tem_a_venda', (select (detalhe -> 'venda' ->> 'categoria_id') = '16' and (detalhe -> 'venda' ->> 'data') = (hoje - 10)::text
                                from negocio_historico where negocio_id = n and acao = 'reaberto_manual' order by id desc limit 1)));

  -- 3. ganho de novo com a venda nova: grava normalmente
  update negocios set status = 'ganho', etapa_id = 76, ganho_em = (hoje + time '12:00') at time zone 'America/Sao_Paulo',
         dados = dados || jsonb_build_object('venda', jsonb_build_object('data', hoje::text, 'categoria_id', 10, 'condicao', 'usado', 'valor', 3000))
   where id = n;
  res := res || jsonb_build_object('3_ganho_de_novo', (select jsonb_build_object('status', status, 'categoria', dados -> 'venda' -> 'categoria_id') from negocios where id = n));

  raise exception 'RESULTADO_TESTE_C4 %', res::text;
end $t$;
