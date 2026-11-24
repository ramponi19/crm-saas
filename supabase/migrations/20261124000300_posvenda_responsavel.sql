-- ENTREGA C, ETAPA C2 — QUEM FICA COM CADA PASSO E CADA CHAMADO (D9 revista em 24/11/2026; §2.3 e §8.8).
--
-- posvenda_resolver_responsavel(empresa, loja, tipo, negocio, dia, excluir) → (responsavel_id, origem, dia)
--   tipo 'acompanhamento':
--     a) o vendedor do negócio (role 'vendedor', ativo; ausente só se o passo vence hoje ou antes);
--        teto do dia estourado → ELE MESMO no dia útil seguinte (cliente próprio);
--     e) senão, `posvenda.responsavel_padrao` da loja (opcional), se ativo, presente e com vaga;
--     b) senão, a ROLETA dos vendedores ativos e presentes da loja (vendedor sem loja = matriz), contador
--        próprio `posvenda_roleta 'loja:<id>'`; teto estourado → o próximo da roleta com vaga; todos cheios →
--        dia útil seguinte;
--     d) loja sem vendedor ativo, ou negócio sem loja → administradores.
--   tipo 'administradores' (NPS até 6, chamados): roleta entre os `role = 'admin'` ativos; ausentes só se
--     todos estiverem ausentes; nenhum admin → a conta `owner` (origem 'dono').
--   Administrador como responsável do ganho NÃO conta como vendedor (vai para a roleta da loja).
-- posvenda_redistribuir_usuario(empresa, usuario): passos pendentes e chamados abertos de quem saiu.
--   Gatilho em empresa_usuarios (ativo → inativo, ou removido), só com o módulo ligado.
-- posvenda_reavaliar_vencendo(empresa, ate): passos que vencem até a data com responsável ausente ou
--   inativo vão para a roleta da loja; os de depois da volta ficam com ele. Chamado pelo cron (C3/C7).
-- Dia útil: posvenda_proximo_dia_util, pela chave `calendario.dias_semana_uteis` (padrão seg–sex), a mesma do
--   calendário do PDV v2 (§N); sem feriados até o calendário do core existir.
--
-- Volta: supabase/scripts/volta/volta-posvenda-responsavel.sql
-- Teste: supabase/scripts/testes/teste-posvenda-responsavel.sql (+ esperado)

-- ── Apoio ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.posvenda_dia_local(p_empresa bigint, p_instante timestamptz)
returns date language sql stable set search_path = public, pg_temp as $$
  select (p_instante at time zone coalesce(public.empresa_fuso(p_empresa), 'America/Sao_Paulo'))::date
$$;

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

create or replace function public.posvenda_teto_diario(p_empresa bigint, p_filial bigint)
returns int language sql stable set search_path = public, pg_temp as $$
  select coalesce(nullif(public.config_valor_emp(p_empresa, 'posvenda', 'teto_diario', p_filial) #>> '{}', '')::int, 30)
$$;

create or replace function public.posvenda_carga_do_dia(p_empresa bigint, p_usuario uuid, p_dia date)
returns int language sql stable set search_path = public, pg_temp as $$
  select count(*)::int from public.posvenda_acompanhamentos a
   where a.empresa_id = p_empresa and a.responsavel_id = p_usuario and a.status = 'pendente'
     and public.posvenda_dia_local(p_empresa, a.previsto_para) = p_dia
$$;

-- Vendedores da roleta da loja: role 'vendedor', ativos e presentes. Mesma regra de loja de lib/roleta.ts:
-- empresa com menos de duas lojas → todos; vendedor sem loja conta como da matriz.
create or replace function public.posvenda_vendedores_da_loja(p_empresa bigint, p_filial bigint)
returns uuid[] language sql stable set search_path = public, pg_temp as $$
  with lojas as (select id, matriz from public.filiais where empresa_id = p_empresa and ativo)
  select coalesce(array_agg(eu.usuario_id order by eu.usuario_id), '{}'::uuid[])
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa and eu.ativo and not coalesce(eu.ausente, false)
     and eu.role = 'vendedor' and eu.usuario_id is not null
     and ((select count(*) from lojas) < 2
          or eu.filial_id = p_filial
          or (eu.filial_id is null and p_filial = (select id from lojas where matriz order by id limit 1)))
$$;

-- Administradores pelo cargo (nunca nome fixo): 'admin' ativos e presentes; todos ausentes → os ausentes;
-- nenhum admin → a conta 'owner'. Devolve também se caiu no dono.
create or replace function public.posvenda_administradores(p_empresa bigint, out ids uuid[], out eh_dono boolean)
language plpgsql stable set search_path = public, pg_temp as $$
begin
  select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
   where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null and not coalesce(ausente, false);
  eh_dono := false;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'admin' and usuario_id is not null;
  end if;
  if cardinality(ids) = 0 then
    select coalesce(array_agg(usuario_id order by usuario_id), '{}') into ids from public.empresa_usuarios
     where empresa_id = p_empresa and ativo and role = 'owner' and usuario_id is not null;
    eh_dono := true;
  end if;
end $$;

-- Roleta com contador próprio: o próximo depois do último, pulando os excluídos e quem já bateu o teto no dia.
-- Trava a linha do contador (FOR UPDATE) para duas transações não darem o mesmo próximo. Todos cheios → null.
create or replace function public.posvenda_roleta_proximo(p_empresa bigint, p_chave text, p_candidatos uuid[],
                                                          p_dia date, p_teto int, p_excluir uuid[] default '{}')
returns uuid language plpgsql volatile set search_path = public, pg_temp as $$
declare
  cand uuid[] := array(select x from unnest(coalesce(p_candidatos, '{}')) x where not (x = any(coalesce(p_excluir, '{}'))) order by x);
  n int := cardinality(cand);
  v_ultimo uuid; v_idx int; c uuid;
begin
  if n = 0 then return null; end if;
  insert into public.posvenda_roleta (empresa_id, chave) values (p_empresa, p_chave) on conflict do nothing;
  select ultimo_usuario_id into v_ultimo from public.posvenda_roleta where empresa_id = p_empresa and chave = p_chave for update;
  v_idx := coalesce(array_position(cand, v_ultimo), 0);
  for i in 1..n loop
    c := cand[((v_idx + i - 1) % n) + 1];
    if p_teto is null or public.posvenda_carga_do_dia(p_empresa, c, p_dia) < p_teto then
      update public.posvenda_roleta set ultimo_usuario_id = c, atualizado_em = now() where empresa_id = p_empresa and chave = p_chave;
      return c;
    end if;
  end loop;
  return null;
end $$;

-- ── A regra (D9) ────────────────────────────────────────────────────────────────────────────────
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
    -- a) o vendedor do negócio (administrador ou dono como responsável do ganho NÃO contam)
    select n.responsavel_id into v_vend
      from public.negocios n
      join public.empresa_usuarios eu on eu.usuario_id = n.responsavel_id and eu.empresa_id = n.empresa_id
     where n.id = p_negocio and n.empresa_id = p_empresa and eu.ativo and eu.role = 'vendedor'
       and not (n.responsavel_id = any(v_excl))
       and not (coalesce(eu.ausente, false) and v_dia <= v_hoje);
    if v_vend is not null then
      while public.posvenda_carga_do_dia(p_empresa, v_vend, v_dia) >= v_teto and t < 60 loop
        v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
      end loop;
      return query select v_vend, 'vendedor'::text, v_dia;
      return;
    end if;

    -- e) o responsável padrão da loja, se configurado (opcional)
    begin
      v_padrao := nullif(public.config_valor_emp(p_empresa, 'posvenda', 'responsavel_padrao', p_filial) #>> '{}', '')::uuid;
    exception when others then v_padrao := null;
    end;
    if v_padrao is not null and not (v_padrao = any(v_excl))
       and exists (select 1 from public.empresa_usuarios where empresa_id = p_empresa and usuario_id = v_padrao
                    and ativo and not coalesce(ausente, false))
       and public.posvenda_carga_do_dia(p_empresa, v_padrao, v_dia) < v_teto then
      return query select v_padrao, 'padrao_loja'::text, v_dia;
      return;
    end if;

    -- b) a roleta dos vendedores da loja
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

  -- c/d) administradores (NPS até 6, chamados, loja sem vendedor, negócio sem loja)
  select * into v_adm from public.posvenda_administradores(p_empresa);
  t := 0;
  loop
    v_esc := public.posvenda_roleta_proximo(p_empresa, 'administradores', v_adm.ids, v_dia, v_teto, v_excl);
    exit when v_esc is not null or t >= 60;
    v_dia := public.posvenda_proximo_dia_util(p_empresa, p_filial, v_dia); t := t + 1;
  end loop;
  if v_esc is null then
    -- ninguém além dos excluídos: sem saída. Nada nasce sem responsável.
    raise exception 'SEM_RESPONSAVEL: empresa % sem vendedor, administrador ou dono ativo', p_empresa using errcode = 'P0001';
  end if;
  return query select v_esc, case when v_adm.eh_dono then 'dono' else 'administradores' end, v_dia;
end $$;

-- ── Redistribuição ──────────────────────────────────────────────────────────────────────────────
-- Muda o responsável de um acompanhamento pendente pela mesma regra, sem quem está em p_excluir. Mantém a hora
-- do dia; se o teto empurrar, muda só o dia. Deixa a observação "reatribuído".
create or replace function public.posvenda_reatribuir_acompanhamento(p_id bigint, p_excluir uuid[], p_motivo text)
returns uuid language plpgsql volatile set search_path = public, pg_temp as $$
declare
  a public.posvenda_acompanhamentos;
  r record;
  v_dia date;
begin
  select * into a from public.posvenda_acompanhamentos where id = p_id and status = 'pendente' for update;
  if not found then return null; end if;
  v_dia := public.posvenda_dia_local(a.empresa_id, a.previsto_para);
  select * into r from public.posvenda_resolver_responsavel(
    a.empresa_id, a.filial_id,
    case when a.origem_responsavel in ('administradores', 'dono') then 'administradores' else 'acompanhamento' end,
    a.negocio_id, v_dia, p_excluir);
  update public.posvenda_acompanhamentos
     set responsavel_id = r.responsavel_id, origem_responsavel = r.origem,
         previsto_para = a.previsto_para + make_interval(days => r.dia - v_dia),
         observacao = concat_ws(E'\n', a.observacao, format('reatribuído (%s) em %s', p_motivo, to_char(now(), 'DD/MM/YYYY')))
   where id = p_id;
  return r.responsavel_id;
end $$;

create or replace function public.posvenda_redistribuir_usuario(p_empresa bigint, p_usuario uuid)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_id bigint; c record; r record; n int := 0;
begin
  for v_id in select id from public.posvenda_acompanhamentos
               where empresa_id = p_empresa and responsavel_id = p_usuario and status = 'pendente' order by previsto_para, id loop
    perform public.posvenda_reatribuir_acompanhamento(v_id, array[p_usuario], 'responsável desligado');
    n := n + 1;
  end loop;
  for c in select * from public.posvenda_chamados
            where empresa_id = p_empresa and responsavel_id = p_usuario and resolvido_em is null order by id for update loop
    select * into r from public.posvenda_resolver_responsavel(p_empresa, c.filial_id, 'administradores', c.negocio_id,
                                                              public.posvenda_dia_local(p_empresa, now()), array[p_usuario]);
    update public.posvenda_chamados set responsavel_id = r.responsavel_id, origem_responsavel = r.origem where id = c.id;
    insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, de, para, texto)
    values (p_empresa, c.id, 'atribuicao', p_usuario::text, r.responsavel_id::text, 'reatribuído: responsável desligado');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Passos que vencem até p_ate com o responsável ausente ou desligado vão para a roleta (os de depois da volta ficam).
create or replace function public.posvenda_reavaliar_vencendo(p_empresa bigint, p_ate date default null)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_ate date := coalesce(p_ate, public.posvenda_dia_local(p_empresa, now()));
  a record; n int := 0;
begin
  for a in
    select x.id, x.responsavel_id from public.posvenda_acompanhamentos x
      left join public.empresa_usuarios eu on eu.empresa_id = x.empresa_id and eu.usuario_id = x.responsavel_id
     where x.empresa_id = p_empresa and x.status = 'pendente'
       and public.posvenda_dia_local(p_empresa, x.previsto_para) <= v_ate
       and (eu.usuario_id is null or not eu.ativo or coalesce(eu.ausente, false))
     order by x.previsto_para, x.id
  loop
    perform public.posvenda_reatribuir_acompanhamento(a.id, array[a.responsavel_id], 'responsável ausente no vencimento');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Desligar (ou remover) alguém da empresa redistribui as pendências dele, só com o módulo ligado.
create or replace function public.posvenda_usuario_desligado()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.core_modulo_ligado(old.empresa_id, 'posvenda') or old.usuario_id is null then
    return null;
  end if;
  if tg_op = 'DELETE' or (old.ativo and not new.ativo) then
    perform public.posvenda_redistribuir_usuario(old.empresa_id, old.usuario_id);
  end if;
  return null;
end $$;

drop trigger if exists empresa_usuarios_posvenda_desligado on public.empresa_usuarios;
create trigger empresa_usuarios_posvenda_desligado
  after update of ativo or delete on public.empresa_usuarios
  for each row execute function public.posvenda_usuario_desligado();

-- Tudo interno: só o servidor (service_role) e as funções do módulo chamam.
do $$
declare f text;
begin
  foreach f in array array[
    'posvenda_dia_local(bigint,timestamptz)', 'posvenda_proximo_dia_util(bigint,bigint,date)', 'posvenda_teto_diario(bigint,bigint)',
    'posvenda_carga_do_dia(bigint,uuid,date)', 'posvenda_vendedores_da_loja(bigint,bigint)', 'posvenda_administradores(bigint)',
    'posvenda_roleta_proximo(bigint,text,uuid[],date,integer,uuid[])',
    'posvenda_resolver_responsavel(bigint,bigint,text,bigint,date,uuid[])',
    'posvenda_reatribuir_acompanhamento(bigint,uuid[],text)', 'posvenda_redistribuir_usuario(bigint,uuid)',
    'posvenda_reavaliar_vencendo(bigint,date)', 'posvenda_usuario_desligado()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
