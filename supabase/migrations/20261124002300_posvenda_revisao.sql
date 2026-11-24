-- PÓS-VENDA: CORREÇÕES DA REVISÃO DE CÓDIGO (24/11/2026). Só vale com o módulo ligado.
-- 1. Passo coerente com a empresa (furo ALTO): a régua, o modelo e a pesquisa do passo são da MESMA empresa; o
--    responsável "usuario:<id>" é alguém da empresa. Antes, o admin de A gravava pela API um passo na régua de B.
--    E o iniciar só lê passos da empresa da venda.
-- 2. "Quando o cliente compra de novo" (ao_recomprar) passa a valer, pela régua da jornada ANTERIOR:
--    reiniciar (padrão) = cancela os passos do produto dela; manter = não mexe; encerrar = cancela os pendentes e conclui.
-- 3. Data corrigida (reancorar): passo que repete vai para a primeira ocorrência de hoje em diante (como na venda nova);
--    passos que ainda não tinham nascido (data movida para depois) nascem; rodar de novo não muda nada (idempotente).
-- 4. Passo juntado: quando o principal é feito ou fica sem resposta, os juntados recebem o mesmo resultado (e repetem).
-- 5. Ativar vendas antigas: com passo que repete ou com âncora fora da venda, não há corte por data da venda.
-- 6. Data fixa com ajuste negativo: vale a próxima data do ano cujo passo (já com o ajuste) cai depois da venda.
--    Data de campo que repete (aniversário): a 1ª ocorrência é a primeira a partir da venda (não a do ano do campo).
-- 7. Responsável "usuario:" que saiu da empresa ou está inativo: o passo segue a regra padrão.
-- 8. Nota (NPS) com a pesquisa desativada: usa a pesquisa NPS da empresa mesmo assim (antes: erro).
-- Novo apoio: posvenda_nascer_passo (um passo de uma jornada, com todas as regras), usado pelo iniciar e pelo reancorar.
-- Volta: supabase/scripts/volta/volta-posvenda-revisao.sql   Teste: supabase/scripts/testes/teste-posvenda-revisao.sql

do $$
declare r record;
begin
  for r in select * from (values
      ('public.posvenda_iniciar_jornadas(bigint)', array['3333d00f86951bffa0af8fbe83c71963', '5494a31e9b5a1a2ed1bdf8b738688305']),
      ('public.posvenda_reancorar_jornada(bigint)', array['92bf202803e0fbf5a3d88d24d736f385']),
      ('public.posvenda_data_do_passo(bigint,bigint,integer)', array['a51e283409f6564df4800350d2808304', '014c68d648ec480bd7f6ab90b2d0c6ff']),
      ('public.posvenda_repetir_passo()', array['a91959bb2a75331eba635efc3332fbdc', '87871d258856531f2466f3176f62d795']),
      ('public.posvenda_promover_juntado()', array['5783d91e776084cf80e4632119c1515b']),
      ('public.posvenda_ativar_existentes(bigint)', array['b28b629f595e6bb7353495ff8217912d']),
      ('public.posvenda_nps_registrar(bigint,integer,text,bigint,text)', array['092795a3fb2658a7546ffdcbd93e0473'])) v(f, h) loop
    if not (coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = r.f::regprocedure), '-') = any(r.h)) then
      raise exception '% mudou desde a conferência de 24/11/2026; revise antes de aplicar', r.f;
    end if;
  end loop;
end $$;

-- ── 1. Passo coerente com a empresa ──────────────────────────────────────────────────────────────
create or replace function public.posvenda_passo_coerente()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.posvenda_cadencias c where c.id = new.cadencia_id and c.empresa_id = new.empresa_id) then
    raise exception using errcode = '42501', message = 'PASSO_DE_OUTRA_EMPRESA: a régua do passo não é desta empresa.';
  end if;
  if new.modelo_id is not null and not exists (select 1 from public.modelos_mensagem m where m.id = new.modelo_id and m.empresa_id = new.empresa_id) then
    raise exception using errcode = '42501', message = 'PASSO_DE_OUTRA_EMPRESA: o modelo do passo não é desta empresa.';
  end if;
  if new.pesquisa_id is not null and not exists (select 1 from public.posvenda_pesquisas q where q.id = new.pesquisa_id and q.empresa_id = new.empresa_id) then
    raise exception using errcode = '42501', message = 'PASSO_DE_OUTRA_EMPRESA: a pesquisa do passo não é desta empresa.';
  end if;
  if new.responsavel like 'usuario:%' and (tg_op = 'INSERT' or new.responsavel is distinct from old.responsavel)
     and not exists (select 1 from public.empresa_usuarios eu where eu.empresa_id = new.empresa_id
                       and eu.usuario_id::text = substr(new.responsavel, 9) and eu.ativo and not eu.conta_servico) then
    raise exception using errcode = '42501', message = 'RESPONSAVEL_INVALIDO: escolha uma pessoa ativa desta empresa.';
  end if;
  return new;
end $$;
drop trigger if exists posvenda_cadencia_passos_coerente on public.posvenda_cadencia_passos;
create trigger posvenda_cadencia_passos_coerente before insert or update on public.posvenda_cadencia_passos
  for each row execute function public.posvenda_passo_coerente();

-- ── 6. Datas: data fixa com ajuste; data de campo que repete conta da venda ────────────────────────
create or replace function public.posvenda_data_do_passo(p_negocio bigint, p_passo bigint, p_ocorrencia int default 1)
returns date language plpgsql stable set search_path = public, pg_temp as $$
declare
  n public.negocios; p public.posvenda_cadencia_passos; v_base date; v_dia date; v_mes int; v_dd int; v_ano int; i int := 0;
  v_ini numeric; v_ritmo numeric; v_ref_em date; v_ref_valor numeric; v_alvo numeric; v_le record; k int := greatest(coalesce(p_ocorrencia, 1), 1);
begin
  select * into n from public.negocios where id = p_negocio;
  select * into p from public.posvenda_cadencia_passos where id = p_passo;
  if n.id is null or p.id is null or n.ganho_em is null then return null; end if;
  v_base := public.posvenda_dia_local(n.empresa_id, n.ganho_em);

  if p.ancora_tipo = 'venda' then
    return public.posvenda_somar_repeticao(v_base + p.dia_offset, p.repetir_intervalo, p.repetir_unidade, k - 1);

  elsif p.ancora_tipo = 'data_fixa' then
    v_mes := split_part(p.ancora_mes_dia, '-', 1)::int; v_dd := split_part(p.ancora_mes_dia, '-', 2)::int;
    v_ano := extract(year from v_base)::int;
    loop
      v_dia := make_date(v_ano, v_mes, 1) + (least(v_dd, extract(day from (make_date(v_ano, v_mes, 1) + interval '1 month - 1 day'))::int) - 1);
      exit when v_dia + p.dia_offset > v_base;
      v_ano := v_ano + 1;
    end loop;
    return public.posvenda_somar_repeticao(v_dia + p.dia_offset, p.repetir_intervalo, p.repetir_unidade, k - 1);

  elsif p.ancora_tipo = 'campo_data' then
    v_dia := public.posvenda_data(public.posvenda_campo(n.id, p.ancora_campo));
    if v_dia is null then return null; end if;
    v_dia := v_dia + p.dia_offset;
    if p.repetir_intervalo is not null then
      while v_dia < v_base and i < 5000 loop
        v_dia := public.posvenda_somar_repeticao(v_dia, p.repetir_intervalo, p.repetir_unidade, 1);
        i := i + 1;
      end loop;
    end if;
    return public.posvenda_somar_repeticao(v_dia, p.repetir_intervalo, p.repetir_unidade, k - 1);

  elsif p.ancora_tipo = 'uso' then
    v_ini := public.posvenda_numero(public.posvenda_campo(n.id, p.ancora_campo));
    v_ritmo := coalesce(case when p.uso_ritmo_campo is not null then public.posvenda_numero(public.posvenda_campo(n.id, p.uso_ritmo_campo)) end,
                        p.uso_ritmo_padrao);
    if v_ini is null then return null; end if;
    v_ref_em := v_base; v_ref_valor := v_ini;
    select valor, em into v_le from public.posvenda_uso_leituras
     where negocio_id = n.id and campo = p.ancora_campo and em > v_base order by em desc, id desc limit 1;
    if v_le.em is not null then
      if v_le.valor > v_ini then v_ritmo := (v_le.valor - v_ini) / (v_le.em - v_base); end if;
      v_ref_em := v_le.em; v_ref_valor := v_le.valor;
    end if;
    if v_ritmo is null or v_ritmo <= 0 then return null; end if;
    v_alvo := v_ini + p.uso_alvo * k;
    return v_ref_em + greatest(ceil((v_alvo - v_ref_valor) / v_ritmo)::int, 0) + p.dia_offset;
  end if;
  return null;
end $$;

-- ── Apoio: nasce UM passo numa jornada (condição, filtros, 1ª ocorrência de hoje em diante, junção, responsável) ──
create or replace function public.posvenda_nascer_passo(p_negocio bigint, p_jornada bigint, p_passo bigint)
returns bigint language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  n public.negocios; p public.posvenda_cadencia_passos; v_cond text; v_fuso text; v_hoje date; v_dia date; v_k int := 1;
  v_igual record; r record; v_id bigint;
begin
  select * into n from public.negocios where id = p_negocio;
  select * into p from public.posvenda_cadencia_passos where id = p_passo and empresa_id = n.empresa_id;
  if n.id is null or p.id is null or not p.ativo then return null; end if;
  v_cond := nullif(n.dados -> 'venda' ->> 'condicao', '');
  if p.filtros ? 'condicao' and (p.filtros ->> 'condicao') is distinct from v_cond then return null; end if;
  if not public.posvenda_passo_filtra(n.id, p.filtros) then return null; end if;
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_dia := public.posvenda_data_do_passo(n.id, p.id, 1);
  if v_dia is null then return null; end if;
  while v_dia < v_hoje and p.repetir_intervalo is not null and (p.repetir_max is null or v_k < p.repetir_max) and v_k < 1000 loop
    v_k := v_k + 1;
    v_dia := public.posvenda_data_do_passo(n.id, p.id, v_k);
    exit when v_dia is null;
  end loop;
  if v_dia is null or v_dia < v_hoje then return null; end if;

  select a.id, a.responsavel_id, a.origem_responsavel, a.previsto_para into v_igual
    from public.posvenda_acompanhamentos a
    join public.posvenda_cadencia_passos pp on pp.id = a.passo_id
   where a.empresa_id = n.empresa_id and a.contato_id = n.contato_id and a.status = 'pendente'
     and a.jornada_id <> p_jornada and pp.tipo_acao = p.tipo_acao
     and public.posvenda_dia_local(n.empresa_id, a.previsto_para) = public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia)
   order by a.id limit 1;
  if found then
    insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                                 responsavel_id, origem_responsavel, previsto_para, status, motivo, juntado_a, ocorrencia)
    values (n.empresa_id, n.filial_id, p_jornada, p.id, n.contato_id, n.id,
            v_igual.responsavel_id, v_igual.origem_responsavel, v_igual.previsto_para, 'juntado', 'mesmo_dia', v_igual.id, v_k)
    returning id into v_id;
    return v_id;
  end if;

  if p.responsavel like 'usuario:%' and exists (select 1 from public.empresa_usuarios eu where eu.empresa_id = n.empresa_id
       and eu.usuario_id::text = substr(p.responsavel, 9) and eu.ativo and not eu.conta_servico) then
    select substr(p.responsavel, 9)::uuid as responsavel_id, 'manual'::text as origem, public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia) as dia into r;
  else
    select * into r from public.posvenda_resolver_responsavel(
      n.empresa_id, n.filial_id, case when p.responsavel = 'administradores' then 'administradores' else 'acompanhamento' end, n.id, v_dia);
  end if;
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                               responsavel_id, origem_responsavel, previsto_para, ocorrencia)
  values (n.empresa_id, n.filial_id, p_jornada, p.id, n.contato_id, n.id, r.responsavel_id, r.origem,
          (r.dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, r.dia, coalesce(p.hora_sugerida, time '10:00'))) at time zone v_fuso, v_k)
  returning id into v_id;
  return v_id;
end $$;

-- ── posvenda_iniciar_jornadas: passos da empresa, recompra pela régua anterior (ao_recomprar) ─────
create or replace function public.posvenda_iniciar_jornadas(p_negocio bigint)
returns bigint language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios; c public.posvenda_cadencias; p record; v_cat bigint; v_cond text; v_jor bigint;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.status <> 'ganho' or n.ganho_em is null then return null; end if;
  if not public.core_modulo_ligado(n.empresa_id, 'posvenda') then return null; end if;
  if exists (select 1 from public.posvenda_jornadas where negocio_id = p_negocio and status in ('ativa', 'pausada')) then
    return null;
  end if;

  v_cat := case when jsonb_typeof(n.dados -> 'venda' -> 'categoria_id') = 'number' then (n.dados -> 'venda' ->> 'categoria_id')::bigint end;
  v_cond := nullif(n.dados -> 'venda' ->> 'condicao', '');

  select * into c from public.posvenda_cadencias
   where empresa_id = n.empresa_id and ativo and gatilho = 'ganho'
     and v_cat is not null and (filtros -> 'categorias') @> to_jsonb(v_cat)
     and (not (filtros ? 'condicao') or filtros ->> 'condicao' = v_cond)
     and public.posvenda_passo_filtra(n.id, filtros)
   order by prioridade desc, id limit 1;
  if not found then
    select * into c from public.posvenda_cadencias
     where empresa_id = n.empresa_id and ativo and gatilho = 'ganho' and not (filtros ? 'categorias')
       and (not (filtros ? 'condicao') or filtros ->> 'condicao' = v_cond)
       and public.posvenda_passo_filtra(n.id, filtros)
     order by prioridade desc, id limit 1;
  end if;
  if not found then return null; end if;

  if v_cat is not null then
    update public.posvenda_acompanhamentos a
       set status = 'cancelado', motivo = 'recompra'
      from public.posvenda_jornadas j, public.posvenda_cadencias cj, public.posvenda_cadencia_passos pp
     where a.jornada_id = j.id and cj.id = j.cadencia_id and a.passo_id = pp.id
       and a.status in ('pendente', 'juntado')
       and j.empresa_id = n.empresa_id and j.contato_id = n.contato_id and j.categoria_id = v_cat
       and j.negocio_id is distinct from p_negocio and j.status = 'ativa'
       and (cj.ao_recomprar = 'encerrar' or (coalesce(cj.ao_recomprar, 'reiniciar') = 'reiniciar' and pp.grupo = 'produto'));
    update public.posvenda_jornadas j
       set status = 'concluida', motivo_fim = 'recompra'
      from public.posvenda_cadencias cj
     where cj.id = j.cadencia_id and cj.ao_recomprar = 'encerrar'
       and j.empresa_id = n.empresa_id and j.contato_id = n.contato_id and j.categoria_id = v_cat
       and j.negocio_id is distinct from p_negocio and j.status = 'ativa';
  end if;

  insert into public.posvenda_jornadas (empresa_id, filial_id, contato_id, negocio_id, cadencia_id, ancora_em, categoria_id, condicao)
  values (n.empresa_id, n.filial_id, n.contato_id, n.id, c.id, n.ganho_em, v_cat, v_cond)
  returning id into v_jor;

  for p in select id from public.posvenda_cadencia_passos where cadencia_id = c.id and empresa_id = n.empresa_id and ativo order by ordem loop
    perform public.posvenda_nascer_passo(n.id, v_jor, p.id);
  end loop;
  return v_jor;
end $$;

-- ── 3. posvenda_reancorar_jornada: 1ª ocorrência de hoje em diante; nascem os que faltam; idempotente ──
create or replace function public.posvenda_reancorar_jornada(p_negocio bigint)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios; v_fuso text; v_hoje date; v_dia date; v_k int; v int := 0; a record; j record; pp record;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.status <> 'ganho' or n.ganho_em is null then return 0; end if;
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  update public.posvenda_jornadas set ancora_em = n.ganho_em where negocio_id = p_negocio and status in ('ativa', 'pausada');
  for a in
    select x.id, x.passo_id, x.ocorrencia, x.jornada_id from public.posvenda_acompanhamentos x
      join public.posvenda_jornadas jj on jj.id = x.jornada_id
     where jj.negocio_id = p_negocio and jj.status in ('ativa', 'pausada') and x.status = 'pulado' and x.motivo = 'data_no_passado_apos_correcao'
       and not exists (select 1 from public.posvenda_acompanhamentos o where o.jornada_id = x.jornada_id and o.passo_id = x.passo_id
                         and o.id <> x.id and o.status in ('pendente', 'juntado'))
  loop
    v_dia := public.posvenda_data_do_passo(p_negocio, a.passo_id, a.ocorrencia);
    if v_dia >= v_hoje then
      update public.posvenda_acompanhamentos set status = 'pendente', motivo = null where id = a.id;
    end if;
  end loop;
  for a in
    select x.id, x.previsto_para, x.passo_id, x.ocorrencia, p.repetir_intervalo, p.repetir_max from public.posvenda_acompanhamentos x
      join public.posvenda_jornadas jj on jj.id = x.jornada_id
      join public.posvenda_cadencia_passos p on p.id = x.passo_id
     where jj.negocio_id = p_negocio and jj.status in ('ativa', 'pausada') and x.status in ('pendente', 'juntado')
  loop
    v_k := a.ocorrencia;
    v_dia := public.posvenda_data_do_passo(p_negocio, a.passo_id, v_k);
    while v_dia is not null and v_dia < v_hoje and a.repetir_intervalo is not null and (a.repetir_max is null or v_k < a.repetir_max) and v_k < 1000 loop
      v_k := v_k + 1;
      v_dia := public.posvenda_data_do_passo(p_negocio, a.passo_id, v_k);
    end loop;
    if v_dia is null or v_dia < v_hoje then
      update public.posvenda_acompanhamentos
         set status = 'pulado', motivo = 'data_no_passado_apos_correcao',
             ocorrencia = case when a.repetir_intervalo is not null then greatest(v_k, coalesce(a.repetir_max, v_k)) else ocorrencia end
       where id = a.id;
    else
      v_dia := public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia);
      update public.posvenda_acompanhamentos
         set ocorrencia = v_k,
             previsto_para = (v_dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, v_dia, (a.previsto_para at time zone v_fuso)::time)) at time zone v_fuso
       where id = a.id;
    end if;
    v := v + 1;
  end loop;
  for j in select id, cadencia_id from public.posvenda_jornadas where negocio_id = p_negocio and status = 'ativa' loop
    for pp in
      select p.id from public.posvenda_cadencia_passos p
       where p.cadencia_id = j.cadencia_id and p.empresa_id = n.empresa_id and p.ativo
         and not exists (select 1 from public.posvenda_acompanhamentos x where x.jornada_id = j.id and x.passo_id = p.id)
       order by p.ordem
    loop
      if public.posvenda_nascer_passo(p_negocio, j.id, pp.id) is not null then v := v + 1; end if;
    end loop;
  end loop;
  return v;
end $$;

-- ── 4. Repetição: também a partir de um passo juntado ─────────────────────────────────────────────
create or replace function public.posvenda_repetir_passo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.posvenda_cadencia_passos; n public.negocios; j public.posvenda_jornadas; v_dia date; v_hoje date; r record; v_fuso text;
begin
  if old.status not in ('pendente', 'juntado') or new.status not in ('feito', 'sem_resposta', 'pulado', 'perdido') then return null; end if;
  select * into p from public.posvenda_cadencia_passos where id = new.passo_id;
  if p.repetir_intervalo is null or not p.ativo or (p.repetir_max is not null and new.ocorrencia >= p.repetir_max) then return null; end if;
  select * into j from public.posvenda_jornadas where id = new.jornada_id;
  if j.status <> 'ativa' or new.negocio_id is null then return null; end if;
  select * into n from public.negocios where id = new.negocio_id;
  if n.status <> 'ganho' then return null; end if;
  if exists (select 1 from public.posvenda_acompanhamentos where jornada_id = new.jornada_id and passo_id = new.passo_id
              and ocorrencia = new.ocorrencia + 1) then return null; end if;

  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_dia := public.posvenda_data_do_passo(n.id, p.id, new.ocorrencia + 1);
  if v_dia is null then return null; end if;
  v_dia := greatest(v_dia, v_hoje + 1);
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  if p.responsavel like 'usuario:%' and exists (select 1 from public.empresa_usuarios eu where eu.empresa_id = n.empresa_id
       and eu.usuario_id::text = substr(p.responsavel, 9) and eu.ativo and not eu.conta_servico) then
    select substr(p.responsavel, 9)::uuid as responsavel_id, 'manual'::text as origem, public.core_dia_aberto(n.empresa_id, n.filial_id, v_dia) as dia into r;
  else
    select * into r from public.posvenda_resolver_responsavel(
      n.empresa_id, n.filial_id, case when p.responsavel = 'administradores' then 'administradores' else 'acompanhamento' end, n.id, v_dia);
  end if;
  insert into public.posvenda_acompanhamentos (empresa_id, filial_id, jornada_id, passo_id, contato_id, negocio_id,
                                               responsavel_id, origem_responsavel, previsto_para, ocorrencia)
  values (n.empresa_id, n.filial_id, j.id, p.id, n.contato_id, n.id, r.responsavel_id, r.origem,
          (r.dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, r.dia, coalesce(p.hora_sugerida, time '10:00'))) at time zone v_fuso,
          new.ocorrencia + 1);
  return null;
end $$;

-- ── 4. Juntados: saem da fila com o principal (feito / sem resposta); cancelado ou pulado: o 1º volta à fila ──
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
  elsif old.status = 'pendente' and new.status in ('feito', 'sem_resposta') then
    update public.posvenda_acompanhamentos
       set status = new.status, resultado = coalesce(new.resultado, new.status), motivo = 'junto com o passo ' || new.id,
           feito_por = new.feito_por, feito_em = coalesce(new.feito_em, now()), tentativas = new.tentativas
     where juntado_a = new.id and status = 'juntado';
  end if;
  return null;
end $$;

-- ── 5. Ativar vendas antigas: sem corte quando há passo que repete ou fora da âncora da venda ─────────
create or replace function public.posvenda_ativar_existentes(p_empresa bigint)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_max int; v_sem_corte boolean; v_hoje date; r record; v_lidas int := 0; v_jor int := 0; v_antes bigint; v_ini timestamptz := clock_timestamp();
begin
  if not public.core_modulo_ligado(p_empresa, 'posvenda') then
    return jsonb_build_object('feito', false, 'motivo', 'o módulo Pós-venda não está ligado nesta empresa');
  end if;
  select max(pp.dia_offset), bool_or(pp.repetir_intervalo is not null or pp.ancora_tipo <> 'venda') into v_max, v_sem_corte
    from public.posvenda_cadencia_passos pp join public.posvenda_cadencias c on c.id = pp.cadencia_id
   where c.empresa_id = p_empresa and pp.empresa_id = p_empresa and c.ativo and pp.ativo;
  if v_max is null then
    return jsonb_build_object('feito', false, 'motivo', 'nenhuma régua ativa com passos');
  end if;
  v_hoje := public.posvenda_dia_local(p_empresa, now());
  select count(*) into v_antes from public.posvenda_acompanhamentos where empresa_id = p_empresa;

  for r in
    select n.id from public.negocios n
     where n.empresa_id = p_empresa and n.status = 'ganho' and n.ganho_em is not null
       and (v_sem_corte or public.posvenda_dia_local(p_empresa, n.ganho_em) + v_max >= v_hoje)
       and not exists (select 1 from public.posvenda_jornadas j where j.negocio_id = n.id and j.status in ('ativa', 'pausada'))
     order by n.ganho_em, n.id
  loop
    v_lidas := v_lidas + 1;
    if public.posvenda_iniciar_jornadas(r.id) is not null then v_jor := v_jor + 1; end if;
  end loop;

  return jsonb_build_object(
    'feito', true, 'vendas_lidas', v_lidas, 'jornadas_criadas', v_jor,
    'passos_criados', (select count(*) from public.posvenda_acompanhamentos where empresa_id = p_empresa) - v_antes,
    'segundos', round(extract(epoch from clock_timestamp() - v_ini)::numeric, 1));
end $$;

-- ── 8. NPS: a pesquisa NPS da empresa mesmo desativada ───────────────────────────────────────────
do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('public.posvenda_nps_registrar(bigint,integer,text,bigint,text)'::regprocedure);
  v_novo := replace(v_def, $q$where empresa_id = n.empresa_id and tipo = 'nps' and ativo order by id limit 1;$q$,
                           $q$where empresa_id = n.empresa_id and tipo = 'nps' order by ativo desc, id limit 1;$q$);
  if v_novo = v_def then raise exception 'posvenda_nps_registrar: trecho da pesquisa não encontrado'; end if;
  execute v_novo;
end $$;

do $$
declare f text;
begin
  foreach f in array array['posvenda_passo_coerente()', 'posvenda_nascer_passo(bigint,bigint,bigint)', 'posvenda_data_do_passo(bigint,bigint,integer)',
                           'posvenda_iniciar_jornadas(bigint)', 'posvenda_reancorar_jornada(bigint)', 'posvenda_repetir_passo()',
                           'posvenda_promover_juntado()', 'posvenda_ativar_existentes(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
