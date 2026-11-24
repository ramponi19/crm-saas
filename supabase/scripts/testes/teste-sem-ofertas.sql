-- Teste da 20261124001900_sem_ofertas. JM de teste (empresa 1, lojas 3 e 6): vendedor M1 …0101, Administrador A …0201.
-- Cada caso numa subtransação desfeita quando precisa. Termina com RAISE: nada fica gravado.
do $t$
declare
  res jsonb := '{}';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; A uuid := '0e5e0000-0000-4000-8000-000000000201';
  ca bigint; cb bigint; n bigint; cad bigint; p_mk bigint; p_ut bigint; m_mk bigint; m_ut bigint; jor bigint;
  a_mk bigint; a_ut bigint; x bigint; k_wa bigint; k_ig bigint; cv_wa bigint; cv_ig bigint; msg bigint; v jsonb; e text;
begin
  -- dois contatos do MESMO cliente (mesmo telefone), um em cada loja
  insert into contatos (empresa_id, filial_id, nome, telefone_e164) values (1, 3, 'Carla Ofertas Silva', '+5519900001111') returning id into ca;
  insert into contatos (empresa_id, filial_id, nome, telefone) values (1, 6, 'Carla O.', '(19) 90000-1111') returning id into cb;  -- a outra loja: só o telefone
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ca, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into n;
  insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status) values (1, 'so_teste_mk', 'pt_BR', 'MARKETING', 'Oferta {{1}}', 'aprovado') returning id into m_mk;
  insert into modelos_mensagem (empresa_id, nome, idioma, categoria, corpo, status) values (1, 'so_teste_ut', 'pt_BR', 'UTILITY', 'Aviso {{1}}', 'aprovado') returning id into m_ut;
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua sem ofertas') returning id into cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, modelo_id) values (1, cad, 1, 30, 'whatsapp', 'Acessórios', m_mk) returning id into p_mk;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, modelo_id) values (1, cad, 2, 90, 'whatsapp', 'Cuidado', m_ut) returning id into p_ut;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ca, n, cad, now()) returning id into jor;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, jor, p_mk, ca, n, M1, 'vendedor', now() + interval '30 days') returning id into a_mk;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 3, jor, p_ut, ca, n, M1, 'vendedor', now() + interval '90 days') returning id into a_ut;
  insert into canais (empresa_id, filial_id, tipo, external_id, status, via) values (1, 3, 'whatsapp', 'teste-sem-ofertas-wa', 'ativo', 'pagina') returning id into k_wa;
  insert into canais (empresa_id, filial_id, tipo, external_id, status, via) values (1, 3, 'instagram', 'teste-sem-ofertas-ig', 'ativo', 'instagram') returning id into k_ig;
  insert into conversas (empresa_id, filial_id, contato_id, canal_id) values (1, 3, ca, k_wa) returning id into cv_wa;
  insert into conversas (empresa_id, filial_id, contato_id, canal_id) values (1, 3, ca, k_ig) returning id into cv_ig;

  -- 1. outro texto não marca; Instagram com o texto do botão não marca
  insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo) values (1, 3, ca, k_wa, cv_wa, 'recebida', 'Quero ver', 'texto') returning id into msg;
  res := res || jsonb_build_object('1a_outro_texto', core_sem_ofertas_pelo_botao(msg) -> 'marcado');
  insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo) values (1, 3, ca, k_ig, cv_ig, 'recebida', 'Não quero receber ofertas', 'texto') returning id into msg;
  res := res || jsonb_build_object('1b_instagram', core_sem_ofertas_pelo_botao(msg) -> 'marcado');

  -- 2. o botão no WhatsApp (caixa, acento e espaços diferentes): marca os dois contatos do mesmo telefone, pula o passo
  --    de Marketing, mantém o de Utilidade e devolve a confirmação com o primeiro nome
  insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo) values (1, 3, ca, k_wa, cv_wa, 'recebida', '  nao QUERO receber   ofertas ', 'texto') returning id into msg;
  v := core_sem_ofertas_pelo_botao(msg);
  res := res || jsonb_build_object('2_botao', jsonb_build_object(
    'marcado', v -> 'marcado', 'confirmacao', v ->> 'confirmacao', 'telefone', v ->> 'telefone', 'negocio', (v ->> 'negocio_id')::bigint = n,
    'dois_contatos', (select count(*) from contatos where id in (ca, cb) and sem_ofertas_em is not null),
    'passo_marketing', (select status || '/' || motivo from posvenda_acompanhamentos where id = a_mk),
    'passo_utilidade', (select status from posvenda_acompanhamentos where id = a_ut)));
  -- 3. tocar de novo: continua marcado, sem segunda confirmação
  insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo) values (1, 3, ca, k_wa, cv_wa, 'recebida', 'Não quero receber ofertas', 'texto') returning id into msg;
  v := core_sem_ofertas_pelo_botao(msg);
  res := res || jsonb_build_object('3_de_novo', jsonb_build_object('ja_estava', v -> 'ja_estava', 'confirmacao', v -> 'confirmacao'));

  -- 4. passo novo de Marketing para quem não quer ofertas já nasce pulado; o de Utilidade nasce pendente
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 6, jor, p_mk, cb, n, M1, 'vendedor', now() + interval '330 days') returning id into x;
  res := res || jsonb_build_object('4a_nasce_pulado', (select status from posvenda_acompanhamentos where id = x));
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
    values (1, 6, jor, p_ut, cb, n, M1, 'vendedor', now() + interval '200 days') returning id into x;
  res := res || jsonb_build_object('4b_utilidade_pendente', (select status from posvenda_acompanhamentos where id = x));

  -- 5. a equipe: vendedor não desfaz; administrador desfaz (os dois contatos); vendedor marca de novo
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  begin perform contato_sem_ofertas(ca, false); e := 'FALHOU: aceitou'; exception when others then e := split_part(sqlerrm, ':', 1); end;
  res := res || jsonb_build_object('5a_vendedor_desfaz', e);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform contato_sem_ofertas(ca, false);
  res := res || jsonb_build_object('5b_admin_desfaz', (select count(*) from contatos where id in (ca, cb) and sem_ofertas_em is null));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  perform contato_sem_ofertas(cb, true);
  res := res || jsonb_build_object('5c_vendedor_marca', (select count(*) from contatos where id in (ca, cb) and sem_ofertas_em is not null),
                                   '5d_origem', (select sem_ofertas_origem like 'marcado pela equipe%' from contatos where id = cb));

  -- 6. texto do botão e confirmação da empresa (core.sem_ofertas)
  begin
    update contatos set sem_ofertas_em = null where id in (ca, cb);
    insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'core.sem_ofertas',
      '{"empresa": {"botoes": ["Parar promoções"], "confirmacao": "Feito, {{nome}}! Sem promoções daqui para a frente."}, "lojas": {}}');
    insert into mensagens (empresa_id, filial_id, contato_id, canal_id, conversa_id, direcao, conteudo, tipo) values (1, 3, ca, k_wa, cv_wa, 'recebida', 'Parar promoções', 'texto') returning id into msg;
    res := res || jsonb_build_object('6_da_empresa', core_sem_ofertas_pelo_botao(msg) ->> 'confirmacao');
    raise exception 'desfaz';
  exception when others then if sqlerrm <> 'desfaz' then res := res || jsonb_build_object('6_erro', sqlerrm); end if;
  end;

  -- 7. permissões
  res := res || jsonb_build_object('7_privilegios', jsonb_build_object(
    'sessao_marca', has_function_privilege('authenticated', 'contato_sem_ofertas(bigint,boolean)', 'execute'),
    'sessao_pelo_botao', has_function_privilege('authenticated', 'core_sem_ofertas_pelo_botao(bigint)', 'execute'),
    'sessao_aplicar', has_function_privilege('authenticated', 'core_sem_ofertas_aplicar(bigint,bigint,boolean,text)', 'execute')));

  raise exception 'RESULTADO_TESTE_SEM_OFERTAS %', res::text;
end $t$;
