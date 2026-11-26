-- Teste do custo protegido no ESTADO FINAL (1.1d + 1.1f: 20261126000300 e 20261126000400; tempo 3: coluna antiga vazia).
-- O comportamento do tempo 1 sozinho foi provado em 26/11 no commit 51768bfa (antes da 0400). JM de teste (empresa 1, loja 3): dono a632… (Dono,
-- tem estoque.ver_custo), vendedor M1 …0101 (sem). Termina com RAISE: nada fica gravado.
do $t$
declare
  r jsonb := '{}';
  DONO uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  prod bigint; uA bigint; uP bigint; uT bigint; uV bigint; uL bigint; uR bigint;
  vA bigint; vP bigint; vL bigint; vE bigint; ped bigint; x jsonb; e text; n bigint;
begin
  insert into estoque_produtos (empresa_id, nome) values (1, 'Produto custo teste') returning id into prod;

  -- como DONO (tem a permissão)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  insert into estoque_unidades (empresa_id, filial_id, produto_id, preco_custo, custo_reparo, status) values (1, 3, prod, 1000, 50, 'disponivel') returning id into uA;
  insert into estoque_unidades (empresa_id, filial_id, produto_id, preco_custo, status, quantidade) values (1, 3, prod, 10, 'disponivel', 5) returning id into uL;

  -- como VENDEDOR (sem a permissão): entrada com 0 → pendente; troca com valor oferecido; entrada com valor (app antigo) fica
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  insert into estoque_unidades (empresa_id, filial_id, produto_id, preco_custo, status) values (1, 3, prod, 0, 'disponivel') returning id into uP;
  insert into estoque_unidades (empresa_id, filial_id, produto_id, preco_custo, status, tipo) values (1, 3, prod, 800, 'pendente', 'troca') returning id into uT;
  insert into estoque_unidades (empresa_id, filial_id, produto_id, preco_custo, status) values (1, 3, prod, 500, 'disponivel') returning id into uV;

  r := r || jsonb_build_object('1_entrada', jsonb_build_object(
    'dono_1000', (select jsonb_build_array(u.preco_custo, c.preco_custo, c.custo_reparo, c.custo_origem) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uA),
    'vendedor_zero_pendente', (select jsonb_build_array(u.preco_custo, c.preco_custo) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uP),
    'troca_valor_oferecido', (select jsonb_build_array(c.preco_custo, c.custo_origem) from estoque_unidades_custos c where c.unidade_id = uT),
    'vendedor_com_valor_app_antigo', (select c.preco_custo from estoque_unidades_custos c where c.unidade_id = uV)));

  -- 2. venda de unidade: o custo vem da unidade × quantidade; o que o navegador manda é ignorado
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, valor_custo, status, unidade_id, produto_id) values (1, 3, 1500, 1, 'concluida', uA, prod) returning id into vA;
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, valor_custo, status, unidade_id, produto_id, quantidade) values (1, 3, 60, 0, 'concluida', uL, prod, 2) returning id into vL;
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, valor_custo, status, unidade_id, produto_id) values (1, 3, 900, 0, 'concluida', uP, prod) returning id into vP;
  update estoque_unidades set status = 'vendido' where id in (uA, uP);
  r := r || jsonb_build_object('2_venda', jsonb_build_object(
    'custo_da_unidade', (select jsonb_build_array(v.valor_custo, c.valor_custo, v.lucro) from vendas_vendas v join vendas_vendas_custos c on c.venda_id = v.id where v.id = vA),
    'lote_vezes_quantidade', (select c.valor_custo from vendas_vendas_custos c where c.venda_id = vL),
    'unidade_pendente_venda_pendente', (select jsonb_build_array(v.valor_custo, c.valor_custo) from vendas_vendas v join vendas_vendas_custos c on c.venda_id = v.id where v.id = vP)));

  -- 3. vendedor não lê os satélites (RLS), nem chama as funções; a coluna antiga continua como hoje (tempo 1)
  execute 'set local role authenticated';
  r := r || jsonb_build_object('3_vendedor', jsonb_build_object(
    'satelite_unidades', (select count(*) from estoque_unidades_custos),
    'satelite_vendas', (select count(*) from vendas_vendas_custos),
    'satelite_compras', (select count(*) from compras_pedidos_custos),
    'coluna_antiga', (select preco_custo from estoque_unidades where id = uA)));
  begin perform estoque_custos_pendentes(null); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_pendentes', e);
  begin perform venda_resultado(vA); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_resultado', e);
  begin perform estoque_custo_informar(uP, 10, null, 'tentativa'); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('3_informar', e);
  -- criar unidade pela função do tempo 2: sem a permissão, o custo some (pendente) e os padrões valem
  uR := estoque_unidade_criar(jsonb_build_object('filial_id', 3, 'produto_id', prod, 'preco_custo', 999));
  execute 'reset role';
  r := r || jsonb_build_object('3_criar_sem_permissao', (select jsonb_build_array(u.preco_custo, c.preco_custo, u.status, u.ativo, u.tipo) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uR));

  -- 4. dono lê, e informa o custo da unidade vendida pendente: a venda recebe UMA vez
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || jsonb_build_object('4_dono_le', (select count(*) > 0 from estoque_unidades_custos where unidade_id = uA));
  x := estoque_custo_informar(uP, 700, null, 'nota do fornecedor');
  r := r || jsonb_build_object('4_informar', jsonb_build_object(
    'retorno_preencheu_a_venda', (x ->> 'venda_preenchida')::bigint = vP,
    'unidade', (select jsonb_build_array(u.preco_custo, c.preco_custo, c.custo_origem) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uP),
    'venda', (select jsonb_build_array(v.valor_custo, c.valor_custo, c.custo_preenchido_em is not null) from vendas_vendas v join vendas_vendas_custos c on c.venda_id = v.id where v.id = vP),
    'resultado', venda_resultado(vP) - 'venda_id'));
  x := estoque_custo_informar(uP, 900, null, 'corrigido');
  r := r || jsonb_build_object('4_segunda_vez_venda_nao_muda', jsonb_build_object(
    'unidade', (select preco_custo from estoque_unidades_custos where unidade_id = uP),
    'venda', (select valor_custo from vendas_vendas_custos where venda_id = vP),
    'retorno', x -> 'venda_preenchida'));
  r := r || jsonb_build_object('4_pendentes_resumo', estoque_custos_pendentes_resumo() -> 'total');
  -- custo de venda concluída pela coluna antiga: barrado pela guarda do satélite (desde a 0800 o H2 vigia só valor e desconto)
  begin update vendas_vendas set valor_custo = 1 where id = vA; e := 'passou'; exception when others then e := sqlerrm; end;
  r := r || jsonb_build_object('4_h2_primeiro', e);
  execute 'reset role';

  -- 5. guarda do satélite: nem por fora (postgres/service_role) muda custo de venda concluída ou preenchida
  begin update vendas_vendas_custos set valor_custo = 1 where venda_id = vA; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('5_concluida', e);
  begin update vendas_vendas_custos set valor_custo = 1 where venda_id = vP; e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('5_preenchida', e);
  begin
    perform set_config('nexus.venda_valor_ajuste', 'teste', true);
    update vendas_vendas_custos set valor_custo = 1490 where venda_id = vA;
    e := (select valor_custo::text from vendas_vendas_custos where venda_id = vA);
    perform set_config('nexus.venda_valor_ajuste', '', true);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then e := sqlerrm; end if; end;
  r := r || jsonb_build_object('5_marca_de_script', e);

  -- 6. encomenda: coluna antiga → satélite, satélite (RPC) → coluna antiga, com auditoria e sem laço
  insert into vendas_vendas (empresa_id, filial_id, valor_venda, valor_custo, status) values (1, 3, 2000, 100, 'encomenda') returning id into vE;
  select count(*) into n from auditoria_eventos where entidade = 'venda' and entidade_id = vE::text;
  update vendas_vendas set valor_custo = 150 where id = vE;
  update vendas_vendas set valor_custo = 150 where id = vE;   -- mesmo valor: sem linha nova
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform venda_custo_ajustar(vE, 200, 'ajuste');
  begin perform venda_custo_ajustar(vA, 5, null); e := 'passou'; exception when others then e := split_part(sqlerrm, ' (', 1); end;
  execute 'reset role';
  r := r || jsonb_build_object('6_encomenda', jsonb_build_object(
    'coluna_e_satelite', (select jsonb_build_array(v.valor_custo, c.valor_custo) from vendas_vendas v join vendas_vendas_custos c on c.venda_id = v.id where v.id = vE),
    'auditorias', (select jsonb_agg(acao || ':' || origem order by id) from auditoria_eventos where entidade = 'venda' and entidade_id = vE::text),
    'ajustar_concluida', e));

  -- 7. compras e o espelho itens.custo
  insert into compras_pedidos (empresa_id, filial_id, descricao, valor_total) values (1, 3, 'pedido teste', 300) returning id into ped;
  update compras_pedidos set valor_total = 320 where id = ped;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := compras_pedido_salvar(jsonb_build_object('descricao', 'do vendedor', 'valor_total', 999, 'filial_id', 3));
  execute 'reset role';
  r := r || jsonb_build_object('7_compras', jsonb_build_object(
    'antigo_para_satelite', (select c.valor_total from compras_pedidos_custos c where c.pedido_id = ped),
    'vendedor_sem_valor', (select jsonb_build_array(p.valor_total, c.valor_total) from compras_pedidos p join compras_pedidos_custos c on c.pedido_id = p.id where p.id = n)),
    '7_itens_custo_nulo', (select count(*) from itens where ref_tabela = 'estoque_unidades' and custo is not null));

  -- 8. porta de entrada (1.1f): o vendedor grava na coluna antiga → ignorado (sem a permissão); o dono → vai ao satélite;
  --    nos dois casos a coluna volta a nulo
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  update estoque_unidades set preco_custo = 5 where id = uA;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  update estoque_unidades set preco_custo = 1100 where id = uV;
  -- sem usuário (chave de serviço, script): escrita confiável, vai ao satélite
  perform set_config('request.jwt.claims', '', true);
  update estoque_unidades set preco_custo = 321 where id = uR;
  r := r || jsonb_build_object('8_porta_de_entrada', jsonb_build_object(
    'vendedor_ignorado', (select jsonb_build_array(u.preco_custo, c.preco_custo) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uA),
    'dono_vai_ao_satelite', (select jsonb_build_array(u.preco_custo, c.preco_custo) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uV),
    'servico_vai_ao_satelite', (select jsonb_build_array(u.preco_custo, c.preco_custo) from estoque_unidades u join estoque_unidades_custos c on c.unidade_id = u.id where u.id = uR)));

  -- 9. tempo 3: colunas antigas vazias para todos, satélite completo
  r := r || jsonb_build_object('9_colunas_antigas_vazias', jsonb_build_object(
    'unidades', not exists (select 1 from estoque_unidades where preco_custo is not null or custo_reparo is not null),
    'vendas', not exists (select 1 from vendas_vendas where valor_custo is not null or lucro is not null),
    'compras', not exists (select 1 from compras_pedidos where valor_total is not null),
    'satelites_completos', not exists (select 1 from estoque_unidades u where u.empresa_id is not null and not exists (select 1 from estoque_unidades_custos c where c.unidade_id = u.id))
                       and not exists (select 1 from vendas_vendas v where v.empresa_id is not null and not exists (select 1 from vendas_vendas_custos c where c.venda_id = v.id))));

  raise exception 'RESULTADO_TESTE_CUSTO_SATELITES %', r::text;
end $t$;
