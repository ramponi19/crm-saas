-- Teste da 20261124001700_posvenda_acoes (C7 bloco 1). Banco local descartável, JM de teste (empresa 1, loja 3 = matriz):
-- vendedores M1 …0101 e M2 …0102, administrador A …0201, dono a632…; empresa 5 com o dono dela. Horário padrão seg–sex.
-- As chamadas rodam com a sessão de cada pessoa (request.jwt.claims); os privilégios de execução são conferidos à parte.
-- Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  hoje date := posvenda_dia_local(1, now());
  amanha_meio_dia timestamptz;
  sab date; c_cad bigint; c_passo bigint; c_jor bigint; ct bigint; ct2 bigint; n bigint; n2 bigint; n3 bigint;
  ac bigint[] := '{}'; k int; v jsonb; e text; x bigint; ch bigint; ch2 bigint; cat bigint; st_and bigint; st_res bigint; st_abe bigint;
  owner5 uuid;
begin
  amanha_meio_dia := ((hoje + 1) + time '12:00') at time zone 'America/Sao_Paulo';
  sab := hoje + ((6 - extract(isodow from hoje)::int + 7) % 7);
  if sab = hoje then sab := sab + 7; end if;
  select usuario_id into owner5 from empresa_usuarios where empresa_id = 5 and role = 'owner' limit 1;

  -- 1. sementes: ligar o módulo semeia; chamar de novo não duplica; outra empresa não é tocada
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  res := res || jsonb_build_object('1_sementes', jsonb_build_object(
    'status', (select jsonb_agg(tipo order by ordem) from posvenda_chamado_status where empresa_id = 1),
    'categorias', (select count(*) from posvenda_chamado_categorias where empresa_id = 1),
    'sla', (select jsonb_object_agg(prioridade, jsonb_build_array(primeira_resposta_horas, resolucao_horas)) from posvenda_chamado_sla where empresa_id = 1 and categoria_id is null),
    'nps', (select count(*) from posvenda_pesquisas where empresa_id = 1 and tipo = 'nps'),
    'de_novo', posvenda_instalar(1),
    'empresa_5_intocada', (select count(*) from posvenda_chamado_status where empresa_id = 5)));

  -- prazos deste teste em horas corridas (horas de loja aberta: teste-posvenda-sla-loja-aberta)
  delete from configuracoes_sistema where empresa_id = 1 and chave = 'posvenda.sla_horas';
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.sla_horas', '{"empresa": "corridas", "lojas": {}}');

  -- base: régua e acompanhamentos pendentes de M1 (amanhã ao meio-dia), como a jornada criaria
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua de teste') returning id into c_cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, c_cad, 1, 1, 'whatsapp', 'D+1') returning id into c_passo;
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C7 cliente') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ct, n, c_cad, now()) returning id into c_jor;
  for k in 1..7 loop
    insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, c_jor, c_passo, ct, n, M1, 'vendedor', amanha_meio_dia) returning id into x;
    ac := ac || x;
  end loop;

  -- 2. módulo desligado: a ação recusa
  update empresa_modulos set ativo = false where empresa_id = 1 and modulo = 'posvenda';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  begin perform posvenda_registrar(ac[1], 'feito'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('2_modulo_desligado', e);
  update empresa_modulos set ativo = true where empresa_id = 1 and modulo = 'posvenda';

  -- 3. permissão: outro vendedor não registra; outra empresa não enxerga
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M2, 'role', 'authenticated')::text, true);
  begin perform posvenda_registrar(ac[1], 'feito'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('3a_outro_vendedor', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner5, 'role', 'authenticated')::text, true);
  begin perform posvenda_registrar(ac[1], 'feito'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('3b_outra_empresa', e);

  -- 4. feito pelo responsável; registrar de novo recusa; o administrador registra o de outra pessoa
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  v := posvenda_registrar(ac[1], 'feito', 'cliente satisfeito', 'tudo certo');
  begin perform posvenda_registrar(ac[1], 'feito'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform posvenda_registrar(ac[2], 'feito');
  res := res || jsonb_build_object('4_feito', jsonb_build_object(
    'status', v ->> 'status',
    'gravou', (select resultado = 'cliente satisfeito' and observacao = 'tudo certo' and feito_por = M1 and feito_em is not null from posvenda_acompanhamentos where id = ac[1]),
    'de_novo', e,
    'admin_registra', (select status || '/' || (feito_por = A)::text from posvenda_acompanhamentos where id = ac[2])));

  -- 5. sem resposta: 1ª e 2ª remarcam para o próximo dia aberto (mesma hora); a 3ª encerra
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  v := posvenda_registrar(ac[3], 'sem_resposta');
  res := res || jsonb_build_object('5a_primeira', jsonb_build_object('status', v ->> 'status', 'tentativas', (v ->> 'tentativas')::int,
    'proximo_dia_aberto', (select posvenda_dia_local(1, previsto_para) = core_proximo_dia_aberto(1, 3, hoje)
                                  and (previsto_para at time zone 'America/Sao_Paulo')::time = '12:00' from posvenda_acompanhamentos where id = ac[3])));
  perform posvenda_registrar(ac[3], 'sem_resposta');
  v := posvenda_registrar(ac[3], 'sem_resposta');
  res := res || jsonb_build_object('5b_terceira', jsonb_build_object('status', v ->> 'status', 'tentativas', (v ->> 'tentativas')::int));

  -- 6. reagendar: sábado cai na segunda (loja fechada); data passada recusa
  v := posvenda_registrar(ac[4], 'reagendar', null, null, sab);
  begin perform posvenda_registrar(ac[5], 'reagendar', null, null, hoje - 1); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('6_reagendar', jsonb_build_object('status', v ->> 'status',
    'sabado_vira_segunda', (select posvenda_dia_local(1, previsto_para) = sab + 2 from posvenda_acompanhamentos where id = ac[4]),
    'data_passada', e));

  -- 7. pular: sem motivo recusa; com motivo grava
  begin perform posvenda_registrar(ac[5], 'pular'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  v := posvenda_registrar(ac[5], 'pular', 'cliente pediu para não ligar');
  begin perform posvenda_registrar(ac[6], 'qualquer'); exception when others then res := res || jsonb_build_object('7c_acao_invalida', split_part(sqlerrm, ':', 1)); end;
  res := res || jsonb_build_object('7_pular', jsonb_build_object('sem_motivo', e, 'status', v ->> 'status',
    'motivo', (select motivo from posvenda_acompanhamentos where id = ac[5])));

  -- 8. NPS: nota 9 não abre chamado e conclui o passo; nota 5 abre (administradores); nota 2 abre com prioridade alta;
  --    registrar de novo atualiza a nota sem outro chamado
  v := posvenda_nps_registrar(n, 9, 'ótimo atendimento', ac[6]);
  res := res || jsonb_build_object('8a_nota_9', jsonb_build_object('chamado', v -> 'chamado_id',
    'resposta', (select nota || '/' || canal || '/' || (vendedor_id = M1)::text from posvenda_respostas where id = (v ->> 'resposta_id')::bigint),
    'passo', (select status || '/' || resultado from posvenda_acompanhamentos where id = ac[6])));
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C7 detrator') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n2;
  v := posvenda_nps_registrar(n2, 5, 'demorou a entrega');
  ch := (v ->> 'chamado_id')::bigint;
  res := res || jsonb_build_object('8b_nota_5', (select jsonb_build_object('origem', c.origem, 'prioridade', c.prioridade, 'status', s.tipo,
      'responsavel_admin_ou_dono', c.origem_responsavel in ('administradores', 'dono'), 'titulo', c.titulo, 'descricao', c.descricao,
      'sla_24h', c.sla_resposta_vence - c.aberto_em = interval '24 hours', 'eventos', (select count(*) from posvenda_chamado_eventos where chamado_id = c.id))
    from posvenda_chamados c join posvenda_chamado_status s on s.id = c.status_id where c.id = ch));
  v := posvenda_nps_registrar(n2, 2, 'piorou');
  res := res || jsonb_build_object('8c_de_novo', jsonb_build_object('chamado', v -> 'chamado_id',
    'respostas', (select count(*) || '/' || max(nota) from posvenda_respostas where negocio_id = n2),
    'chamados', (select count(*) from posvenda_chamados where negocio_id = n2)));
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C7 muito insatisfeito') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n3;
  v := posvenda_nps_registrar(n3, 1);
  res := res || jsonb_build_object('8d_nota_1_alta', (select prioridade || '/' || numero from posvenda_chamados where id = (v ->> 'chamado_id')::bigint));
  begin perform posvenda_nps_registrar(n3, 11); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('8e_nota_11', e);
  -- limite da empresa: 8 → nota 7 abre
  begin
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.nps_limite_chamado', '{"empresa": 8, "lojas": {}}');
    insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'C7 passivo') returning id into ct2;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
      values (1, 3, ct2, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into x;
    res := res || jsonb_build_object('8f_limite_8_nota_7_abre', posvenda_nps_registrar(x, 7) -> 'chamado_id' is not null and posvenda_nps_registrar(x, 7) ->> 'chamado_id' is null);
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('8f_erro', sqlerrm); end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M2, 'role', 'authenticated')::text, true);
  begin perform posvenda_nps_registrar(n, 10); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('8g_outro_vendedor', e);

  -- 9. chamado manual (vendedor abre; vai para os administradores); SLA da categoria vence o geral
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  select id into cat from posvenda_chamado_categorias where empresa_id = 1 and nome = 'Defeito ou garantia';
  insert into posvenda_chamado_sla (empresa_id, categoria_id, prioridade, primeira_resposta_horas, resolucao_horas) values (1, cat, 'normal', 4, 48);
  v := posvenda_chamado_abrir(ct, 'Tela com mancha', 'apareceu depois de 3 dias', cat, 'normal', n3);
  ch2 := (v ->> 'id')::bigint;
  res := res || jsonb_build_object('9_manual', (select jsonb_build_object('numero', c.numero, 'origem', c.origem, 'criado_por_M1', c.criado_por = M1,
      'responsavel_nao_e_M1', c.responsavel_id <> M1, 'sla_da_categoria', c.sla_resposta_vence - c.aberto_em = interval '4 hours'
                                                                        and c.sla_resolucao_vence - c.aberto_em = interval '48 hours')
    from posvenda_chamados c where c.id = ch2));
  begin perform posvenda_chamado_abrir(ct, '  '); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('9b_sem_titulo', e);
  begin perform posvenda_chamado_abrir(ct, 'x', null, null, 'altissima'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('9c_prioridade', e);

  -- 10. mover: o vendedor que abriu não mexe (não é o responsável); o admin anda, resolve, reabre e passa para M1
  begin perform posvenda_chamado_mover(ch2, null, 'olhando'); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('10a_vendedor_nao_responsavel', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  select id into st_and from posvenda_chamado_status where empresa_id = 1 and tipo = 'andamento';
  select id into st_res from posvenda_chamado_status where empresa_id = 1 and tipo = 'resolvido';
  select id into st_abe from posvenda_chamado_status where empresa_id = 1 and tipo = 'aberto';
  v := posvenda_chamado_mover(ch2, st_and, 'liguei para o cliente');
  res := res || jsonb_build_object('10b_andamento', jsonb_build_object('primeira_resposta', v ->> 'primeira_resposta_em' is not null, 'resolvido', v -> 'resolvido_em'));
  v := posvenda_chamado_mover(ch2, st_res, 'trocado na garantia');
  res := res || jsonb_build_object('10c_resolvido', v ->> 'resolvido_em' is not null);
  v := posvenda_chamado_mover(ch2, st_abe, 'voltou com o mesmo defeito');
  res := res || jsonb_build_object('10d_reaberto', jsonb_build_object('resolvido', v -> 'resolvido_em', 'primeira_resposta_fica', v ->> 'primeira_resposta_em' is not null));
  v := posvenda_chamado_mover(ch2, null, null, M1);
  res := res || jsonb_build_object('10e_passou_para_M1', (select (responsavel_id = M1)::text || '/' || origem_responsavel from posvenda_chamados where id = ch2));
  res := res || jsonb_build_object('10f_eventos', (select jsonb_agg(tipo || coalesce(':' || para, '') order by id) from posvenda_chamado_eventos where chamado_id = ch2
                                                     and tipo <> 'atribuicao'));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  perform posvenda_chamado_mover(ch2, null, 'agora é comigo');
  begin perform posvenda_chamado_mover(ch2, null, null, M2); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('10g_M1_nota_mas_nao_repassa', jsonb_build_object('nota', (select count(*) from posvenda_chamado_eventos where chamado_id = ch2 and tipo = 'nota'), 'repassar', e));

  -- 11. quem pode chamar: as ações são da sessão; as internas, só do servidor
  res := res || jsonb_build_object('11_privilegios', jsonb_build_object(
    'authenticated_registra', has_function_privilege('authenticated', 'posvenda_registrar(bigint,text,text,text,date)', 'execute'),
    'authenticated_abre', has_function_privilege('authenticated', 'posvenda_chamado_abrir(bigint,text,text,bigint,text,bigint,bigint)', 'execute'),
    'anon_registra', has_function_privilege('anon', 'posvenda_registrar(bigint,text,text,text,date)', 'execute'),
    'authenticated_instala', has_function_privilege('authenticated', 'posvenda_instalar(bigint)', 'execute'),
    'authenticated_cria_direto', has_function_privilege('authenticated', 'posvenda_chamado_criar(bigint,bigint,text,text,bigint,text,bigint,bigint,bigint,text,uuid)', 'execute')));

  raise exception 'RESULTADO_TESTE_POSVENDA_ACOES %', res::text;
end $t$;
