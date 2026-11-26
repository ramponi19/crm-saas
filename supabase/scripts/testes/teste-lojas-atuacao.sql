-- Teste das 20261126000900 e 0910 (correção de segurança: só grava em loja em que pode atuar).
-- Semente: empresa 1 (JM de teste, lojas 3 matriz e 6); dono a632…; admin …0201; vendedor M1 …0101 (loja 3);
-- vendedor J2 …0104 (loja 6); vendedor …0103 sem loja (vale a matriz). Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; e text; n bigint; f bigint;
  DONO constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  ADM  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1   constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  J2   constant uuid := '0e5e0000-0000-4000-8000-000000000104';
  SL   constant uuid := '0e5e0000-0000-4000-8000-000000000103';
begin
  -- 1. lojas de atuação
  r := r || jsonb_build_object('1_atuacao', jsonb_build_object(
    'dono', filiais_atuacao_de(DONO, 1), 'admin', filiais_atuacao_de(ADM, 1), 'vendedor_mogi', filiais_atuacao_de(M1, 1),
    'vendedor_jag', filiais_atuacao_de(J2, 1), 'sem_loja', filiais_atuacao_de(SL, 1), 'demo_uma_loja', filiais_atuacao_de('f47a8e4f-a428-4bf6-8a82-d43088751d2c', 5)));

  -- 2. loja do topo: o vendedor não grava loja que não é dele; o admin grava qualquer; nula sempre passa
  begin update usuarios set filial_atual_id = 6 where id = M1; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('2_vendedor_topo_outra', e);
  begin update usuarios set filial_atual_id = 3 where id = M1; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('2_vendedor_topo_dele', e);
  begin update usuarios set filial_atual_id = 6 where id = ADM; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('2_admin_topo_qualquer', e);
  begin update usuarios set filial_atual_id = null where id = M1; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('2_topo_nulo', e);

  -- 3. seleção velha fora da atuação (gravada por script antes da correção) não vale: a loja de gravação cai no vínculo
  alter table usuarios disable trigger usuarios_loja_topo_confere;
  update usuarios set filial_atual_id = 6 where id = M1;
  alter table usuarios enable trigger usuarios_loja_topo_confere;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  r := r || jsonb_build_object('3_selecao_velha', jsonb_build_object('filial_atual', filial_atual(), 'loja_gravacao', filial_gravacao(1)));

  -- 4. gravação direta pelo navegador (vendedor de Mogi)
  execute 'set local role authenticated';
  begin insert into contatos (empresa_id, filial_id, nome, telefone) values (1, 6, 'Teste outra loja', '5519900000001'); e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('4_contato_outra_loja', e);
  begin insert into contatos (empresa_id, nome, telefone) values (1, 'Teste sem loja', '5519900000002') returning filial_id into f; e := 'loja ' || f;
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('4_contato_sem_loja_vai_pra_dele', e);
  begin insert into tarefas (empresa_id, filial_id, titulo) values (1, 6, 'Tarefa outra loja'); e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('4_tarefa_outra_loja', e);
  begin insert into tarefas (empresa_id, filial_id, titulo) values (1, 3, 'Tarefa da loja dele'); e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('4_tarefa_loja_dele', e);
  execute 'reset role';

  -- 5. o Dono grava em qualquer loja; função do banco (dono da função) não é barrada
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into tarefas (empresa_id, filial_id, titulo) values (1, 6, 'Tarefa do dono'); e := 'passou';
  exception when others then e := split_part(sqlerrm, ':', 1); end;
  execute 'reset role';
  r := r || jsonb_build_object('5_dono_qualquer_loja', e);
  raise exception 'RESULTADO_TESTE_LOJAS_ATUACAO %', r::text;
end $teste$;
