-- ETAPA 1.1h, PRIMEIRA PARTE (26/11/2026; docs/etapa-1.1-plano.md §5.2, item 3, "P0"): `core_horario` e
-- `core_liberar_lotes_do_dia` passam a ler a configuração da tabela nova `empresa_config` (1.1a), e não mais o envelope
-- provisório de `configuracoes_sistema` ('core.horario' e 'distribuicao.liberacao_diaria'). É o pré-requisito da contração
-- (segunda parte da 1.1h, que tira o envelope): depois disto, nenhuma função do banco lê o envelope dessas duas chaves.
--   - core_horario(empresa, loja): horário da LOJA (linha com filial_id) → da EMPRESA (filial_id nulo) → formato antigo
--     'horario_comercial' (chave sem ponto de configuracoes_sistema, que FICA na contração) → padrão seg–sex 09–18.
--     Mesma ordem e mesma validação (core_horario_valido) de antes; só a fonte das duas primeiras muda.
--   - core_liberar_lotes_do_dia(): roda para as empresas com a chave distribuicao.liberacao_diaria na tabela nova
--     (a por-empresa core_liberar_lote_esteira já lia config_valor_emp desde a 1.1a).
-- A ponte da 1.1a mantém o envelope e a tabela nova iguais, então o resultado é idêntico (conferido antes e depois).
-- Sem DDL em tabela do app: só troca o corpo de duas funções (mesmas assinaturas). Volta:
-- supabase/scripts/volta/volta-horario-liberacao-tabela-nova.sql

set local lock_timeout = '5s';

create or replace function public.core_horario(p_empresa bigint, p_filial bigint default null::bigint)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v jsonb;
begin
  if p_filial is not null then
    select e.valor into v from public.empresa_config e
     where e.empresa_id = p_empresa and e.filial_id = p_filial and e.modulo = 'core' and e.chave = 'horario';
    if public.core_horario_valido(v) then return v; end if;
  end if;
  select e.valor into v from public.empresa_config e
   where e.empresa_id = p_empresa and e.filial_id is null and e.modulo = 'core' and e.chave = 'horario';
  if public.core_horario_valido(v) then return v; end if;
  v := public.core_horario_do_antigo((select valor from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'horario_comercial'));
  if v is not null then return v; end if;
  return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
end $function$;

create or replace function public.core_liberar_lotes_do_dia()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare e bigint; v jsonb := '{}';
begin
  for e in select distinct c.empresa_id from public.empresa_config c
            where c.modulo = 'distribuicao' and c.chave = 'liberacao_diaria' order by 1 loop
    begin
      v := v || jsonb_build_object(e::text, public.core_liberar_lote_esteira(e));
    exception when others then
      v := v || jsonb_build_object(e::text, jsonb_build_object('erro', sqlerrm));  -- uma empresa não derruba as outras
    end;
  end loop;
  return v;
end $function$;
