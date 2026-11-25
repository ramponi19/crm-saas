-- HORÁRIO DE FUNCIONAMENTO POR DIA E POR LOJA — FASE 1 (Lucas, 24/11/2026). Universal.
--
-- Chave nova `core.horario` (config provisória da M2/D6): {"empresa": H, "lojas": {"<filial>": H}}, com
--   H = {"semana": {"0".."6": [{"abre": "HH:MM", "fecha": "HH:MM"}, ...]}, "sla_resposta_min": n}
--   (0 = domingo; lista vazia = fechado; mais de um intervalo = pausa). A loja com valor próprio substitui a semana.
-- Leitura (core_horario): loja → empresa → formato antigo `horario_comercial` convertido → padrão seg–sex 9h–18h.
-- As mesmas regras em TS: lib/horario.ts.
--
-- "Dia útil" passa a ser DERIVADO do horário: dia em que a loja abre. `calendario.dias_semana_uteis` deixa de ser lido
-- (posvenda_proximo_dia_util agora é core_proximo_dia_aberto).
-- Pós-venda:
--   - passo que cai num dia em que a loja do negócio está fechada vai para o próximo dia em que ela abre (ao nascer,
--     ao reatribuir e ao reancorar); a hora sugerida fica dentro do expediente do dia;
--   - teto diário proporcional às horas do dia: teto × horas do dia ÷ horas do dia mais longo da semana (mín. 1).
-- Compatibilidade (fase 1 de 3): os leitores antigos (agenda, automações, transmissão, alertas, esteira) seguem lendo
-- `horario_comercial` / `horario`; a tela nova grava as duas chaves. Dados: cada empresa com `horario_comercial`
-- ganha o `core.horario` equivalente (o horário de hoje vira o padrão dela nos dias que ela já considera úteis).
--
-- Volta: supabase/scripts/volta/volta-horario-por-dia.sql
-- Teste: supabase/scripts/testes/teste-horario-por-dia.sql + tests/horario.test.ts

do $$
declare r record;
begin
  for r in select * from (values
      ('public.posvenda_proximo_dia_util(bigint,bigint,date)', '9173115344dbb35f268faed6d5b3ce63 3b268ba8347bb47b47c930dc9d3ca267'),
      ('public.posvenda_resolver_responsavel(bigint,bigint,text,bigint,date,uuid[])', '0618ae8dea7a058c063cab590e56d134'),
      ('public.posvenda_iniciar_jornadas(bigint)', 'c45047421705bf8d1a11683676ceea9d'),
      ('public.posvenda_reancorar_jornada(bigint)', 'd79212f018aa9b5a69a6338db78758da')) v(f, h) loop
    -- r.h: md5 aceitos (produção e, onde difere só por comentário, o do arquivo de origem)
    if not coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = r.f::regprocedure), '-') = any(string_to_array(r.h, ' ')) then
      raise exception '% mudou desde a conferência de 24/11/2026; revise antes de aplicar', r.f;
    end if;
  end loop;
end $$;

-- ── 1. Formato ───────────────────────────────────────────────────────────────────────────────────
-- Um horário no formato novo é válido? (dias em lista, HH:MM, fecha depois de abre, ao menos um dia aberto)
-- A sobreposição de intervalos é recusada na gravação (lib/horario.ts, rota da tela).
create or replace function public.core_horario_valido(p jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    jsonb_typeof(p -> 'semana') = 'object'
    and (select bool_and(
           jsonb_typeof(coalesce(p -> 'semana' -> d, '[]'::jsonb)) = 'array'
           and (select coalesce(bool_and(
                  coalesce(i ->> 'abre', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  and coalesce(i ->> 'fecha', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                  and (i ->> 'fecha')::time > (i ->> 'abre')::time), true)
                  from jsonb_array_elements(case when jsonb_typeof(p -> 'semana' -> d) = 'array' then p -> 'semana' -> d else '[]'::jsonb end) i))
         from unnest(array['0', '1', '2', '3', '4', '5', '6']) d)
    and exists (select 1 from unnest(array['0', '1', '2', '3', '4', '5', '6']) d
                 where jsonb_typeof(p -> 'semana' -> d) = 'array' and jsonb_array_length(p -> 'semana' -> d) > 0),
    false)
$$;

-- O formato antigo ({inicio, fim, dias, sla_resposta_min}) no novo; null se não for válido.
create or replace function public.core_horario_do_antigo(p jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case
    when coalesce(p ->> 'inicio', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p ->> 'fim', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         and (p ->> 'fim')::time > (p ->> 'inicio')::time
         and jsonb_typeof(p -> 'dias') = 'array' and jsonb_array_length(p -> 'dias') > 0
    then jsonb_build_object('semana', (select jsonb_object_agg(d::text,
                case when exists (select 1 from jsonb_array_elements_text(p -> 'dias') x where x = d::text)
                     then jsonb_build_array(jsonb_build_object('abre', p ->> 'inicio', 'fecha', p ->> 'fim')) else '[]'::jsonb end)
              from generate_series(0, 6) d))
         || case when jsonb_typeof(p -> 'sla_resposta_min') = 'number' then jsonb_build_object('sla_resposta_min', p -> 'sla_resposta_min') else '{}'::jsonb end
  end
$$;

-- ── 2. Leitura ───────────────────────────────────────────────────────────────────────────────────
-- O horário que vale para a loja: loja → empresa (core.horario) → horario_comercial → seg–sex 9h–18h.
create or replace function public.core_horario(p_empresa bigint, p_filial bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; c jsonb;
begin
  select valor into c from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'core.horario';
  if p_filial is not null then
    v := c -> 'lojas' -> p_filial::text;
    if public.core_horario_valido(v) then return v; end if;
  end if;
  v := c -> 'empresa';
  if public.core_horario_valido(v) then return v; end if;
  v := public.core_horario_do_antigo((select valor from public.configuracoes_sistema where empresa_id = p_empresa and chave = 'horario_comercial'));
  if v is not null then return v; end if;
  return public.core_horario_do_antigo('{"inicio": "09:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}');
end $$;

create or replace function public.core_intervalos_do_dia(p_empresa bigint, p_filial bigint, p_dia date)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.core_horario(p_empresa, p_filial) -> 'semana' -> (extract(dow from p_dia)::int)::text, '[]'::jsonb)
$$;

-- A loja abre neste dia? É a definição de "dia útil".
create or replace function public.core_abre_no_dia(p_empresa bigint, p_filial bigint, p_dia date)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select jsonb_array_length(public.core_intervalos_do_dia(p_empresa, p_filial, p_dia)) > 0
$$;

create or replace function public.core_horas_do_dia(p_empresa bigint, p_filial bigint, p_dia date)
returns numeric language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(extract(epoch from ((i ->> 'fecha')::time - (i ->> 'abre')::time)) / 3600), 0)::numeric
    from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, p_filial, p_dia)) i
$$;

-- Horas do dia mais longo da semana (a referência do teto proporcional).
create or replace function public.core_horas_referencia(p_empresa bigint, p_filial bigint)
returns numeric language sql stable set search_path = public, pg_temp as $$
  with h as (select public.core_horario(p_empresa, p_filial) -> 'semana' s)
  select coalesce(max(t), 0)::numeric from (
    select (select coalesce(sum(extract(epoch from ((i ->> 'fecha')::time - (i ->> 'abre')::time)) / 3600), 0)
              from jsonb_array_elements(coalesce(h.s -> d, '[]'::jsonb)) i) t
      from h, unnest(array['0', '1', '2', '3', '4', '5', '6']) d) x
$$;

-- Próximo dia em que a loja abre, DEPOIS de p_dia.
create or replace function public.core_proximo_dia_aberto(p_empresa bigint, p_filial bigint, p_dia date)
returns date language plpgsql stable set search_path = public, pg_temp as $$
declare s jsonb := public.core_horario(p_empresa, p_filial) -> 'semana'; d date := p_dia + 1;
begin
  for i in 1..7 loop
    if jsonb_array_length(coalesce(s -> (extract(dow from d)::int)::text, '[]'::jsonb)) > 0 then return d; end if;
    d := d + 1;
  end loop;
  return p_dia + 1;
end $$;

-- O próprio dia, se a loja abre; senão o próximo dia aberto.
create or replace function public.core_dia_aberto(p_empresa bigint, p_filial bigint, p_dia date)
returns date language sql stable set search_path = public, pg_temp as $$
  select case when public.core_abre_no_dia(p_empresa, p_filial, p_dia) then p_dia
              else public.core_proximo_dia_aberto(p_empresa, p_filial, p_dia) end
$$;

-- Teto proporcional às horas do dia (0 com a loja fechada; no mínimo 1 com ela aberta).
create or replace function public.core_teto_do_dia(p_teto int, p_empresa bigint, p_filial bigint, p_dia date)
returns int language sql stable set search_path = public, pg_temp as $$
  select case when p_teto is null then null
              when public.core_horas_do_dia(p_empresa, p_filial, p_dia) = 0 then 0
              else greatest(1, floor(p_teto * public.core_horas_do_dia(p_empresa, p_filial, p_dia)
                                     / nullif(public.core_horas_referencia(p_empresa, p_filial), 0)))::int end
$$;

-- A hora dentro do expediente do dia: a própria, se cai num intervalo; senão a abertura do dia.
create or replace function public.core_hora_no_expediente(p_empresa bigint, p_filial bigint, p_dia date, p_hora time)
returns time language sql stable set search_path = public, pg_temp as $$
  with iv as (select (i ->> 'abre')::time abre, (i ->> 'fecha')::time fecha
                from jsonb_array_elements(public.core_intervalos_do_dia(p_empresa, p_filial, p_dia)) i)
  select coalesce((select p_hora from iv where p_hora >= abre and p_hora < fecha limit 1),
                  (select min(abre) from iv), p_hora)
$$;

-- ── 3. Pós-venda ─────────────────────────────────────────────────────────────────────────────────
-- Dia útil seguinte = próximo dia em que a loja abre (sem a chave calendario.dias_semana_uteis).
create or replace function public.posvenda_proximo_dia_util(p_empresa bigint, p_filial bigint, p_dia date)
returns date language sql stable set search_path = public, pg_temp as $$
  select public.core_proximo_dia_aberto(p_empresa, p_filial, p_dia)
$$;

-- A regra (D9) com o dia aberto e o teto do dia.
create or replace function public.posvenda_resolver_responsavel(p_empresa bigint, p_filial bigint, p_tipo text, p_negocio bigint,
                                                                p_dia date, p_excluir uuid[] default '{}')
returns table (responsavel_id uuid, origem text, dia date)
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_excl uuid[] := coalesce(p_excluir, '{}');
  v_teto int := public.posvenda_teto_diario(p_empresa, p_filial);
  v_hoje date := public.posvenda_dia_local(p_empresa, now());
  v_dia date := p_dia;
  v_vend uuid; v_padrao uuid; v_esc uuid;
  v_adm record;
  t int := 0;
begin
  if p_tipo not in ('acompanhamento', 'administradores') then
    raise exception 'TIPO_INVALIDO: %', p_tipo using errcode = '22023';
  end if;
  -- dia em que a loja do negócio está fechada → o próximo dia em que ela abre
  v_dia := public.core_dia_aberto(p_empresa, p_filial, p_dia);

  if p_tipo = 'acompanhamento' and p_filial is not null then
    -- a) o vendedor do negócio (administrador, dono ou conta de serviço como responsável do ganho NÃO contam)
    select n.responsavel_id into v_vend
      from public.negocios n
      join public.empresa_usuarios eu on eu.usuario_id = n.responsavel_id and eu.empresa_id = n.empresa_id
     where n.id = p_negocio and n.empresa_id = p_empresa and eu.ativo and eu.role = 'vendedor'
       and not eu.conta_servico
       and not (n.responsavel_id = any(v_excl))
       and not (coalesce(eu.ausente, false) and v_dia <= v_hoje);
    if v_vend is not null then
      while public.posvenda_carga_do_dia(p_empresa, v_vend, v_dia) >= public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia) and t < 60 loop
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      return query select v_vend, 'vendedor'::text, v_dia;
      return;
    end if;

    -- e) o responsável padrão da loja, se configurado (opcional) e se for uma pessoa
    begin
      v_padrao := nullif(public.config_valor_emp(p_empresa, 'posvenda', 'responsavel_padrao', p_filial) #>> '{}', '')::uuid;
    exception when others then v_padrao := null;
    end;
    if v_padrao is not null and not (v_padrao = any(v_excl))
       and exists (select 1 from public.empresa_usuarios where empresa_id = p_empresa and usuario_id = v_padrao
                    and ativo and not coalesce(ausente, false) and not conta_servico)
       and public.posvenda_carga_do_dia(p_empresa, v_padrao, v_dia) < public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia) then
      return query select v_padrao, 'padrao_loja'::text, v_dia;
      return;
    end if;

    if cardinality(array(select x from unnest(public.posvenda_vendedores_da_loja(p_empresa, p_filial)) x where not (x = any(v_excl)))) > 0 then
      t := 0;
      loop
        v_esc := public.posvenda_roleta_proximo(p_empresa, 'loja:' || p_filial, public.posvenda_vendedores_da_loja(p_empresa, p_filial), v_dia,
                                                public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia), v_excl);
        exit when v_esc is not null or t >= 60;
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      if v_esc is not null then
        return query select v_esc, 'roleta'::text, v_dia;
        return;
      end if;
    end if;
  end if;

  select * into v_adm from public.posvenda_administradores(p_empresa);
  t := 0;
  loop
    v_esc := public.posvenda_roleta_proximo(p_empresa, 'administradores', v_adm.ids, v_dia,
                                            public.core_teto_do_dia(v_teto, p_empresa, p_filial, v_dia), v_excl);
    exit when v_esc is not null or t >= 60;
    v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
  end loop;
  if v_esc is null then
    raise exception 'SEM_RESPONSAVEL: empresa % sem vendedor, administrador ou dono ativo', p_empresa using errcode = 'P0001';
  end if;
  return query select v_esc, case when v_adm.eh_dono then 'dono' else 'administradores' end, v_dia;
end $$;

-- Jornada: passo atribuído à mão também cai num dia aberto; a hora fica dentro do expediente.
create or replace function public.posvenda_iniciar_jornadas(p_negocio bigint)
returns bigint language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios;
  c public.posvenda_cadencias;
  p public.posvenda_cadencia_passos;
  v_cat bigint; v_cond text; v_jor bigint;
  v_fuso text; v_hoje date; v_base date; v_dia date;
  v_igual record; r record; v_resp uuid;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.status <> 'ganho' or n.ganho_em is null then return null; end if;
  if not public.core_modulo_ligado(n.empresa_id, 'posvenda') then return null; end if;
  -- idempotente: já há jornada ativa para esta venda
  if exists (select 1 from public.posvenda_jornadas where negocio_id = p_negocio and status in ('ativa', 'pausada')) then
    return null;
  end if;

  v_cat := case when jsonb_typeof(n.dados -> 'venda' -> 'categoria_id') = 'number' then (n.dados -> 'venda' ->> 'categoria_id')::bigint end;
  v_cond := nullif(n.dados -> 'venda' ->> 'condicao', '');

  -- a régua: a da categoria (e condição, se a régua filtra) de maior prioridade; senão a Geral
  select * into c from public.posvenda_cadencias
   where empresa_id = n.empresa_id and ativo and gatilho = 'ganho'
     and v_cat is not null and (filtros -> 'categorias') @> to_jsonb(v_cat)
     and (not (filtros ? 'condicao') or filtros ->> 'condicao' = v_cond)
   order by prioridade desc, id limit 1;
  if not found then
    select * into c from public.posvenda_cadencias
     where empresa_id = n.empresa_id and ativo and gatilho = 'ganho' and not (filtros ? 'categorias')
     order by prioridade desc, id limit 1;
  end if;
  if not found then return null; end if;

  -- recompra da mesma categoria: cancela os passos pendentes DO PRODUTO das jornadas anteriores do cliente
  -- (ex.: bateria, ciclo de troca); os de relacionamento continuam
  if v_cat is not null then
    update public.posvenda_acompanhamentos a
       set status = 'cancelado', motivo = 'recompra'
      from public.posvenda_jornadas j, public.posvenda_cadencia_passos pp
     where a.jornada_id = j.id and a.passo_id = pp.id and pp.grupo = 'produto'
       and a.status in ('pendente', 'juntado')
       and j.empresa_id = n.empresa_id and j.contato_id = n.contato_id and j.categoria_id = v_cat
       and j.negocio_id is distinct from p_negocio and j.status = 'ativa';
  end if;

  insert into public.posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em, categoria_id, condicao)
  values (n.empresa_id, n.filial_id, n.contato_id, n.id, c.id, n.ganho_em, v_cat, v_cond)
  returning id into v_jor;

  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_base := public.posvenda_dia_local(n.empresa_id, n.ganho_em);

  for p in select * from public.posvenda_cadencia_passos where cadencia_id = c.id and ativo order by ordem loop
    continue when p.filtros ? 'condicao' and (p.filtros ->> 'condicao') is distinct from v_cond;
    v_dia := v_base + p.dia_offset;
    continue when v_dia < v_hoje;  -- passo que já passou não nasce

    -- passo igual do mesmo cliente no mesmo dia (já no dia em que a loja abre), de outra venda: junta, não duplica
    select a.id, a.responsavel_id, a.origem_responsavel, a.previsto_para into v_igual
      from public.posvenda_acompanhamentos a
      join public.posvenda_cadencia_passos pp on pp.id = a.passo_id
     where a.empresa_id = n.empresa_id and a.contato_id = n.contato_id and a.status = 'pendente'
       and a.jornada_id <> v_jor and pp.tipo_acao = p.tipo_acao
       and public.posvenda_dia_local(n.empresa_id, a.previsto_para) = public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia)
     order by a.id limit 1;
    if found then
      insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                                   responsavel_id, origem_responsavel, previsto_para, status, motivo, juntado_a)
      values (n.empresa_id, n.filial_id, v_jor, p.id, n.contato_id, n.id,
              v_igual.responsavel_id, v_igual.origem_responsavel, v_igual.previsto_para, 'juntado', 'mesmo_dia', v_igual.id);
      continue;
    end if;

    if p.responsavel like 'usuario:%' then
      v_resp := substr(p.responsavel, 9)::uuid;
      select v_resp as responsavel_id, 'manual'::text as origem, public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia) as dia into r;
    else
      select * into r from public.posvenda_resolver_responsavel(
        n.empresa_id, n.filial_id, case when p.responsavel = 'administradores' then 'administradores' else 'acompanhamento' end,
        n.id, v_dia);
    end if;
    insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                                 responsavel_id, origem_responsavel, previsto_para)
    values (n.empresa_id, n.filial_id, v_jor, p.id, n.contato_id, n.id, r.responsavel_id, r.origem,
            (r.dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, r.dia, coalesce(p.hora_sugerida, time '10:00'))) at time zone v_fuso);
  end loop;
  return v_jor;
end $$;

-- Data corrigida: o passo recontado também cai num dia aberto, com a hora dentro do expediente.
create or replace function public.posvenda_reancorar_jornada(p_negocio bigint)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios;
  v_fuso text; v_hoje date; v_base date; v_dia date; v int := 0;
  a record;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.status <> 'ganho' or n.ganho_em is null then return 0; end if;
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_base := public.posvenda_dia_local(n.empresa_id, n.ganho_em);
  update public.posvenda_jornadas set ancora_em = n.ganho_em where negocio_id = p_negocio and status in ('ativa', 'pausada');
  for a in
    select x.id, x.previsto_para, pp.dia_offset from public.posvenda_acompanhamentos x
      join public.posvenda_jornadas j on j.id = x.jornada_id
      join public.posvenda_cadencia_passos pp on pp.id = x.passo_id
     where j.negocio_id = p_negocio and j.status in ('ativa', 'pausada') and x.status in ('pendente', 'juntado')
  loop
    v_dia := v_base + a.dia_offset;
    if v_dia < v_hoje then
      update public.posvenda_acompanhamentos set status = 'pulado', motivo = 'data_no_passado_apos_correcao' where id = a.id;
    else
      v_dia := public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia);
      update public.posvenda_acompanhamentos
         set previsto_para = (v_dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, v_dia, (a.previsto_para at time zone v_fuso)::time)) at time zone v_fuso
       where id = a.id;
    end if;
    v := v + 1;
  end loop;
  return v;
end $$;

-- ── 4. Dados: o horário de hoje de cada empresa vira o padrão dela no formato novo ─────────────────────
insert into public.configuracoes_sistema (empresa_id, chave, valor)
select c.empresa_id, 'core.horario',
       jsonb_build_object('empresa', public.core_horario_do_antigo(c.valor), 'lojas', '{}'::jsonb,
                          'atualizado_em', now(), 'origem', 'migrado de horario_comercial (20261124001200)')
  from public.configuracoes_sistema c
 where c.chave = 'horario_comercial' and public.core_horario_do_antigo(c.valor) is not null
on conflict (empresa_id, chave) do nothing;

-- ── 5. Permissões: funções internas (servidor e funções do banco). As puras ficam abertas. ─────────
do $$
declare f text;
begin
  foreach f in array array[
    'core_horario(bigint,bigint)', 'core_intervalos_do_dia(bigint,bigint,date)', 'core_abre_no_dia(bigint,bigint,date)',
    'core_horas_do_dia(bigint,bigint,date)', 'core_horas_referencia(bigint,bigint)', 'core_proximo_dia_aberto(bigint,bigint,date)',
    'core_dia_aberto(bigint,bigint,date)', 'core_teto_do_dia(integer,bigint,bigint,date)', 'core_hora_no_expediente(bigint,bigint,date,time)',
    'posvenda_proximo_dia_util(bigint,bigint,date)', 'posvenda_resolver_responsavel(bigint,bigint,text,bigint,date,uuid[])',
    'posvenda_iniciar_jornadas(bigint)', 'posvenda_reancorar_jornada(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
