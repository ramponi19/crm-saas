-- TESTE da migração 20261123000200_ganho_protegido.sql — roda em PRODUÇÃO sem deixar rastro.
--
-- Como usar: colar o conteúdo da migração e, logo depois, este bloco, numa única execução
-- (execute_sql do MCP do Supabase ou psql com um único comando). O bloco termina com RAISE
-- EXCEPTION de propósito: a execução inteira (migração + dados de teste) é desfeita, e a
-- mensagem do erro traz o resultado de cada cenário em JSON.
-- Tenant de teste: empresa 5 (Nexus Demonstração), funil 10, etapas 73 novo / 76 convertido / 77 perdido.

do $teste$
declare
  r jsonb := '{}'::jsonb;
  v_owner uuid := 'f47a8e4f-a428-4bf6-8a82-d43088751d2c';
  v_admin uuid := '96867cc0-8331-4c79-be63-09a313b35ea0';
  ca bigint; cb bigint; cc bigint; cd bigint; ce bigint; cf bigint;
  na bigint; nb bigint; nc bigint; ne bigint; nf bigint; nx bigint; ret bigint;
  rec record; v_ok boolean; v_msg text; v_cnt int;
begin
  -- contatos de teste (empresa 5, loja 1)
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 A dentro da janela') returning id into ca;
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 B fora da janela') returning id into cb;
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 C perdido') returning id into cc;
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 D sem negocio') returning id into cd;
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 E aberto') returning id into ce;
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 F conversao') returning id into cf;

  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, ca, 10, 76, 'ganho', now() - interval '5 days', '{"_lead":{"ativo":true}}') returning id into na;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, cb, 10, 76, 'ganho', now() - interval '60 days', '{"_lead":{"ativo":true}}') returning id into nb;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, perdido_em, dados)
  values (5, 1, cc, 10, 77, 'perdido', now() - interval '20 days', '{"_lead":{"ativo":true}}') returning id into nc;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, ce, 10, 74, 'aberto', '{"_lead":{"ativo":true}}') returning id into ne;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, cf, 10, 75, 'aberto', '{"_lead":{"ativo":true}}') returning id into nf;

  -- 1. ganho DENTRO da janela (30 dias): a mensagem entra no ganho, nada muda
  select status, ganho_em into rec from negocios where id = na;
  ret := core_negocio_do_canal(5, ca, 1, 'oi, chegou bem');
  r := r || jsonb_build_object('1_ganho_dentro_janela', jsonb_build_object(
    'devolveu_o_ganho', ret = na, 'status', (select status from negocios where id = na),
    'ganho_em_intacto', rec.ganho_em = (select ganho_em from negocios where id = na),
    'negocios_do_contato', (select count(*) from negocios where contato_id = ca)));

  -- 2. ganho FORA da janela: nasce negócio novo; o ganho fica intacto
  select ganho_em into rec from negocios where id = nb;
  ret := core_negocio_do_canal(5, cb, 1, 'quero outro iPhone');
  r := r || jsonb_build_object('2_ganho_fora_janela', jsonb_build_object(
    'criou_novo', ret <> nb,
    'novo', (select jsonb_build_object('status', status, 'etapa_id', etapa_id, 'funil_id', funil_id) from negocios where id = ret),
    'antigo', (select jsonb_build_object('status', status, 'ganho_em_igual', ganho_em = rec.ganho_em) from negocios where id = nb),
    'historico_novo', (select acao || ' ganho_anterior=' || (detalhe->>'ganho_anterior') from negocio_historico where negocio_id = ret and acao = 'novo_apos_ganho'),
    'historico_reabertura_no_ganho', (select count(*) from negocio_historico where negocio_id = nb and acao = 'reaberto_por_mensagem')));

  -- 2b. mensagem ENVIADA pela loja para cliente com ganho antigo: não cria nada
  insert into contatos (empresa_id, filial_id, nome) values (5, 1, 'TESTE M1 B2 enviada') returning id into rec;
  -- (reaproveita o padrão do 2 com outro contato)
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, ganho_em, dados)
  values (5, 1, (select max(id) from contatos where nome = 'TESTE M1 B2 enviada'), 10, 76, 'ganho', now() - interval '90 days', '{"_lead":{"ativo":true}}') returning id into nx;
  ret := core_negocio_do_canal(5, (select contato_id from negocios where id = nx), 1, null, true);
  r := r || jsonb_build_object('2b_enviada_pela_loja_ganho_antigo', jsonb_build_object(
    'devolveu_o_ganho', ret = nx, 'status', (select status from negocios where id = nx),
    'negocios_do_contato', (select count(*) from negocios where contato_id = (select contato_id from negocios where id = nx))));

  -- 3. perdido: reabre o MESMO, como hoje
  ret := core_negocio_do_canal(5, cc, 1, 'voltei');
  r := r || jsonb_build_object('3_perdido', jsonb_build_object(
    'reabriu_o_mesmo', ret = nc,
    'agora', (select jsonb_build_object('status', status, 'etapa_id', etapa_id, 'perdido_em', perdido_em) from negocios where id = nc),
    'historico', (select acao || ' status_antes=' || (detalhe->>'status') from negocio_historico where negocio_id = nc and acao = 'reaberto_por_mensagem')));

  -- 4. contato sem negócio: cria
  ret := core_negocio_do_canal(5, cd, 1, 'primeira mensagem');
  r := r || jsonb_build_object('4_sem_negocio', jsonb_build_object(
    'criou', ret is not null,
    'novo', (select jsonb_build_object('status', status, 'etapa_id', etapa_id, 'primeira_msg', dados->'_lead'->>'primeira_msg') from negocios where id = ret)));

  -- 5. contato com negócio aberto: entra nele, nada muda
  ret := core_negocio_do_canal(5, ce, 1, 'oi de novo');
  r := r || jsonb_build_object('5_aberto', jsonb_build_object(
    'devolveu_o_aberto', ret = ne, 'etapa_id', (select etapa_id from negocios where id = ne),
    'negocios_do_contato', (select count(*) from negocios where contato_id = ce)));

  -- 6. UPDATE direto ganho → aberto (deve FALHAR)
  begin
    update negocios set status = 'aberto', ganho_em = null, etapa_id = 73 where id = nb;
    v_ok := true; v_msg := 'passou (ERRO: devia ter sido barrado)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('6_update_ganho_para_aberto', jsonb_build_object('barrado', not v_ok, 'mensagem', v_msg));

  -- 6b. UPDATE direto ganho → perdido (deve FALHAR)
  begin
    update negocios set status = 'perdido', perdido_em = now(), etapa_id = 77 where id = nb;
    v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('6b_update_ganho_para_perdido', jsonb_build_object('barrado', not v_ok, 'mensagem', left(v_msg, 60)));

  -- 6c. trocar o ganho_em de um ganho (deve FALHAR) e zerar (deve FALHAR)
  begin
    update negocios set ganho_em = now() where id = nb; v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('6c_trocar_ganho_em', jsonb_build_object('barrado', not v_ok, 'mensagem', left(v_msg, 60)));
  begin
    update negocios set ganho_em = null where id = nb; v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('6d_zerar_ganho_em', jsonb_build_object('barrado', not v_ok, 'mensagem', left(v_msg, 60)));

  -- 6e. mexer em outra coisa de um ganho (valor) continua livre
  begin
    update negocios set valor_estimado = 1234, status = 'ganho' where id = nb; v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('6e_ganho_muda_valor', jsonb_build_object('permitido', v_ok, 'mensagem', v_msg));

  -- 7. conversão como a tela e a Fase 4B fazem: aberto → ganho com data do pedido (deve PASSAR)
  begin
    update negocios set etapa_id = 76, status = 'ganho', ganho_em = '2026-09-10T12:00:00-03:00'
     where id = nf and empresa_id = 5 and status = 'aberto';
    get diagnostics v_cnt = row_count; v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('7_conversao_4B', jsonb_build_object('permitido', v_ok, 'linhas', v_cnt, 'mensagem', v_msg,
    'ganho_em', (select ganho_em from negocios where id = nf)));

  -- 7b. entrar no ganho SEM data: ganha a data de agora
  update negocios set etapa_id = 76, status = 'ganho' where id = ne;
  r := r || jsonb_build_object('7b_ganho_sem_data', jsonb_build_object('ganho_em_preenchido', (select ganho_em is not null from negocios where id = ne)));

  -- 8. RPC reabrir_negocio
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  update empresa_usuarios set role = 'vendedor' where usuario_id = v_admin and empresa_id = 5;  -- simula um vendedor
  begin
    perform reabrir_negocio(nb, 'cliente desistiu da compra'); v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('8a_rpc_vendedor', jsonb_build_object('barrado', not v_ok, 'mensagem', v_msg));
  update empresa_usuarios set role = 'admin' where usuario_id = v_admin and empresa_id = 5;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin
    perform reabrir_negocio(nb, '  '); v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('8b_rpc_dono_sem_motivo', jsonb_build_object('barrado', not v_ok, 'mensagem', v_msg));

  begin
    perform reabrir_negocio(nb, 'venda cancelada, cliente devolveu o aparelho'); v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('8c_rpc_dono_com_motivo', jsonb_build_object('permitido', v_ok, 'mensagem', v_msg,
    'agora', (select jsonb_build_object('status', status, 'ganho_em', ganho_em, 'etapa_id', etapa_id) from negocios where id = nb),
    'historico', (select jsonb_build_object('acao', acao, 'por_usuario', por_usuario, 'motivo', detalhe->>'motivo', 'ganho_em_antes', detalhe->>'ganho_em')
                    from negocio_historico where negocio_id = nb and acao = 'reaberto_manual')));
  -- a marca da RPC não vale para outro negócio na mesma transação
  begin
    update negocios set status = 'aberto', etapa_id = 73 where id = na; v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('8d_marca_nao_vaza', jsonb_build_object('barrado', not v_ok, 'mensagem', left(v_msg, 60)));
  perform set_config('request.jwt.claims', '{}', true);

  -- 9. junção de negócios (chave de serviço): arquivar com _juntado passa; sem _juntado, não
  execute 'set local role service_role';
  begin
    update negocios set status = 'aberto', ganho_em = null where id = na; v_ok := true; v_msg := 'passou (ERRO)';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('9a_service_role_sem_juntado', jsonb_build_object('barrado', not v_ok, 'mensagem', left(v_msg, 60)));
  begin
    update negocios set status = 'aberto', ganho_em = null,
           dados = jsonb_build_object('_lead', jsonb_build_object('ativo', false), '_juntado', jsonb_build_object('para', nf))
     where id = na; v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm;
  end;
  r := r || jsonb_build_object('9b_juntar_negocios', jsonb_build_object('permitido', v_ok, 'mensagem', v_msg));
  execute 'reset role';

  raise exception 'RESULTADO_TESTE_M1 %', r::text;
end $teste$;
