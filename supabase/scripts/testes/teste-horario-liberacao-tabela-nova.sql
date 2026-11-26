-- 1.1h parte 2: a H1 tirou o formato antigo de core_horario; os itens 1 e 2 passam a registrar a diferença ESPERADA
-- entre o cálculo antigo (com horario_comercial) e o de agora (só a tabela nova).
-- Teste da 20261126000600_horario_liberacao_tabela_nova (1.1h, primeira parte): core_horario e core_liberar_lotes_do_dia
-- leem empresa_config. Compara a função NOVA com a ANTIGA (corpo de antes, recriado aqui como pg_temp) em todos os casos:
-- empresa sem configuração, com horário da empresa, com horário próprio de uma loja, com o formato antigo
-- 'horario_comercial' e com horário inválido. Termina com RAISE: nada fica gravado.
-- 1.1h parte 2 (26/11/2026): a H1 desligou a ponte envelope → empresa_config. Este teste carrega a configuração
-- pelo envelope antigo (atalho de carga dos dados); a ponte é ligada SÓ dentro da transação do teste (desfeita no fim).
alter table public.configuracoes_sistema enable trigger configuracoes_sistema_ponte;
do $teste$
declare
  r jsonb := '{}'; dif jsonb := '[]'; e bigint; f bigint;
  v_dono1 constant uuid := 'a632db2c-c42b-4973-8008-2d5ca2dbf479';
  h_emp constant jsonb := '{"semana": {"0": [], "1": [{"abre": "08:00", "fecha": "17:00"}], "2": [{"abre": "08:00", "fecha": "17:00"}], "3": [{"abre": "08:00", "fecha": "17:00"}], "4": [{"abre": "08:00", "fecha": "17:00"}], "5": [{"abre": "08:00", "fecha": "17:00"}], "6": [{"abre": "09:00", "fecha": "12:00"}]}, "sla_resposta_min": 20}';
  h_loja constant jsonb := '{"semana": {"0": [], "1": [{"abre": "10:00", "fecha": "20:00"}], "2": [{"abre": "10:00", "fecha": "20:00"}], "3": [{"abre": "10:00", "fecha": "20:00"}], "4": [{"abre": "10:00", "fecha": "20:00"}], "5": [{"abre": "10:00", "fecha": "20:00"}], "6": [{"abre": "10:00", "fecha": "16:00"}]}, "sla_resposta_min": 15}';
begin
  -- a função de ANTES, para comparar
  execute $f$create function pg_temp.core_horario_antigo(p_empresa bigint, p_filial bigint default null) returns jsonb language plpgsql stable as $b$
  declare v jsonb; c jsonb;
  begin
    select valor into c from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'core.horario';
    if p_filial is not null then v := c -> 'lojas' -> p_filial::text; if public.core_horario_valido(v) then return v; end if; end if;
    v := c -> 'empresa'; if public.core_horario_valido(v) then return v; end if;
    v := public.core_horario_do_antigo((select valor from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'horario_comercial'));
    if v is not null then return v; end if;
    return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
  end $b$$f$;

  -- cenário: empresa 1 com horário da empresa e um próprio da loja 6 (pelo caminho do app: config_salvar, que mantém
  -- a ponte com o envelope); empresa 5 só com o formato antigo; as demais sem nada
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dono1::text, 'role', 'authenticated')::text, true);
  perform config_salvar('core', 'horario', h_emp, null);
  perform config_salvar('core', 'horario', h_loja, 6);
  perform set_config('request.jwt.claims', '', true);
  insert into configuracoes_sistema (empresa_id, chave, valor) values (5, 'horario_comercial', '{"inicio": "07:30", "fim": "16:30", "dias": [1, 2, 3, 4, 5, 6]}')
  on conflict (empresa_id, chave) do update set valor = excluded.valor;

  for e in select id from empresas order by id loop
    for f in select null::bigint union all select id from filiais where empresa_id = e loop
      if public.core_horario(e, f) is distinct from pg_temp.core_horario_antigo(e, f) then
        dif := dif || jsonb_build_object('empresa', e, 'loja', f, 'nova', public.core_horario(e, f), 'antiga', pg_temp.core_horario_antigo(e, f));
      end if;
    end loop;
  end loop;
  r := r || jsonb_build_object('1_diferencas_horario', jsonb_array_length(dif), '1_exemplos', dif -> 0,
    '1_loja6_proprio', public.core_horario(1, 6) = h_loja,
    '1_loja3_herda_empresa', public.core_horario(1, 3) = h_emp,
    '1_empresa5_formato_antigo', public.core_horario(5, null) -> 'semana' -> '6' -> 0 ->> 'abre',
    '1_casos', (select count(*) from empresas) + (select count(*) from filiais));

  -- horário inválido na tabela nova cai para o formato antigo, como antes (a ponte grava os dois)
  update empresa_config set valor = '{"lixo": true}' where empresa_id = 1 and modulo = 'core' and chave = 'horario' and filial_id = 6;
  update configuracoes_sistema set valor = jsonb_set(valor, '{lojas,6}', '{"lixo": true}') where empresa_id = 1 and chave = 'core.horario';
  r := r || jsonb_build_object('2_invalido_igual', public.core_horario(1, 6) = pg_temp.core_horario_antigo(1, 6),
                               '2_invalido_cai_na_empresa', public.core_horario(1, 6) = h_emp);

  -- liberação: as mesmas empresas nas duas fontes
  r := r || jsonb_build_object('3_empresas_liberacao_iguais',
    (select coalesce(array_agg(distinct empresa_id order by empresa_id), '{}') from empresa_config where modulo = 'distribuicao' and chave = 'liberacao_diaria')
    = (select coalesce(array_agg(empresa_id order by empresa_id), '{}') from configuracoes_sistema where chave = 'distribuicao.liberacao_diaria'),
    '3_roda', jsonb_typeof(public.core_liberar_lotes_do_dia()));
  raise exception 'RESULTADO_TESTE_HORARIO_TABELA_NOVA %', r::text;
end $teste$;
