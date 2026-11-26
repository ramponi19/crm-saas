-- Teste da 20261126000800_custo_so_nos_satelites_funcoes (pré-requisito da 1.1g). CENÁRIO que devolve, em JSON, tudo o que
-- as três peças produzem — vendas (valor, desconto, situação, origem, datas preenchidas), pagamentos, custo no satélite e
-- coluna antiga — como Dono (vê custo) e como Vendedor (não vê). Roda igual com as funções ANTIGAS (volta aplicada) e com
-- as NOVAS: o JSON tem de ser IDÊNTICO (só o lugar por onde o custo passa muda). Termina com RAISE: nada fica gravado.
-- Semente: empresa 1 (JM de teste, loja 3); dono a632…; vendedor …0101.
do $teste$
declare
  r jsonb := '{}'; e text; prod bigint; g uuid; v1 bigint; v2 bigint; x jsonb; ped bigint; ped2 bigint; vc bigint;
  DONO constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  M1 constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  quem uuid;
begin
  insert into estoque_produtos (empresa_id, nome) values (1, 'Teste funções custo') returning id into prod;

  -- 1. concluir_encomenda com acessório, como Dono e como Vendedor
  foreach quem in array array[DONO, M1] loop
    perform set_config('request.jwt.claims', '', true);
    g := gen_random_uuid();
    insert into vendas_vendas (empresa_id, filial_id, grupo_pdv, produto_id, valor_venda, status, canal_venda, vendedor_id, usuario_id, data_venda)
    values (1, 3, g, prod, 1000, 'encomenda', 'encomenda', quem, quem, now() - interval '5 days') returning id into v1;
    insert into vendas_pagamentos (empresa_id, filial_id, venda_id, forma_pagamento, valor_pago) values (1, 3, v1, 'pix', 400);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', quem::text, 'role', 'authenticated')::text, true);
    x := concluir_encomenda(v1, '[{"forma":"dinheiro","valor":650}]'::jsonb, '[{"descricao":"Capinha","valor":50}]'::jsonb, 'encomenda');
    perform set_config('request.jwt.claims', '', true);
    r := r || jsonb_build_object(case when quem = DONO then '1_dono' else '1_vendedor' end, jsonb_build_object(
      'retorno_ok', x ? 'ok' or x ? 'concluidas' or jsonb_typeof(x) = 'object',
      'vendas', (select jsonb_agg(jsonb_build_array(valor_venda, desconto_valor, status, concluida_via, concluida_em is not null,
                    data_venda::date = (now() - interval '5 days')::date or observacoes like 'Acessório%', left(coalesce(observacoes, ''), 20),
                    (select jsonb_build_array(c.valor_custo, c.custo_preenchido_em is not null) from vendas_vendas_custos c where c.venda_id = vv.id),
                    vv.valor_custo, vv.lucro) order by vv.id)
                 from vendas_vendas vv where vv.grupo_pdv = g),
      'pagamentos', (select jsonb_agg(jsonb_build_array(p.forma_pagamento, p.valor_pago) order by p.id) from vendas_pagamentos p
                      join vendas_vendas vv on vv.id = p.venda_id where vv.grupo_pdv = g),
      'saldo', encomenda_saldo(v1)));
  end loop;

  -- 2. compras_pedido_salvar: criar e editar, como Dono e como Vendedor
  foreach quem in array array[DONO, M1] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', quem::text, 'role', 'authenticated')::text, true);
    ped := compras_pedido_salvar(jsonb_build_object('filial_id', 3, 'descricao', 'Pedido teste', 'valor_total', 321, 'data_pedido', '2026-11-20'));
    ped2 := compras_pedido_salvar(jsonb_build_object('id', ped, 'descricao', 'Pedido teste editado', 'valor_total', 654));
    perform compras_pedido_salvar(jsonb_build_object('id', ped, 'valor_total', ''));
    perform set_config('request.jwt.claims', '', true);
    r := r || jsonb_build_object(case when quem = DONO then '2_dono' else '2_vendedor' end, (select jsonb_build_array(
      p.descricao, p.status, p.data_pedido, p.usuario_id = quem, p.valor_total, c.valor_total)
      from compras_pedidos p join compras_pedidos_custos c on c.pedido_id = p.id where p.id = ped));
  end loop;

  -- 3. guarda H2/H3 (valor e desconto) e o custo da venda concluída pela coluna antiga
  perform set_config('request.jwt.claims', '', true);
  insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, status) values (1, 3, prod, 500, 'concluida') returning id into vc;
  insert into vendas_vendas (empresa_id, filial_id, produto_id, valor_venda, status) values (1, 3, prod, 700, 'encomenda') returning id into v2;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update vendas_vendas set valor_venda = 1 where id = vc; e := 'passou'; exception when others then e := split_part(sqlerrm, ' (', 1); end;
  r := r || jsonb_build_object('3_h2_valor', e);
  begin update vendas_vendas set desconto_valor = 1 where id = vc; e := 'passou'; exception when others then e := split_part(sqlerrm, ' (', 1); end;
  r := r || jsonb_build_object('3_h2_desconto', e);
  begin update vendas_vendas set valor_venda = 650 where id = v2; e := 'passou'; exception when others then e := split_part(sqlerrm, ' (', 1); end;
  r := r || jsonb_build_object('3_h3_encomenda_pode', e);
  execute 'reset role';
  update vendas_vendas set status = 'pendente_entrega' where id = v2;   -- como script (o navegador não muda a situação)
  execute 'set local role authenticated';
  begin update vendas_vendas set valor_venda = 600 where id = v2; e := 'passou'; exception when others then e := split_part(sqlerrm, ' (', 1); end;
  r := r || jsonb_build_object('3_h3_pendente_entrega', e);
  begin update vendas_vendas set valor_custo = 9 where id = vc; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  execute 'reset role';
  r := r || jsonb_build_object('3_custo_concluida_pela_coluna', jsonb_build_array(
      case when e like 'Venda concluída%' or e = 'CUSTO_CONGELADO' then 'barrado' else e end,
      (select c.valor_custo from vendas_vendas_custos c where c.venda_id = vc),
      (select valor_custo from vendas_vendas where id = vc)));
  raise exception 'RESULTADO_TESTE_CUSTO_FUNCOES %', r::text;
end $teste$;
