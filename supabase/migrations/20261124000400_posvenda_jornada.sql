-- ENTREGA C, ETAPA C3 — A JORNADA DE CADA VENDA (§8.8; regras do Lucas de 24/11/2026).
--
-- Gatilho próprio `negocios_posvenda` (AFTER INSERT/UPDATE OF status, ganho_em), que SÓ age com o módulo ligado:
--   - entrou no ganho          → posvenda_iniciar_jornadas: uma jornada por venda, pela régua da categoria e
--                                condição de dados.venda (a de maior prioridade); sem categoria ou sem régua da
--                                categoria → a régua Geral (sem filtro de categorias). Passos contados do ganho_em
--                                (dia local + dia_offset, na hora sugerida ou 10h), responsável pela C2. Passo cuja
--                                data já passou não é criado (venda registrada com atraso; ativação, C6).
--   - saiu do ganho (reaberta) → pendentes CANCELADOS com motivo `venda_reaberta`; os feitos ficam; jornada cancelada.
--   - ganho_em mudou (M3)      → posvenda_reancorar_jornada: pendentes recontados pela nova data; o que cairia no
--                                passado vira `pulado` (motivo `data_no_passado_apos_correcao`), nunca atrasado.
--                                A M3 (corrigir_data_venda) também chama esta função: é idempotente.
-- Recompra: venda nova da MESMA categoria cancela (motivo `recompra`) os passos pendentes de CICLO DE TROCA
--   (`posvenda_cadencia_passos.ciclo_troca`) das jornadas anteriores do cliente; os outros passos continuam.
--   Outra categoria (acessório depois de iPhone) não cancela nada.
-- Mesmo dia: duas vendas do mesmo cliente → uma jornada por venda; o passo igual (mesmo tipo de ação, mesmo dia,
--   mesmo cliente) não duplica: o segundo nasce `juntado`, apontando para o primeiro (`juntado_a`). Se o primeiro sai
--   da fila (cancelado, pulado), o juntado volta a ser pendente (posvenda_promover_juntado).
-- Reaberta e ganha de novo: jornada nova (a antiga está cancelada). Só pode haver UMA jornada ATIVA por negócio
--   e régua (índice parcial no lugar do unique da C1).
--
-- Volta: supabase/scripts/volta/volta-posvenda-jornada.sql
-- Teste: supabase/scripts/testes/teste-posvenda-jornada.sql (+ esperado)

-- ── Ajustes no esquema da C1 (tabelas ainda vazias na produção) ───────────────────────────────────
alter table public.posvenda_cadencia_passos add column ciclo_troca boolean not null default false;
alter table public.posvenda_jornadas add column categoria_id bigint, add column condicao text;
alter table public.posvenda_jornadas drop constraint posvenda_jornadas_negocio_id_cadencia_id_key;
create unique index posvenda_jornadas_uma_ativa on public.posvenda_jornadas (negocio_id, cadencia_id) where status in ('ativa', 'pausada');
create index posvenda_jornadas_negocio on public.posvenda_jornadas (negocio_id);
alter table public.posvenda_acompanhamentos add column motivo text,
  add column juntado_a bigint references public.posvenda_acompanhamentos(id) on delete set null;
alter table public.posvenda_acompanhamentos drop constraint posvenda_acompanhamentos_status_check;
alter table public.posvenda_acompanhamentos add constraint posvenda_acompanhamentos_status_check
  check (status in ('pendente', 'feito', 'sem_resposta', 'reagendado', 'pulado', 'perdido', 'cancelado', 'juntado'));
create index posvenda_acompanhamentos_contato_dia on public.posvenda_acompanhamentos (empresa_id, contato_id, previsto_para) where status = 'pendente';

-- ── Iniciar ─────────────────────────────────────────────────────────────────────────────────────
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

  -- recompra da mesma categoria: cancela o ciclo de troca pendente das jornadas anteriores do cliente
  if v_cat is not null then
    update public.posvenda_acompanhamentos a
       set status = 'cancelado', motivo = 'recompra'
      from public.posvenda_jornadas j, public.posvenda_cadencia_passos pp
     where a.jornada_id = j.id and a.passo_id = pp.id and pp.ciclo_troca
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

-- ── Encerrar (venda reaberta) ───────────────────────────────────────────────────────────────────
create or replace function public.posvenda_encerrar_jornadas(p_negocio bigint, p_motivo text)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare v int;
begin
  update public.posvenda_acompanhamentos a set status = 'cancelado', motivo = p_motivo
    from public.posvenda_jornadas j
   where a.jornada_id = j.id and j.negocio_id = p_negocio and j.status in ('ativa', 'pausada')
     and a.status in ('pendente', 'juntado');
  get diagnostics v = row_count;
  update public.posvenda_jornadas set status = 'cancelada', motivo_fim = p_motivo
   where negocio_id = p_negocio and status in ('ativa', 'pausada');
  return v;
end $$;

-- ── Reancorar (data da venda corrigida) ─────────────────────────────────────────────────────────
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

-- ── Junção: o passo principal saiu da fila → o primeiro juntado volta a ser pendente ─────────────
-- Sem isto, cancelar ou pular o passo principal (venda reaberta, recompra, data corrigida) deixaria o cliente sem
-- o contato da OUTRA venda, que estava juntado a ele.
create or replace function public.posvenda_promover_juntado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_novo bigint;
begin
  if old.status = 'pendente' and new.status in ('cancelado', 'pulado', 'perdido') then
    select id into v_novo from public.posvenda_acompanhamentos where juntado_a = new.id and status = 'juntado' order by id limit 1;
    if v_novo is not null then
      update public.posvenda_acompanhamentos set status = 'pendente', juntado_a = null, motivo = null where id = v_novo;
      update public.posvenda_acompanhamentos set juntado_a = v_novo where juntado_a = new.id and status = 'juntado';
    end if;
  end if;
  return null;
end $$;

drop trigger if exists posvenda_acompanhamentos_promover on public.posvenda_acompanhamentos;
create trigger posvenda_acompanhamentos_promover
  after update of status on public.posvenda_acompanhamentos
  for each row execute function public.posvenda_promover_juntado();

-- ── O gatilho em negocios (só com o módulo ligado) ──────────────────────────────────────────────
create or replace function public.posvenda_negocio_ganho()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.core_modulo_ligado(new.empresa_id, 'posvenda') then return null; end if;
  if new.status = 'ganho' and (tg_op = 'INSERT' or old.status is distinct from 'ganho') then
    perform public.posvenda_iniciar_jornadas(new.id);
  elsif tg_op = 'UPDATE' and old.status = 'ganho' and new.status <> 'ganho' then
    perform public.posvenda_encerrar_jornadas(new.id, 'venda_reaberta');
  elsif tg_op = 'UPDATE' and new.status = 'ganho' and old.ganho_em is distinct from new.ganho_em then
    perform public.posvenda_reancorar_jornada(new.id);
  end if;
  return null;
end $$;

drop trigger if exists negocios_posvenda on public.negocios;
create trigger negocios_posvenda
  after insert or update of status, ganho_em on public.negocios
  for each row execute function public.posvenda_negocio_ganho();

do $$
declare f text;
begin
  foreach f in array array['posvenda_iniciar_jornadas(bigint)', 'posvenda_encerrar_jornadas(bigint,text)',
                           'posvenda_reancorar_jornada(bigint)', 'posvenda_negocio_ganho()', 'posvenda_promover_juntado()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
