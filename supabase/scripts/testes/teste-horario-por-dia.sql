-- Teste da 20261124001200_horario_por_dia. Termina com RAISE: nada fica gravado.
--   Empresa 5 (Nexus Demonstração): HORÁRIO ÚNICO, só o formato antigo `horario_comercial` (seg–sex 9h–18h).
--   Empresa 1 (JM de teste): `core.horario` com seg–sex 9h–18h, SÁBADO 9h–13h, domingo fechado; a loja 6 tem horário
--   próprio (também abre domingo 10h–14h). Matriz = loja 3, vendedor M1 (…0101).
-- Datas fixas: 27/11/2026 sexta, 28 sábado, 29 domingo, 30 segunda.

-- Cópia FIEL do dia útil de antes (C2), para provar que a empresa de horário único continua igual.
create function pg_temp.util_antigo(p_empresa bigint, p_filial bigint, p_dia date)
returns date language plpgsql stable as $$
declare
  v_dias jsonb := public.config_valor_emp(p_empresa, 'calendario', 'dias_semana_uteis', p_filial);
  d date := p_dia + 1;
  i int := 0;
begin
  if v_dias is null or jsonb_typeof(v_dias) <> 'array' or jsonb_array_length(v_dias) = 0 then
    v_dias := '[1,2,3,4,5]'::jsonb;
  end if;
  while not (v_dias @> to_jsonb(extract(isodow from d)::int)) and i < 7 loop
    d := d + 1; i := i + 1;
  end loop;
  return d;
end $$;

do $t$
declare
  res jsonb := '{}';
  SEX date := '2026-11-27'; SAB date := '2026-11-28'; DOM date := '2026-11-29'; SEG date := '2026-11-30';
  M1 uuid := '0e5e0000-0000-4000-8000-000000000101';
  semana jsonb := '{"1":[{"abre":"09:00","fecha":"18:00"}],"2":[{"abre":"09:00","fecha":"18:00"}],"3":[{"abre":"09:00","fecha":"18:00"}],
                    "4":[{"abre":"09:00","fecha":"18:00"}],"5":[{"abre":"09:00","fecha":"18:00"}],"6":[{"abre":"09:00","fecha":"13:00"}],"0":[]}';
  iguais int := 0; d date; r record;
  ct bigint; nM1 bigint; c_cad bigint; c_passo bigint; c_jor bigint; v int;
begin
  -- montagem
  delete from configuracoes_sistema where empresa_id in (1, 5) and chave in ('core.horario', 'horario_comercial');
  insert into configuracoes_sistema (empresa_id, chave, valor)
    values (5, 'horario_comercial', '{"inicio":"09:00","fim":"18:00","dias":[1,2,3,4,5],"sla_resposta_min":15}');
  insert into configuracoes_sistema (empresa_id, chave, valor)
    values (1, 'core.horario', jsonb_build_object('empresa', jsonb_build_object('semana', semana),
                                                  'lojas', jsonb_build_object('6', jsonb_build_object('semana', semana || '{"0":[{"abre":"10:00","fecha":"14:00"}]}'))));

  -- 1. Horário único (formato antigo): igual a hoje
  for i in 0..20 loop
    d := SEX + i;
    if posvenda_proximo_dia_util(5, 1, d) = pg_temp.util_antigo(5, 1, d) then iguais := iguais + 1; end if;
  end loop;
  res := res || jsonb_build_object('1_horario_unico', jsonb_build_object(
    'dia_util_igual_ao_antigo_21_dias', iguais,
    'abre_sabado', core_abre_no_dia(5, 1, SAB), 'proximo_de_sexta', core_proximo_dia_aberto(5, 1, SEX),
    'teto_sexta_25', core_teto_do_dia(25, 5, 1, SEX), 'teto_sabado_25', core_teto_do_dia(25, 5, 1, SAB),
    'sla', core_horario(5, 1) -> 'sla_resposta_min',
    'conversao', core_horario(5, 1) -> 'semana' = core_horario_do_antigo('{"inicio":"09:00","fim":"18:00","dias":[1,2,3,4,5]}') -> 'semana'));

  -- 2. Sábado reduzido e loja com horário próprio
  res := res || jsonb_build_object('2_sabado_reduzido', jsonb_build_object(
    'matriz_abre_sabado', core_abre_no_dia(1, 3, SAB), 'horas_sabado', round(core_horas_do_dia(1, 3, SAB), 2),
    'horas_referencia', round(core_horas_referencia(1, 3), 2), 'matriz_abre_domingo', core_abre_no_dia(1, 3, DOM),
    'loja6_abre_domingo', core_abre_no_dia(1, 6, DOM),
    'proximo_de_sexta', core_proximo_dia_aberto(1, 3, SEX), 'proximo_de_sabado', core_proximo_dia_aberto(1, 3, SAB),
    'loja6_proximo_de_sabado', core_proximo_dia_aberto(1, 6, SAB),
    'teto_sabado_25', core_teto_do_dia(25, 1, 3, SAB), 'teto_sabado_30', core_teto_do_dia(30, 1, 3, SAB),
    'teto_domingo', core_teto_do_dia(30, 1, 3, DOM),
    'hora_15h_no_sabado', core_hora_no_expediente(1, 3, SAB, '15:00'), 'hora_10h_no_sabado', core_hora_no_expediente(1, 3, SAB, '10:00'),
    'sem_loja_usa_empresa', core_abre_no_dia(1, null, SAB)));

  -- 3. Formato inválido não vale; loja inválida cai na empresa
  res := res || jsonb_build_object('3_validacao', jsonb_build_object(
    'invertido', core_horario_valido('{"semana":{"1":[{"abre":"18:00","fecha":"09:00"}]}}'),
    'tudo_fechado', core_horario_valido('{"semana":{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}}'),
    'antigo_invalido', core_horario_do_antigo('{"inicio":"9h","fim":"18:00","dias":[1]}') is null));

  -- 4. Pós-venda: dia fechado empurra o passo; teto do sábado proporcional (30 → 13)
  insert into contatos (empresa_id, filial_id, nome) values (1, 3, 'TESTE HORARIO') returning id into ct;
  insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, responsavel_id, dados)
    values (1, 3, ct, 1, 18, 'aberto', M1, '{"_lead":{"ativo":true}}') returning id into nM1;
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nM1, DOM);
  res := res || jsonb_build_object('4a_passo_no_domingo', jsonb_build_object('dia', r.dia, 'origem', r.origem));
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nM1, SAB);
  res := res || jsonb_build_object('4b_sabado_com_vaga', r.dia);
  insert into posvenda_cadencias (empresa_id, nome) values (1, 'Régua de teste horário') returning id into c_cad;
  insert into posvenda_cadencia_passos (empresa_id, cadencia_id, ordem, dia_offset, tipo_acao, titulo) values (1, c_cad, 1, 1, 'whatsapp', 'D+1') returning id into c_passo;
  insert into posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em) values (1, 3, ct, nM1, c_cad, now()) returning id into c_jor;
  for v in 1..13 loop
    insert into posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id, responsavel_id, origem_responsavel, previsto_para)
      values (1, 3, c_jor, c_passo, ct, nM1, M1, 'vendedor', (SAB + time '10:00') at time zone 'America/Sao_Paulo');
  end loop;
  select * into r from posvenda_resolver_responsavel(1, 3, 'acompanhamento', nM1, SAB);
  res := res || jsonb_build_object('4c_sabado_cheio_com_13', jsonb_build_object('dia', r.dia, 'origem', r.origem, 'teto_base', posvenda_teto_diario(1, 3)));

  raise exception 'RESULTADO_TESTE_HORARIO %', res::text;
end $t$;
