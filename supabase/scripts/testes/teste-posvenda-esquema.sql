-- Teste da 20261124000200_posvenda_esquema (C1). Banco local descartável (semente fictícia). Termina com RAISE.
-- JM de teste (empresa 1): loja 3 (matriz) e 6; vendedora f4ec… (loja 6), Vendedor Matriz Um …0101 (loja 3),
-- Administrador A …0201.
do $t$
declare
  res jsonb := '{}';
  c_cad bigint; c_passo bigint; c_jor bigint; v_con bigint; v_neg bigint; v_msg text; v_n int;
  VJ uuid := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  A  uuid := '0e5e0000-0000-4000-8000-000000000201';
begin
  res := res || jsonb_build_object('tabelas', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'posvenda\_%'));
  res := res || jsonb_build_object('rls_ligada_em_todas', (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'posvenda\_%'));

  -- dados de base (como o servidor faria)
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua de teste') returning id into c_cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, c_cad, 1, 1, 'whatsapp', 'D+1') returning id into c_passo;
  select id into v_con from contatos where empresa_id = 1 order by id limit 1;
  select id into v_neg from negocios where empresa_id = 1 and contato_id = v_con order by id limit 1;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, v_con, v_neg, c_cad, now()) returning id into c_jor;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
  values (1, 3, c_jor, c_passo, v_con, v_neg, M1, 'roleta', now() + interval '1 day'),
         (1, 6, c_jor, c_passo, v_con, v_neg, VJ, 'roleta', now() + interval '1 day');

  -- travas
  begin insert into posvenda_acompanhamentos (empresa_id, jornada_id, passo_id, contato_id, responsavel_id, origem_responsavel, previsto_para)
        values (1, c_jor, c_passo, v_con, null, 'roleta', now()); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('responsavel_obrigatorio', v_msg);
  begin insert into posvenda_acompanhamentos (empresa_id, jornada_id, passo_id, contato_id, responsavel_id, origem_responsavel, previsto_para)
        values (1, c_jor, c_passo, v_con, M1, 'qualquer', now()); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('origem_conferida', v_msg);
  begin insert into posvenda_roleta (empresa_id, chave) values (1, 'qualquer'); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('chave_da_roleta_conferida', v_msg);

  -- vendedora da loja 6 (sessão real)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', VJ, 'role', 'authenticated')::text, true);
  select count(*) into v_n from posvenda_acompanhamentos;
  res := res || jsonb_build_object('vendedora_ve_so_os_dela', v_n);
  begin select count(*) into v_n from posvenda_roleta; v_msg := 'FALHOU: leu ' || v_n;
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('vendedora_nao_ve_a_roleta', v_msg);
  begin insert into posvenda_cadencias (empresa_id, nome) values (1, 'pela vendedora'); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('vendedora_nao_cria_regua', v_msg);

  -- vendedor da matriz
  perform set_config('request.jwt.claims', json_build_object('sub', M1, 'role', 'authenticated')::text, true);
  select count(*) into v_n from posvenda_acompanhamentos;
  res := res || jsonb_build_object('vendedor_matriz_ve_so_os_dele', v_n);

  -- administrador
  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  select count(*) into v_n from posvenda_acompanhamentos;
  res := res || jsonb_build_object('admin_ve_todos', v_n);
  begin insert into posvenda_cadencias (empresa_id, nome) values (1, 'pelo admin'); v_msg := 'ok';
  exception when others then v_msg := 'FALHOU: ' || sqlerrm; end;
  res := res || jsonb_build_object('admin_cria_regua', v_msg);
  begin insert into posvenda_acompanhamentos (empresa_id, jornada_id, passo_id, contato_id, responsavel_id, origem_responsavel, previsto_para)
        values (1, c_jor, c_passo, v_con, A, 'manual', now()); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('admin_nao_grava_acompanhamento_direto', v_msg);

  -- anônimo
  execute 'set local role anon';
  begin select count(*) into v_n from posvenda_acompanhamentos; v_msg := 'FALHOU: leu ' || v_n;
  exception when others then v_msg := 'recusou'; end;
  res := res || jsonb_build_object('anonimo', v_msg);
  execute 'reset role';

  raise exception 'RESULTADO_TESTE_C1 %', res::text;
end $t$;
