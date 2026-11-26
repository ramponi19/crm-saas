-- Teste da 20261124001800_posvenda_sla_loja_aberta. JM de teste (empresa 1; loja 3 = matriz, loja 6). Termina com RAISE.
-- Horário da empresa: seg–sex 9h–18h, sábado 9h–13h, domingo fechado. Chamado Normal = 24 h (1ª resposta) / 72 h (resolução).
-- 1.1h parte 2 (26/11/2026): a H1 desligou a ponte envelope → empresa_config. Este teste carrega a configuração
-- pelo envelope antigo (atalho de carga dos dados); a ponte é ligada SÓ dentro da transação do teste (desfeita no fim).
alter table public.configuracoes_sistema enable trigger configuracoes_sistema_ponte;
do $t$
declare
  res jsonb := '{}';
  SEX constant timestamptz := '2026-11-27 17:00 America/Sao_Paulo';
  DOM constant timestamptz := '2026-11-29 10:00 America/Sao_Paulo';
  sem jsonb := '{"0":[],"1":[{"abre":"09:00","fecha":"18:00"}],"2":[{"abre":"09:00","fecha":"18:00"}],"3":[{"abre":"09:00","fecha":"18:00"}],
                 "4":[{"abre":"09:00","fecha":"18:00"}],"5":[{"abre":"09:00","fecha":"18:00"}],"6":[{"abre":"09:00","fecha":"13:00"}]}';
  sem_sab_fechado jsonb;
  ct bigint; n bigint; ch bigint; v jsonb;
  A uuid := '0e5e0000-0000-4000-8000-000000000201';
begin
  sem_sab_fechado := jsonb_set(sem, '{6}', '[]');
  delete from configuracoes_sistema where empresa_id = 1 and chave in ('core.horario', 'posvenda.sla_horas');
  insert into configuracoes_sistema (empresa_id, chave, valor)
  values (1, 'core.horario', jsonb_build_object('empresa', jsonb_build_object('semana', sem), 'lojas', '{}'::jsonb));

  -- 1. sem a chave = horas de loja aberta (padrão)
  res := res || jsonb_build_object('1_loja_aberta_padrao', jsonb_build_object(
    'resposta', to_char(posvenda_sla_vence(1, null, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'),
    'resolucao', to_char(posvenda_sla_vence(1, null, SEX, 72) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI')));

  -- 2. horas corridas
  insert into configuracoes_sistema (empresa_id, chave, valor) values (1, 'posvenda.sla_horas', '{"empresa": "corridas", "lojas": {}}');
  res := res || jsonb_build_object('2_corridas', jsonb_build_object(
    'resposta', to_char(posvenda_sla_vence(1, null, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'),
    'resolucao', to_char(posvenda_sla_vence(1, null, SEX, 72) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI')));

  -- 3. por loja: a loja 6 em horas de loja aberta enquanto a empresa está em corridas
  update configuracoes_sistema set valor = '{"empresa": "corridas", "lojas": {"6": "loja_aberta"}}' where empresa_id = 1 and chave = 'posvenda.sla_horas';
  res := res || jsonb_build_object('3_loja_6_loja_aberta', to_char(posvenda_sla_vence(1, 6, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'),
                                   '3_loja_3_corridas', to_char(posvenda_sla_vence(1, 3, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'));
  delete from configuracoes_sistema where empresa_id = 1 and chave = 'posvenda.sla_horas';

  -- 4. a loja com horário próprio (sábado fechado) usa o dela; sem loja, o da empresa
  update configuracoes_sistema set valor = jsonb_build_object('empresa', jsonb_build_object('semana', sem),
                                                              'lojas', jsonb_build_object('3', jsonb_build_object('semana', sem_sab_fechado)))
   where empresa_id = 1 and chave = 'core.horario';
  res := res || jsonb_build_object('4_loja_3_sabado_fechado', to_char(posvenda_sla_vence(1, 3, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'),
                                   '4_sem_loja_empresa', to_char(posvenda_sla_vence(1, null, SEX, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'));

  -- 5. aberto fora do expediente (domingo 10h): começa a contar na abertura de segunda
  res := res || jsonb_build_object('5_domingo', to_char(posvenda_sla_vence(1, null, DOM, 24) at time zone 'America/Sao_Paulo', 'Dy DD/MM HH24:MI'),
                                   '5_zero_horas', posvenda_sla_vence(1, null, SEX, 0) = SEX);

  -- 6. o chamado usa o cálculo, com a loja do negócio
  insert into empresa_modulos (empresa_id, modulo, ativo) values (1, 'posvenda', true) on conflict (empresa_id, modulo) do update set ativo = true;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', A, 'role', 'authenticated')::text, true);
  insert into contatos (empresa_id, filial_id, nome) values (1, 6, 'SLA cliente') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados) values (1, 3, ct, 1, 18, 'aberto', '{"_lead":{"ativo":true}}') returning id into n;
  v := posvenda_chamado_abrir(ct, 'teste de prazo', null, null, 'normal', n);
  ch := (v ->> 'id')::bigint;
  res := res || jsonb_build_object('6_chamado', (select jsonb_build_object('loja_do_negocio', filial_id = 3,
      'resposta_loja_aberta', sla_resposta_vence = posvenda_sla_vence(1, 3, aberto_em, 24) and sla_resposta_vence = core_somar_horas_abertas(1, 3, aberto_em, 24),
      'resolucao_loja_aberta', sla_resolucao_vence = core_somar_horas_abertas(1, 3, aberto_em, 72))
    from posvenda_chamados where id = ch));

  raise exception 'RESULTADO_TESTE_SLA_LOJA_ABERTA %', res::text;
end $t$;
