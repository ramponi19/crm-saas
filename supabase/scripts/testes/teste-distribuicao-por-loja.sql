-- Teste da 5b (20261126001100/0110: distribuição por loja). Semente: empresa 1 (JM de teste, lojas 3 matriz e 6) e 5
-- (Demonstração, uma loja). Termina com RAISE: nada fica gravado.
do $teste$
declare
  r jsonb := '{}'; e text; m_sem jsonb := '{}'; m_com jsonb := '{}'; v jsonb; n0 bigint; n1 bigint; l record; x record;
  DONO constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  ADM  constant uuid := '0e5e0000-0000-4000-8000-000000000201';
  M1   constant uuid := '0e5e0000-0000-4000-8000-000000000101';
  J2   constant uuid := '0e5e0000-0000-4000-8000-000000000104';
begin
  -- 1. matriz de distribuição (roleta, liberação, roleta do pós-venda) por loja: sem listas (regra antiga) = com a semente
  begin
    delete from distribuicao_listas;
    for l in select empresa_id, id from filiais where ativo and empresa_id in (1, 5) order by id loop
      m_sem := m_sem || jsonb_build_object(l.id::text, jsonb_build_object('roleta', core_roleta_elegiveis(l.empresa_id, l.id),
        'liberacao', core_liberacao_elegiveis(l.empresa_id, l.id), 'posvenda', posvenda_vendedores_da_loja(l.empresa_id, l.id)));
    end loop;
    raise exception 'DESFAZ';
  exception when raise_exception then null;
  end;
  for l in select empresa_id, id from filiais where ativo and empresa_id in (1, 5) order by id loop
    m_com := m_com || jsonb_build_object(l.id::text, jsonb_build_object('roleta', core_roleta_elegiveis(l.empresa_id, l.id),
      'liberacao', core_liberacao_elegiveis(l.empresa_id, l.id), 'posvenda', posvenda_vendedores_da_loja(l.empresa_id, l.id)));
  end loop;
  -- (a loja da comissão saiu em 26/11: comissão é da pessoa; ver teste-comissao-da-pessoa.sql)
  r := r || jsonb_build_object('1_matriz_igual', m_sem = m_com, '1_lojas', (select count(*) from jsonb_object_keys(m_com)));

  -- 2. ausente continua na lista, mas fora da roleta na hora
  update empresa_usuarios set ausente = true where usuario_id = M1 and empresa_id = 1;
  r := r || jsonb_build_object('2_ausente_fora', not (M1 = any (core_roleta_elegiveis(1, 3))), '2_ausente_na_lista', M1 = any (distribuicao_lista(1, 3, 'roleta')));
  update empresa_usuarios set ausente = false where usuario_id = M1 and empresa_id = 1;

  -- 3. o dono configura: liberação da loja 3 só com M1; roleta da loja 6 vazia; reserva da loja 6 = J2 (auditado)
  perform set_config('request.jwt.claims', jsonb_build_object('sub', DONO::text, 'role', 'authenticated')::text, true);
  select count(*) into n0 from auditoria_eventos where entidade = 'distribuicao';
  perform distribuicao_salvar(3, 'liberacao', array[M1]);
  perform distribuicao_salvar(6, 'roleta', array[]::uuid[]);
  v := distribuicao_salvar(6, 'reserva_posvenda', array[J2]);
  select count(*) into n1 from auditoria_eventos where entidade = 'distribuicao';
  r := r || jsonb_build_object('3_auditados', n1 - n0, '3_reserva', v ->> 'lista',
    '3_liberacao_3', core_liberacao_elegiveis(1, 3) = array[M1], '3_roleta_3_inalterada', to_jsonb(core_roleta_elegiveis(1, 3)) = m_com -> '3' -> 'roleta',
    '3_roleta_6_vazia', cardinality(core_roleta_elegiveis(1, 6)), '3_proximo_lead_6', coalesce(core_roleta_leads_proximo(1, 6)::text, 'ninguém'));

  -- 4. reserva do pós-venda da loja 6: sem vendedor do negócio e roleta vazia → a reserva; ausente → administradores/dono
  select * into x from posvenda_resolver_responsavel(1, 6, 'acompanhamento', null, (now() at time zone 'America/Sao_Paulo')::date + 1);
  r := r || jsonb_build_object('4_reserva', jsonb_build_object('e_j2', x.responsavel_id = J2, 'origem', x.origem));
  update empresa_usuarios set ausente = true where usuario_id = J2 and empresa_id = 1;
  select * into x from posvenda_resolver_responsavel(1, 6, 'acompanhamento', null, (now() at time zone 'America/Sao_Paulo')::date);
  r := r || jsonb_build_object('4_reserva_ausente', x.origem);
  update empresa_usuarios set ausente = false where usuario_id = J2 and empresa_id = 1;

  -- 5. recusas: quem não enxerga a loja não entra; vendedor não salva; admin não muda a comissão do dono
  begin perform distribuicao_salvar(3, 'roleta', array[J2]); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('5_fora_da_loja', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ADM::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1::text, 'role', 'authenticated')::text, true);
  begin perform distribuicao_salvar(3, 'roleta', array[M1]); e := 'passou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  r := r || jsonb_build_object('5_vendedor_salva', e);

  -- 6. pessoa nova entra na roleta e na liberação da loja principal
  delete from distribuicao_participantes where usuario_id = J2;
  perform distribuicao_incluir_pessoa(1, J2);
  r := r || jsonb_build_object('6_incluida', (select jsonb_agg(lista order by lista) from distribuicao_participantes where usuario_id = J2));
  raise exception 'RESULTADO_TESTE_DISTRIBUICAO_POR_LOJA %', r::text;
end $teste$;
