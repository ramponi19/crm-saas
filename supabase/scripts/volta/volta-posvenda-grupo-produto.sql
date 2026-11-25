-- Volta da 20261124001100_posvenda_grupo_produto: o grupo volta a se chamar 'aparelho'.
alter table public.posvenda_cadencia_passos drop constraint posvenda_cadencia_passos_grupo_check;
update public.posvenda_cadencia_passos set grupo = 'aparelho' where grupo = 'produto';
alter table public.posvenda_cadencia_passos add constraint posvenda_cadencia_passos_grupo_check check (grupo in ('aparelho', 'relacionamento'));

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

  -- recompra da mesma categoria: cancela os passos pendentes DO APARELHO das jornadas anteriores do cliente
  -- (bateria, ciclo de troca); os de relacionamento continuam
  if v_cat is not null then
    update public.posvenda_acompanhamentos a
       set status = 'cancelado', motivo = 'recompra'
      from public.posvenda_jornadas j, public.posvenda_cadencia_passos pp
     where a.jornada_id = j.id and a.passo_id = pp.id and pp.grupo = 'aparelho'
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
