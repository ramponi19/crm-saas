-- Teste da 20261124001600_liberacao_diaria. JM de teste (empresa 1), matriz = loja 3 (M1, M2, SL na roleta: dono e
-- administradores ficam fora, participa_roleta = false). Horário padrão seg–sex 9h–18h. Relógio fixo: terça 24/11/2026.
-- Cada caso numa subtransação desfeita. Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  SL uuid := '0e5e0000-0000-4000-8000-000000000103';
  TER constant timestamptz := '2026-11-24 10:00 America/Sao_Paulo';
  SEG constant timestamptz := '2026-11-23 10:00 America/Sao_Paulo';
  SAB constant timestamptz := '2026-11-28 10:00 America/Sao_Paulo';
  ct bigint; n bigint; k int; r jsonb; ids bigint[] := '{}';
begin
  -- 5b (26/11/2026): este teste prova a REGRA ANTIGA (vínculo + participa_roleta), que continua valendo na loja
  -- sem lista de distribuição. Desliga as listas aqui dentro (a transação é desfeita no fim); a lista é provada em
  -- teste-distribuicao-por-loja.sql.
  delete from public.distribuicao_listas;
  create temp table _n (u uuid primary key, n text) on commit drop;
  insert into _n values (M1,'M1'),(M2,'M2'),(SL,'SL');
  update empresa_usuarios set participa_roleta = false where empresa_id = 1 and role in ('owner', 'admin');
  delete from configuracoes_sistema where empresa_id = 1 and chave in ('distribuicao.liberacao_diaria', 'core.horario');
  -- só os do teste contam: as conversas da semente ficam sem mensagem recente do cliente
  update conversas set ultima_recebida_at = TER - interval '30 days' where empresa_id = 1 and ultima_recebida_at is not null;

  -- 8 leads na esteira da matriz, cliente escreveu há k horas (k = 1..8)
  for k in 1..8 loop
    insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'ESTEIRA ' || k) returning id into ct;
    insert into conversas (empresa_id, filial_id, contato_id, ultima_recebida_at, ultima_mensagem_at)
      values (1, 3, ct, TER - make_interval(hours => k), TER - make_interval(hours => k));
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
      values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n;
    ids := ids || n;
  end loop;
  -- os que NÃO entram: cliente há 20 dias; arquivado; já com responsável (todos com mensagem recente, menos o de 20 dias)
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'VELHO') returning id into ct;
  insert into conversas (empresa_id, filial_id, contato_id, ultima_recebida_at) values (1, 3, ct, TER - interval '20 days');
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}');
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'ARQUIVADO') returning id into ct;
  insert into conversas (empresa_id, filial_id, contato_id, ultima_recebida_at) values (1, 3, ct, TER - interval '30 minutes');
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":false}}');
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'COM DONO') returning id into ct;
  insert into conversas (empresa_id, filial_id, contato_id, ultima_recebida_at) values (1, 3, ct, TER - interval '20 minutes');
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados) values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}');

  -- 1. sem a chave: nada
  res := res || jsonb_build_object('1_desligado', core_liberar_lote_esteira(1, 3, null, TER) -> '3' ->> 'pulado');

  -- 2. ligada (2 por pessoa): os 6 mais recentes, M1/M2/SL; atribuição manual com o motivo; os outros ficam
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.liberacao_diaria',
      '{"empresa": {"ativo": true, "por_vendedor": 2, "pular_primeiro_dia": false}, "lojas": {}}');
    r := core_liberar_lote_esteira(1, 3, null, TER);
    res := res || jsonb_build_object('2_lote', jsonb_build_object(
      'liberados', (r -> '3' ->> 'liberados')::int,
      'por_pessoa', (select jsonb_object_agg(_n.n, (r -> '3' -> 'por_pessoa' ->> _n.u::text)::int) from _n),
      'os_mais_recentes', (select bool_and(responsavel_id is not null) from negocios where id = any(ids[1:6]))
                          and (select bool_and(responsavel_id is null) from negocios where id = any(ids[7:8])),
      'motivo', (select count(*) from negocio_historico where negocio_id = any(ids) and detalhe ->> 'motivo' = 'liberação diária da esteira'),
      'manual', (select count(*) from negocios where id = any(ids) and dados -> '_lead' -> 'posse' ->> 'acao' = 'atribuir'),
      'pulados_continuam', (select count(*) from negocios n2 join contatos c on c.id = n2.contato_id
                              where c.nome in ('VELHO', 'ARQUIVADO', 'COM DONO') and (n2.responsavel_id is null or n2.responsavel_id = M1)
                                and not exists (select 1 from negocio_historico h where h.negocio_id = n2.id and h.detalhe ->> 'motivo' = 'liberação diária da esteira'))));
    -- 3. de novo no mesmo dia: não libera outra vez. O histórico nasce com now(); o teste simula a terça 24/11,
    --    então o lote fica datado na terça (senão o teste só passa no dia em que roda — falhou em 25/11/2026).
    update negocio_historico set em = TER where negocio_id = any(ids) and detalhe ->> 'motivo' = 'liberação diária da esteira';
    res :=res || jsonb_build_object('3_mesmo_dia', core_liberar_lote_esteira(1, 3, null, TER + interval '2 hours') -> '3' ->> 'pulado');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('2_erro', sqlerrm); end if;
  end;

  -- 4. antes da abertura, 5. primeiro dia da semana com a opção, 6. sábado (loja fechada)
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.liberacao_diaria',
      '{"empresa": {"ativo": true, "por_vendedor": 2, "pular_primeiro_dia": true}, "lojas": {}}');
    res := res || jsonb_build_object(
      '4_antes_da_abertura', core_liberar_lote_esteira(1, 3, null, '2026-11-24 08:30 America/Sao_Paulo') -> '3' ->> 'pulado',
      '5a_segunda_pulada', core_liberar_lote_esteira(1, 3, null, SEG) -> '3' ->> 'pulado',
      '6_sabado_fechado', core_liberar_lote_esteira(1, 3, null, SAB) -> '3' ->> 'pulado',
      '5b_terca_libera', (core_liberar_lote_esteira(1, 3, null, TER) -> '3' ->> 'liberados')::int);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('4_erro', sqlerrm); end if;
  end;

  -- 5c. semana que abre na terça (segunda fechada): a terça é o primeiro dia e é pulada
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.liberacao_diaria',
      '{"empresa": {"ativo": true, "por_vendedor": 2, "pular_primeiro_dia": true}, "lojas": {}}');
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'core.horario', jsonb_build_object('empresa', jsonb_build_object('semana',
      '{"0":[],"1":[],"2":[{"abre":"09:00","fecha":"18:00"}],"3":[{"abre":"09:00","fecha":"18:00"}],"4":[{"abre":"09:00","fecha":"18:00"}],"5":[{"abre":"09:00","fecha":"18:00"}],"6":[]}'::jsonb), 'lojas', '{}'::jsonb));
    res := res || jsonb_build_object('5c_terca_e_o_primeiro_dia', core_liberar_lote_esteira(1, 3, null, TER) -> '3' ->> 'pulado');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('5c_erro', sqlerrm); end if;
  end;

  -- 7. ausente e fora da roleta não recebem
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'distribuicao.liberacao_diaria',
      '{"empresa": {"ativo": true, "por_vendedor": 2}, "lojas": {}}');
    update empresa_usuarios set ausente = true where empresa_id = 1 and usuario_id = M2;
    update empresa_usuarios set participa_roleta = false where empresa_id = 1 and usuario_id = SL;
    r := core_liberar_lote_esteira(1, 3, null, TER);
    res := res || jsonb_build_object('7_so_M1', jsonb_build_object('liberados', (r -> '3' ->> 'liberados')::int,
      'pessoas', (select jsonb_agg(_n.n order by _n.n) from _n where (r -> '3' -> 'por_pessoa') ? _n.u::text)));
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('7_erro', sqlerrm); end if;
  end;

  -- 8. o agendamento existe e roda sem erro para todas as empresas com a chave
  res := res || jsonb_build_object('8_agendamento', (select schedule from cron.job where jobname = 'liberacao-diaria-esteira'));

  raise exception 'RESULTADO_TESTE_LIBERACAO %', res::text;
end $t$;
