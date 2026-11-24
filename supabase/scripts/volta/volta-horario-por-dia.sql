-- Volta da 20261124001200_horario_por_dia: as quatro funções do pós-venda como estavam e as funções core_* saem.
-- As linhas core.horario gravadas ficam (nada mais as lê; não se apaga registro).

create or replace function public.posvenda_proximo_dia_util(p_empresa bigint, p_filial bigint, p_dia date)
returns date language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_dias jsonb := public.config_valor_emp(p_empresa, 'calendario', 'dias_semana_uteis', p_filial);
  d date := p_dia + 1;
  i int := 0;
begin
  if v_dias is null or jsonb_typeof(v_dias) <> 'array' or jsonb_array_length(v_dias) = 0 then
    v_dias := '[1,2,3,4,5]'::jsonb;  -- segunda a sexta (isodow)
  end if;
  while not (v_dias @> to_jsonb(extract(isodow from d)::int)) and i < 7 loop
    d := d + 1; i := i + 1;
  end loop;
  return d;
end $$;

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
      while public.posvenda_carga_do_dia(p_empresa, v_vend, v_dia) >= v_teto and t < 60 loop
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
       and public.posvenda_carga_do_dia(p_empresa, v_padrao, v_dia) < v_teto then
      return query select v_padrao, 'padrao_loja'::text, v_dia;
      return;
    end if;

    if cardinality(array(select x from unnest(public.posvenda_vendedores_da_loja(p_empresa, p_filial)) x where not (x = any(v_excl)))) > 0 then
      t := 0;
      loop
        v_esc := public.posvenda_roleta_proximo(p_empresa, 'loja:' || p_filial, public.posvenda_vendedores_da_loja(p_empresa, p_filial), v_dia, v_teto, v_excl);
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
    v_esc := public.posvenda_roleta_proximo(p_empresa, 'administradores', v_adm.ids, v_dia, v_teto, v_excl);
    exit when v_esc is not null or t >= 60;
    v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
  end loop;
  if v_esc is null then
    raise exception 'SEM_RESPONSAVEL: empresa % sem vendedor, administrador ou dono ativo', p_empresa using errcode = 'P0001';
  end if;
  return query select v_esc, case when v_adm.eh_dono then 'dono' else 'administradores' end, v_dia;
end $$;

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

    -- passo igual do mesmo cliente no mesmo dia, de outra venda: junta, não duplica
    select a.id, a.responsavel_id, a.origem_responsavel, a.previsto_para into v_igual
      from public.posvenda_acompanhamentos a
      join public.posvenda_cadencia_passos pp on pp.id = a.passo_id
     where a.empresa_id = n.empresa_id and a.contato_id = n.contato_id and a.status = 'pendente'
       and a.jornada_id <> v_jor and pp.tipo_acao = p.tipo_acao
       and public.posvenda_dia_local(n.empresa_id, a.previsto_para) = v_dia
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
      select v_resp as responsavel_id, 'manual'::text as origem, v_dia as dia into r;
    else
      select * into r from public.posvenda_resolver_responsavel(
        n.empresa_id, n.filial_id, case when p.responsavel = 'administradores' then 'administradores' else 'acompanhamento' end,
        n.id, v_dia);
    end if;
    insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                                 responsavel_id, origem_responsavel, previsto_para)
    values (n.empresa_id, n.filial_id, v_jor, p.id, n.contato_id, n.id,
            r.responsavel_id, r.origem, (r.dia + coalesce(p.hora_sugerida, time '10:00')) at time zone v_fuso);
  end loop;
  return v_jor;
end $$;

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
      update public.posvenda_acompanhamentos
         set previsto_para = (v_dia + (a.previsto_para at time zone v_fuso)::time) at time zone v_fuso
       where id = a.id;
    end if;
    v := v + 1;
  end loop;
  return v;
end $$;

drop function if exists public.core_hora_no_expediente(bigint,bigint,date,time);
drop function if exists public.core_teto_do_dia(integer,bigint,bigint,date);
drop function if exists public.core_dia_aberto(bigint,bigint,date);
drop function if exists public.core_proximo_dia_aberto(bigint,bigint,date);
drop function if exists public.core_horas_referencia(bigint,bigint);
drop function if exists public.core_horas_do_dia(bigint,bigint,date);
drop function if exists public.core_abre_no_dia(bigint,bigint,date);
drop function if exists public.core_intervalos_do_dia(bigint,bigint,date);
drop function if exists public.core_horario(bigint,bigint);
drop function if exists public.core_horario_do_antigo(jsonb);
drop function if exists public.core_horario_valido(jsonb);
