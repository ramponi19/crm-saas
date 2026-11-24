-- Teste da 20261124001400_sem_dono. JM de teste (empresa 1; matriz 3 e Jaguariúna 6). Cada caso numa subtransação
-- desfeita. Para a roleta ficar legível, dono e administradores saem dela (participa_roleta = false, como na JM):
--   matriz = M1 (…0101), M2 (…0102), SL (…0103, sem loja); Jaguariúna = J2 (…0104), VJ (f4ec…). Termina com RAISE.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  SL uuid := '0e5e0000-0000-4000-8000-000000000103'; J2 uuid := '0e5e0000-0000-4000-8000-000000000104';
  VJ uuid := 'f4ec6a87-103a-4ff3-b533-8347b028daf0';
  ct bigint; n1 bigint; n2 bigint; n3 bigint; n4 bigint; n6 bigint; v jsonb; c1 bigint; c2 bigint;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r6 uuid;
begin
  create temp table _n (u uuid primary key, n text) on commit drop;
  insert into _n values (M1,'M1'),(M2,'M2'),(SL,'SL'),(J2,'J2'),(VJ,'VJ');
  update empresa_usuarios set participa_roleta = false where empresa_id = 1 and role in ('owner', 'admin');
  delete from configuracoes_sistema where empresa_id = 1 and chave in ('distribuicao.sem_dono', 'roleta_leads', 'roleta_leads:3', 'roleta_leads:6');
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'TESTE SEM DONO') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n1;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n2;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n3;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n4;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values
    (1, 6, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n6;

  -- 1. Padrão (sem a chave) = esteira: nada muda
  res := res || jsonb_build_object('1_padrao_esteira', jsonb_build_object(
    'modo', core_sem_dono_modo(1, 3), 'aplicar', core_sem_dono_aplicar(n1),
    'continua_sem_dono', (select responsavel_id is null from negocios where id = n1)));

  -- 2. Modo roleta na empresa: o próximo da roleta da loja, sem repetir quem saiu
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.sem_dono', '{"empresa":"roleta","lojas":{}}');
    -- a função vai para variáveis ANTES do nome (num where, rodaria uma vez por linha)
    r1 := core_sem_dono_aplicar(n1); r2 := core_sem_dono_aplicar(n2); r3 := core_sem_dono_aplicar(n3);
    r4 := core_sem_dono_aplicar(n4, array[M1]); r6 := core_sem_dono_aplicar(n6);
    v := jsonb_build_array((select n from _n where u = r1), (select n from _n where u = r2),
                           (select n from _n where u = r3), (select n from _n where u = r4));
    res := res || jsonb_build_object('2_roleta_matriz', v,
      '2_historico_distribuir', (select count(*) from negocio_historico where negocio_id in (n1, n2, n3, n4) and acao = 'distribuir'),
      '2_jaguariuna', (select n from _n where u = r6));
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('2_erro', sqlerrm); end if;
  end;

  -- 3. Por loja: empresa em esteira, só Jaguariúna em roleta
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.sem_dono', '{"empresa":"esteira","lojas":{"6":"roleta"}}');
    r1 := core_sem_dono_aplicar(n1); r6 := core_sem_dono_aplicar(n6);
    res := res || jsonb_build_object('3_por_loja', jsonb_build_object(
      'matriz', coalesce((select n from _n where u = r1), 'esteira'),
      'jaguariuna', coalesce((select n from _n where u = r6), 'esteira')));
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('3_erro', sqlerrm); end if;
  end;

  -- 4. Conta de serviço e quem está fora da roleta nunca recebem
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.sem_dono', '{"empresa":"roleta","lojas":{}}');
    update empresa_usuarios set conta_servico = true where empresa_id = 1 and usuario_id = SL;
    update empresa_usuarios set participa_roleta = false where empresa_id = 1 and usuario_id = M2;
    r1 := core_sem_dono_aplicar(n1); r2 := core_sem_dono_aplicar(n2);
    v := jsonb_build_array((select n from _n where u = r1), (select n from _n where u = r2));
    res := res || jsonb_build_object('4_so_M1', v);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('4_erro', sqlerrm); end if;
  end;

  -- 5. Entrada pelo canal: esteira = lead novo sem dono (como hoje); roleta = já nasce com dono
  begin
    insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'CANAL A') returning id into ct;
    c1 := core_negocio_do_canal(1, ct, 3, 'oi', false, 'whatsapp', null);
    v := jsonb_build_object('esteira', (select responsavel_id is null from negocios where id = c1));
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.sem_dono', '{"empresa":"roleta","lojas":{}}');
    insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'CANAL B') returning id into ct;
    c2 := core_negocio_do_canal(1, ct, 3, 'oi', false, 'whatsapp', null);
    v := v || jsonb_build_object('roleta', (select n from _n join negocios x on x.responsavel_id = _n.u where x.id = c2));
    res := res || jsonb_build_object('5_canal', v);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('5_erro', sqlerrm); end if;
  end;

  -- 6. Saída da equipe: os abertos saem de quem saiu (esteira: ficam sem dono; roleta: vão para outro)
  begin
    update negocios set responsavel_id = M1 where id in (n1, n2);
    update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = M1;
    res := res || jsonb_build_object('6a_esteira', jsonb_build_object(
      'sem_dono', (select count(*) from negocios where id in (n1, n2) and responsavel_id is null),
      'historico', (select count(*) from negocio_historico where negocio_id in (n1, n2) and acao = 'saida_da_equipe')));
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('6a_erro', sqlerrm); end if;
  end;
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.sem_dono', '{"empresa":"roleta","lojas":{}}');
    update negocios set responsavel_id = M2 where id in (n1, n2);
    update empresa_usuarios set ativo = false where empresa_id = 1 and usuario_id = M2;
    res := res || jsonb_build_object('6b_roleta', (select jsonb_agg((select n from _n where u = responsavel_id) order by id) from negocios where id in (n1, n2)));
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('6b_erro', sqlerrm); end if;
  end;

  raise exception 'RESULTADO_TESTE_SEM_DONO %', res::text;
end $t$;
