-- Teste da 20261124000100_validar_dados_so_o_que_mudou. Termina com RAISE: nada fica gravado.
-- No banco local descartável (scripts/teste-local.sh) a migração já está aplicada; na produção, colar a
-- migração antes deste bloco, numa execução só. Empresa 5 (Nexus Demonstração), loja 1, funil 10, etapa 73.
do $t$
declare
  res jsonb := '{}'; v_con bigint; v_neg bigint; v_msg text;
begin
  insert into contatos (empresa_id, filial_id, nome, dados) values (5, 1, 'TESTE validar dados', '{"profissao":"Arquiteta"}') returning id into v_con;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
  values (5, 1, v_con, 10, 73, 'aberto', '{"_lead":{"ativo":true},"produto_interessado":"Notebook"}') returning id into v_neg;

  -- campo do contato e produto de interesse DESLIGADOS com valor já gravado
  update campos_personalizados set ativo = false where empresa_id = 5 and chave in ('profissao', 'produto_interessado');

  -- 1. gravar OUTRA coisa no dados de quem tem chave de campo desligado: passa (antes travava)
  begin update contatos set dados = dados || '{"estado_civil":"Solteira"}' where id = v_con; v_msg := 'ok';
  exception when others then v_msg := 'FALHOU: ' || sqlerrm; end;
  res := res || jsonb_build_object('1_contato_outra_chave_com_campo_desligado', v_msg);

  begin update negocios set dados = dados || jsonb_build_object('venda', jsonb_build_object('data', '2026-11-20', 'categoria_id', 10, 'condicao', 'novo', 'valor', 100)) where id = v_neg; v_msg := 'ok';
  exception when others then v_msg := 'FALHOU: ' || sqlerrm; end;
  res := res || jsonb_build_object('2_marcar_venda_com_produto_desligado', v_msg);

  -- 3. MUDAR a chave do campo desligado do contato: recusa
  begin update contatos set dados = dados || '{"profissao":"Engenheira"}' where id = v_con; v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('3_mudar_campo_desligado', v_msg);

  -- 4. produto de interesse desligado: texto novo passa; número recusa
  begin update negocios set dados = dados || '{"produto_interessado":"Smart TV"}' where id = v_neg; v_msg := 'ok';
  exception when others then v_msg := 'FALHOU: ' || sqlerrm; end;
  res := res || jsonb_build_object('4a_produto_texto_com_campo_desligado', v_msg);
  begin update negocios set dados = dados || '{"produto_interessado":123}' where id = v_neg; v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('4b_produto_numero', v_msg);

  -- 5. chave desconhecida NOVA continua recusada; e na inclusão tudo é conferido
  begin update negocios set dados = dados || '{"qualquer_coisa":1}' where id = v_neg; v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('5a_chave_nova_desconhecida', v_msg);
  begin insert into contatos (empresa_id, filial_id, nome, dados) values (5, 1, 'TESTE inclusão', '{"profissao":"x"}'); v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('5b_inclusao_com_campo_desligado', v_msg);

  -- 6. trocar de empresa: tudo é conferido de novo, com os campos da empresa NOVA
  update campos_personalizados set ativo = true where empresa_id = 5 and chave = 'profissao';
  begin update contatos set empresa_id = 1, filial_id = 3 where id = v_con; v_msg := 'ok';  -- a 1 tem profissao e estado_civil ativos
  exception when others then v_msg := 'FALHOU: ' || sqlerrm; end;
  res := res || jsonb_build_object('6a_trocar_para_empresa_com_os_campos', v_msg);
  update campos_personalizados set ativo = false where empresa_id = 5 and chave = 'estado_civil';
  begin update contatos set empresa_id = 5, filial_id = 1 where id = v_con; v_msg := 'FALHOU: aceitou';  -- na 5, estado_civil desligado
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('6b_trocar_para_empresa_sem_o_campo', v_msg);

  -- 7. dados.venda continua conferida quando muda
  begin update negocios set dados = dados || '{"venda":{"condicao":"usado"}}' where id = v_neg; v_msg := 'FALHOU: aceitou';
  exception when others then v_msg := 'recusou: ' || sqlerrm; end;
  res := res || jsonb_build_object('7_venda_errada', v_msg);

  raise exception 'RESULTADO_TESTE_VALIDAR %', res::text;
end $t$;
