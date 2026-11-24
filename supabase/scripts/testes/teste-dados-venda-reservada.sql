-- Teste da 20261123000700_dados_venda_reservada (rodar DEPOIS do corpo da migração, na mesma transação).
-- Só empresa 5 (Nexus Demonstração). Termina com RAISE: nada fica gravado.
do $t$
declare
  v_neg bigint; v_con bigint; res jsonb := '{}';
begin
  select id into v_neg from negocios where empresa_id = 5 order by id limit 1;
  select id into v_con from contatos where empresa_id = 5 order by id limit 1;

  -- 1. venda completa, como a rota grava: aceita
  begin
    update negocios set dados = dados || jsonb_build_object('venda', jsonb_build_object(
      'data', '2026-11-23', 'categoria_id', 10, 'condicao', 'seminovo', 'valor', 4500.5,
      'registrada_por', gen_random_uuid(), 'registrada_em', now())) where id = v_neg;
    res := res || '{"1_venda_valida":"ok"}';
  exception when others then res := res || jsonb_build_object('1_venda_valida', 'FALHOU: ' || sqlerrm); end;

  -- 2. venda da conciliação (origem/fonte a mais, categoria nula): aceita
  begin
    update negocios set dados = dados || jsonb_build_object('venda', jsonb_build_object(
      'data', '2026-09-09', 'categoria_id', null, 'condicao', null, 'valor', 100, 'origem', 'conciliacao_zip', 'fonte', 'x')) where id = v_neg;
    res := res || '{"2_venda_conciliacao":"ok"}';
  exception when others then res := res || jsonb_build_object('2_venda_conciliacao', 'FALHOU: ' || sqlerrm); end;

  -- 3..6. formas erradas: recusa
  begin update negocios set dados = dados || '{"venda":{"condicao":"usado"}}' where id = v_neg;
    res := res || '{"3_condicao_invalida":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('3_condicao_invalida', 'recusou: ' || sqlerrm); end;
  begin update negocios set dados = dados || '{"venda":{"data":"23/11/2026"}}' where id = v_neg;
    res := res || '{"4_data_invalida":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('4_data_invalida', 'recusou: ' || sqlerrm); end;
  begin update negocios set dados = dados || '{"venda":"texto"}' where id = v_neg;
    res := res || '{"5_venda_nao_objeto":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('5_venda_nao_objeto', 'recusou: ' || sqlerrm); end;
  begin update negocios set dados = dados || '{"venda":{"valor":"4500"}}' where id = v_neg;
    res := res || '{"6_valor_texto":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('6_valor_texto', 'recusou: ' || sqlerrm); end;

  -- 7. chave desconhecida em negócio continua recusada
  begin update negocios set dados = dados || '{"qualquer_coisa":1}' where id = v_neg;
    res := res || '{"7_chave_desconhecida":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('7_chave_desconhecida', 'recusou: ' || sqlerrm); end;

  -- 8. `venda` em CONTATO continua recusada (a reserva é só de negócio)
  begin update contatos set dados = dados || '{"venda":{}}' where id = v_con;
    res := res || '{"8_venda_em_contato":"FALHOU: aceitou"}';
  exception when others then res := res || jsonb_build_object('8_venda_em_contato', 'recusou: ' || sqlerrm); end;

  raise exception 'RESULTADO %', jsonb_build_object('negocio', v_neg, 'contato', v_con, 'casos', res);
end $t$;
