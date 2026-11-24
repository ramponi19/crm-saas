-- Teste da 20261124002400_posvenda_rotina_diaria. JM de teste (empresa 1, loja 3, M1/M2 vendedores, A admin). Termina com RAISE.
do $t$
declare
  res jsonb := '{}'; M1 uuid := '0e5e0000-0000-4000-8000-000000000101'; M2 uuid := '0e5e0000-0000-4000-8000-000000000102';
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
  d date; agora timestamptz; abre time; cad bigint; p_tol bigint; p_rep bigint; ct bigint; n bigint; jor bigint;
  a_velho bigint; a_novo bigint; a_rep bigint; a_aus bigint; a_fut bigint; ch bigint; v jsonb; err text; venc_antes timestamptz;
  st_agu bigint; st_and bigint; st_ter bigint;
begin
  delete from empresa_modulos where empresa_id = 1 and modulo = 'posvenda';
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true);
  update posvenda_cadencias set ativo = false where empresa_id = 1;
  -- um dia em que a loja 3 abre (hoje ou o próximo), ao meio-dia
  d := core_dia_aberto(1, 3, posvenda_dia_local(1, now()));
  select min((i ->> 'abre')::time) into abre from jsonb_array_elements(core_intervalos_do_dia(1, 3, d)) i;
  agora := (d + time '12:00') at time zone 'America/Sao_Paulo';

  -- o negócio nasce antes da régua (sem régua ativa, o gatilho não cria jornada; a deste teste é montada à mão)
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'Rotina') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, ganho_em, dados)
    values (1, 3, ct, 1, 18, 'ganho', M1, ((d - 40) + time '12:00') at time zone 'America/Sao_Paulo', jsonb_build_object('_lead', jsonb_build_object('ativo', true),
      'venda', jsonb_build_object('data', (d - 40)::text, 'categoria_id', 1, 'condicao', 'novo', 'valor', 1))) returning id into n;
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Rotina') returning id into cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, tolerancia_dias)
    values (1, cad, 1, 1, 'ligacao', 'tolerância 2', 2) returning id into p_tol;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo, tolerancia_dias, repetir_intervalo, repetir_unidade)
    values (1, cad, 2, 0, 'tarefa_interna', 'mensal', 1, 1, 'meses') returning id into p_rep;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ct, n, cad, now()) returning id into jor;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia) values
    (1, 3, jor, p_tol, ct, n, M1, 'vendedor', ((d - 5) + time '10:00') at time zone 'America/Sao_Paulo', 1) returning id into a_velho;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia) values
    (1, 3, jor, p_tol, ct, n, M1, 'vendedor', ((d - 1) + time '10:00') at time zone 'America/Sao_Paulo', 2) returning id into a_novo;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia) values
    (1, 3, jor, p_rep, ct, n, M1, 'vendedor', ((d - 9) + time '10:00') at time zone 'America/Sao_Paulo', 1) returning id into a_rep;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia) values
    (1, 3, jor, p_tol, ct, n, M2, 'vendedor', (d + time '15:00') at time zone 'America/Sao_Paulo', 3) returning id into a_aus;
  insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para, ocorrencia) values
    (1, 3, jor, p_tol, ct, n, M2, 'vendedor', ((d + 3) + time '15:00') at time zone 'America/Sao_Paulo', 4) returning id into a_fut;
  update empresa_usuarios set ausente = true where empresa_id = 1 and usuario_id = M2;

  -- 1. antes da abertura não roda; depois roda uma vez; de novo no mesmo dia, nada
  delete from posvenda_rotina_execucoes where empresa_id = 1;
  v := posvenda_rotina_diaria((d + (abre - interval '1 hour')) at time zone 'America/Sao_Paulo');
  res := res || jsonb_build_object('1_antes_da_abertura', v -> '1' -> '3');
  v := posvenda_rotina_diaria(agora);
  res := res || jsonb_build_object('1_rodou', v -> '1' -> '3');
  v := posvenda_rotina_diaria(agora + interval '1 hour');
  res := res || jsonb_build_object('1_de_novo', v -> '1' -> '3');

  -- 2. tolerância: 5 dias de atraso (tolerância 2) → perdido; 1 dia → continua; o mensal perdido repete
  res := res || jsonb_build_object('2_tolerancia', jsonb_build_object(
    'atrasado_5_dias', (select status || ':' || coalesce(motivo, '') from posvenda_acompanhamentos where id = a_velho),
    'atrasado_1_dia', (select status from posvenda_acompanhamentos where id = a_novo),
    'mensal_perdido', (select status from posvenda_acompanhamentos where id = a_rep),
    'mensal_proxima', (select count(*) from posvenda_acompanhamentos where jornada_id = jor and passo_id = p_rep and ocorrencia = 2)));

  -- 3. ausência: o de hoje sai do M2; o de daqui a 3 dias fica com ele
  res := res || jsonb_build_object('3_ausencia', jsonb_build_object(
    'hoje_saiu_do_ausente', (select responsavel_id <> M2 from posvenda_acompanhamentos where id = a_aus),
    'futuro_fica', (select responsavel_id = M2 from posvenda_acompanhamentos where id = a_fut)));
  update empresa_usuarios set ausente = false where empresa_id = 1 and usuario_id = M2;

  -- 4. pausa do prazo (horas corridas para o teste não depender do horário)
  delete from configuracoes_sistema where empresa_id = 1 and chave in ('posvenda.sla_horas', 'posvenda.sla_pausa_terceiro');
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.sla_horas', '{"empresa": "corridas", "lojas": {}}');
  ch := posvenda_chamado_criar(1, ct, 'Teste da pausa', null, null, 'normal', n, null, null, 'manual', A);
  select id into st_agu from posvenda_chamado_status where empresa_id = 1 and tipo = 'aguardando_cliente' limit 1;
  select id into st_and from posvenda_chamado_status where empresa_id = 1 and tipo = 'andamento' limit 1;
  insert into posvenda_chamado_status (empresa_id, nome, tipo, ordem) values (1, 'Aguardando assistência', 'aguardando_terceiro', 9) returning id into st_ter;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  v := posvenda_chamado_mover(ch, st_agu, 'pedi a nota fiscal', null);
  res := res || jsonb_build_object('4_pausou', (v ->> 'sla_pausado_desde') is not null);
  update posvenda_chamados set sla_pausado_desde = now() - interval '10 hours' where id = ch;   -- 10 h parado
  select sla_resolucao_vence into venc_antes from posvenda_chamados where id = ch;
  v := posvenda_chamado_mover(ch, st_and, 'cliente mandou', null);
  res := res || jsonb_build_object('4_retomou', jsonb_build_object(
    'pausa_zerada', (v ->> 'sla_pausado_desde') is null,
    'prazo_andou_horas', (select round(extract(epoch from sla_resolucao_vence - venc_antes) / 3600) from posvenda_chamados where id = ch),
    'pausado_seg', (select sla_pausado_seg from posvenda_chamados where id = ch)));
  v := posvenda_chamado_mover(ch, st_ter, null, null);
  res := res || jsonb_build_object('4_terceiro_sem_config_nao_pausa', (v ->> 'sla_pausado_desde') is null);
  perform set_config('request.jwt.claims', '', true);
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.sla_pausa_terceiro', '{"empresa": true, "lojas": {}}');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  perform posvenda_chamado_mover(ch, st_and, null, null);
  v := posvenda_chamado_mover(ch, st_ter, null, null);
  res := res || jsonb_build_object('4_terceiro_com_config_pausa', (v ->> 'sla_pausado_desde') is not null);

  -- 5. leitura: o vendedor do negócio do cliente (M1) vê o chamado e o histórico; M2 não; M1 não mexe
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  res := res || jsonb_build_object('5_m1_ve', (select count(*) from posvenda_chamados where id = ch),
                                   '5_m1_ve_historico', (select count(*) > 0 from posvenda_chamado_eventos where chamado_id = ch));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M2, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('5_m2_nao_ve', (select count(*) from posvenda_chamados where id = ch));
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', M1, 'role', 'authenticated')::text, true);
  begin
    perform posvenda_chamado_mover(ch, st_agu, 'tentativa', null);
    err := 'passou';
  exception when others then err := split_part(sqlerrm, ':', 1);
  end;
  res := res || jsonb_build_object('5_m1_nao_mexe', err);
  perform set_config('request.jwt.claims', '', true);

  -- 6. "sem ofertas": {{ nome }} com espaços; 7. agendamento; 8. só o servidor roda a rotina
  res := res || jsonb_build_object(
    '6_nome_com_espacos', (select prosrc ~ 'regexp_replace\(v_texto' from pg_proc where oid = 'public.core_sem_ofertas_pelo_botao(bigint)'::regprocedure),
    '7_agendamento', (select schedule from cron.job where jobname = 'posvenda-rotina-diaria'),
    '8_so_servidor', has_function_privilege('authenticated', 'posvenda_rotina_diaria(timestamptz)', 'execute'));
  raise exception 'RESULTADO_TESTE_ROTINA %', res::text;
end $t$;
