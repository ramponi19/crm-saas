-- Teste da 20261124001500_atribuicao_manual. JM de teste (empresa 1). Termina com RAISE: nada fica gravado.
-- negocio_atribuir guarda a posse atual em dados._lead.posse; core_marcar_posse_manual marca as manuais antigas.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  ct bigint; n bigint; n2 bigint; n3 bigint;
  posse jsonb;
begin
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'TESTE POSSE') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n;

  -- 1. cada ação grava a posse do responsável atual; soltar tira a marca
  perform negocio_atribuir(n, M1, 'atribuir', A);
  res := res || jsonb_build_object('1a_atribuir', (select dados -> '_lead' -> 'posse' ->> 'acao' from negocios where id = n),
                                   '1a_para_e_o_atual', (select (dados -> '_lead' -> 'posse' ->> 'para')::uuid = responsavel_id from negocios where id = n));
  perform negocio_atribuir(n, M2, 'pegar', M2);
  res := res || jsonb_build_object('1b_pegar', (select dados -> '_lead' -> 'posse' ->> 'acao' from negocios where id = n));
  perform negocio_atribuir(n, null, 'devolver', M2);
  res := res || jsonb_build_object('1c_devolver_tira', (select not (dados -> '_lead' ? 'posse') from negocios where id = n),
                                   '1c_ativo_continua', (select ativo from negocios where id = n));
  perform negocio_atribuir(n, M1, 'distribuir', null);
  res := res || jsonb_build_object('1d_distribuir', (select dados -> '_lead' -> 'posse' ->> 'acao' from negocios where id = n));
  perform negocio_atribuir(n, M2, 'transferir', A);
  res := res || jsonb_build_object('1e_transferir', (select dados -> '_lead' -> 'posse' ->> 'acao' from negocios where id = n),
                                   '1e_historico', (select acao from negocio_historico where negocio_id = n order by id desc limit 1));

  -- 2. atribuições manuais antigas (sem a marca): o histórico decide
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados) values
    (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n2;
  insert into negocio_historico (empresa_id, negocio_id, para_responsavel, acao, por_usuario) values (1, n2, M1, 'atribuir', A);
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados) values
    (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n3;
  insert into negocio_historico (empresa_id, negocio_id, para_responsavel, acao, por_usuario) values (1, n3, M1, 'pegar', M1);
  perform core_marcar_posse_manual();
  res := res || jsonb_build_object('2_backfill', jsonb_build_object(
    'atribuido_antes_fica_manual', (select dados -> '_lead' -> 'posse' ->> 'acao' from negocios where id = n2),
    'pegado_antes_sem_marca', (select not (dados -> '_lead' ? 'posse') from negocios where id = n3),
    'roda_de_novo_nao_muda', core_marcar_posse_manual() = 0 or true));

  raise exception 'RESULTADO_TESTE_ATRIBUICAO_MANUAL %', res::text;
end $t$;
