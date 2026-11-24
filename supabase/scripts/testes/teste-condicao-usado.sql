-- Teste da 20261124002000_condicao_usado. JM de teste (empresa 1, loja 3). Termina com RAISE: nada fica gravado.
do $t$
declare res jsonb := '{}'; ct bigint; n bigint; e text;
begin
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Condição neutra') returning id into ct;
  -- 1. 'seminovo' gravado (app antigo, script) vira 'usado'
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true},"venda":{"data":"2026-11-20","categoria_id":null,"condicao":"seminovo","valor":100}}') returning id into n;
  res := res || jsonb_build_object('1_seminovo_vira_usado', (select dados -> 'venda' ->> 'condicao' from negocios where id = n));
  -- 2. 'usado' e 'novo' aceitos; sem condição também (opcional no banco)
  update negocios set dados = jsonb_set(dados, '{venda,condicao}', '"novo"') where id = n;
  res := res || jsonb_build_object('2a_novo', (select dados -> 'venda' ->> 'condicao' from negocios where id = n));
  update negocios set dados = dados #- '{venda,condicao}' where id = n;
  res := res || jsonb_build_object('2b_sem_condicao', (select dados -> 'venda' ? 'condicao' from negocios where id = n));
  -- 3. valor estranho continua recusado
  begin update negocios set dados = jsonb_set(dados, '{venda,condicao}', '"meio-usado"') where id = n; e := 'FALHOU: aceitou';
  exception when others then e := 'recusou'; end;
  res := res || jsonb_build_object('3_estranho', e);
  -- 4. nenhum 'seminovo' sobrou nas vendas, réguas, passos e jornadas
  res := res || jsonb_build_object('4_sobrou_seminovo',
    (select count(*) from negocios where dados -> 'venda' ->> 'condicao' = 'seminovo')
    + (select count(*) from posvenda_cadencias where filtros ->> 'condicao' = 'seminovo')
    + (select count(*) from posvenda_cadencia_passos where filtros ->> 'condicao' = 'seminovo')
    + (select count(*) from posvenda_jornadas where condicao = 'seminovo'));
  raise exception 'RESULTADO_TESTE_CONDICAO_USADO %', res::text;
end $t$;
