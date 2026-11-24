-- PÓS-VENDA UNIVERSAL (Lucas, 24/11/2026; docs/design-pos-venda.md §10). Só vale com o módulo ligado.
--
-- 1. Categorias de venda PRÓPRIAS (posvenda_categorias_venda): para quem não usa o Estoque. Qual lista vale é da
--    empresa (`posvenda.categorias_fonte` = estoque | proprias; app). Quem tem Estoque segue com as dele.
-- 2. Campos da venda: os campos personalizados de negócio do módulo (campos_personalizados, modulo_dono 'posvenda')
--    aparecem no modal de venda; `obrigatorio_na_venda` exige o campo ao marcar a venda (app e rota).
-- 3. Âncora do passo (`ancora_tipo`):
--      venda       dias depois da venda (como sempre);
--      data_fixa   próxima ocorrência de um dia do ano (MM-DD) depois da venda, mais o deslocamento;
--      campo_data  a data de um campo da venda ou do cliente (ex.: aniversário, vencimento), mais o deslocamento;
--      uso         uso estimado: valor do campo na venda (ex.: km) + ritmo por dia (campo ou padrão) até o alvo
--                  (`uso_alvo`, a cada quanto); recalcula quando alguém informa um valor novo (posvenda_uso_registrar).
--    O deslocamento pode ser negativo fora da âncora "venda" (ex.: 7 dias antes do aniversário).
-- 4. Repetição: `repetir_intervalo` + `repetir_unidade` (dias | meses), `repetir_max` opcional. Quando a ocorrência sai
--    da fila (feito, sem resposta, pulado, perdido), nasce a próxima (acompanhamentos.ocorrencia). No passo de USO a
--    repetição é a cada `uso_alvo` (o intervalo só liga a repetição). Data fixa repete todo ano se não disser outro intervalo.
-- 5. Filtro do passo por valor de campo: filtros.campos = [{chave, op: igual|diferente|contem|maior|menor|preenchido, valor}].
-- posvenda_iniciar_jornadas e posvenda_reancorar_jornada passam a usar posvenda_data_do_passo (guardadas pelo md5).
--
-- Volta: supabase/scripts/volta/volta-posvenda-universal.sql
-- Teste: supabase/scripts/testes/teste-posvenda-universal.sql

do $$
declare r record;
begin
  for r in select * from (values
      ('public.posvenda_iniciar_jornadas(bigint)', '7150b032a6879a0524c5fa277edab094'),
      ('public.posvenda_reancorar_jornada(bigint)', '87f335035b2841dcb7c9293e4724fb6f')) v(f, h) loop
    if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = r.f::regprocedure), '-') <> r.h then
      raise exception '% mudou desde a conferência de 24/11/2026; revise antes de aplicar', r.f;
    end if;
  end loop;
end $$;

-- ── 1. Categorias próprias ─────────────────────────────────────────────────────────────────────
create table if not exists public.posvenda_categorias_venda (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 60),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists posvenda_categorias_venda_empresa on public.posvenda_categorias_venda (empresa_id, ativo, ordem);
alter table public.posvenda_categorias_venda enable row level security;
create policy posvenda_categorias_venda_leitura on public.posvenda_categorias_venda for select to authenticated
  using (empresa_id = (select get_empresa_id()));
create policy posvenda_categorias_venda_escrita on public.posvenda_categorias_venda for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
create policy somente_leitura_insert on public.posvenda_categorias_venda as restrictive for insert to authenticated with check ((select public.sessao_pode_escrever()));
create policy somente_leitura_update on public.posvenda_categorias_venda as restrictive for update to authenticated using ((select public.sessao_pode_escrever())) with check ((select public.sessao_pode_escrever()));
create policy somente_leitura_delete on public.posvenda_categorias_venda as restrictive for delete to authenticated using ((select public.sessao_pode_escrever()));
revoke all on public.posvenda_categorias_venda from anon, authenticated;
grant select, insert, update, delete on public.posvenda_categorias_venda to authenticated;
grant all on public.posvenda_categorias_venda to service_role;

-- As categorias que o modal de venda oferece (e a rota confere): as do Estoque, como sempre; as próprias do Pós-venda
-- só com o módulo ligado E a empresa escolhendo `posvenda.categorias_fonte` = "proprias". Empresa da sessão.
create or replace function public.core_venda_categorias()
returns table (id bigint, nome text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_emp bigint := public.get_empresa_id();
begin
  if v_emp is null then return; end if;
  if public.core_modulo_ligado(v_emp, 'posvenda')
     and coalesce(public.config_valor_emp(v_emp, 'posvenda', 'categorias_fonte', null) #>> '{}', 'estoque') = 'proprias' then
    return query select c.id, c.nome from public.posvenda_categorias_venda c
                  where c.empresa_id = v_emp and c.ativo order by c.ordem, c.nome;
  else
    return query select c.id::bigint, c.nome::text from public.estoque_categorias c
                  where c.empresa_id = v_emp and c.ativo order by c.ordem, c.nome;
  end if;
end $$;
revoke all on function public.core_venda_categorias() from public, anon;
grant execute on function public.core_venda_categorias() to authenticated, service_role;

-- ── 2. Campos da venda ───────────────────────────────────────────────────────────────────────────
alter table public.campos_personalizados add column if not exists obrigatorio_na_venda boolean not null default false;
comment on column public.campos_personalizados.obrigatorio_na_venda is
  'Campo de negócio do Pós-venda (modulo_dono posvenda): exigido no modal de venda. Só vale com o módulo ligado.';

-- Os campos que o modal de venda pede (e a rota confere): os de negócio do Pós-venda, só com o módulo ligado.
create or replace function public.core_venda_campos()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_emp bigint := public.get_empresa_id();
begin
  if v_emp is null or not public.core_modulo_ligado(v_emp, 'posvenda') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('chave', c.chave, 'rotulo', c.rotulo, 'tipo', c.tipo, 'opcoes', c.opcoes,
                                                       'obrigatorio', c.obrigatorio_na_venda) order by c.ordem, c.id)
                     from public.campos_personalizados c
                    where c.empresa_id = v_emp and c.entidade = 'negocio' and c.modulo_dono = 'posvenda' and c.ativo), '[]'::jsonb);
end $$;
revoke all on function public.core_venda_campos() from public, anon;
grant execute on function public.core_venda_campos() to authenticated, service_role;

-- ── 3/4. Âncora e repetição do passo ─────────────────────────────────────────────────────────────
alter table public.posvenda_cadencia_passos
  add column if not exists ancora_tipo text not null default 'venda',
  add column if not exists ancora_mes_dia text,
  add column if not exists ancora_campo text,
  add column if not exists uso_alvo numeric,
  add column if not exists uso_ritmo_campo text,
  add column if not exists uso_ritmo_padrao numeric,
  add column if not exists repetir_intervalo int,
  add column if not exists repetir_unidade text,
  add column if not exists repetir_max int;
alter table public.posvenda_cadencia_passos drop constraint if exists posvenda_cadencia_passos_dia_offset_check;
alter table public.posvenda_cadencia_passos
  add constraint posvenda_passo_ancora_tipo check (ancora_tipo in ('venda', 'data_fixa', 'campo_data', 'uso')),
  add constraint posvenda_passo_dia_offset check (dia_offset between -365 and 3650 and (ancora_tipo <> 'venda' or dia_offset >= 0)),
  add constraint posvenda_passo_data_fixa check (ancora_tipo <> 'data_fixa' or coalesce(ancora_mes_dia ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$', false)),
  add constraint posvenda_passo_campo check (ancora_tipo not in ('campo_data', 'uso') or coalesce(ancora_campo ~ '^[a-z][a-z0-9_]{0,62}$', false)),
  add constraint posvenda_passo_uso check (ancora_tipo <> 'uso' or coalesce(uso_alvo > 0 and (coalesce(uso_ritmo_padrao, 0) > 0 or uso_ritmo_campo is not null), false)),
  add constraint posvenda_passo_repetir check (
    (repetir_intervalo is null and repetir_unidade is null and repetir_max is null)
    or coalesce(repetir_intervalo between 1 and 3650 and repetir_unidade in ('dias', 'meses') and (repetir_max is null or repetir_max between 2 and 1000), false));

alter table public.posvenda_acompanhamentos add column if not exists ocorrencia int not null default 1;

-- ── Leituras de uso (km, horas, ciclos…) ─────────────────────────────────────────────────────────
create table if not exists public.posvenda_uso_leituras (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  negocio_id bigint not null references public.negocios(id) on delete cascade,
  campo text not null,
  valor numeric not null,
  em date not null,
  registrado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists posvenda_uso_leituras_negocio on public.posvenda_uso_leituras (negocio_id, campo, em desc);
alter table public.posvenda_uso_leituras enable row level security;
create policy posvenda_uso_leituras_leitura on public.posvenda_uso_leituras for select to authenticated
  using (empresa_id = (select get_empresa_id()));
revoke all on public.posvenda_uso_leituras from anon, authenticated;
grant select on public.posvenda_uso_leituras to authenticated;
grant all on public.posvenda_uso_leituras to service_role;

-- ── Apoio ────────────────────────────────────────────────────────────────────────────────────────
-- Valor de um campo: o do negócio vence o do cliente.
create or replace function public.posvenda_campo(p_negocio bigint, p_chave text)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select coalesce(nullif(n.dados -> p_chave, 'null'::jsonb), nullif(c.dados -> p_chave, 'null'::jsonb))
    from public.negocios n left join public.contatos c on c.id = n.contato_id where n.id = p_negocio
$$;

create or replace function public.posvenda_numero(v jsonb)
returns numeric language plpgsql immutable as $$
declare t text;
begin
  if v is null then return null; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' then
    t := regexp_replace(v #>> '{}', '[^0-9,.-]', '', 'g');
    if t ~ ',' then t := replace(replace(t, '.', ''), ',', '.');          -- 10.000,5
    elsif t ~ '^-?\d{1,3}(\.\d{3})+$' then t := replace(t, '.', '');     -- 10.000
    end if;
    return nullif(t, '')::numeric;
  end if;
  return null;
exception when others then return null;
end $$;

create or replace function public.posvenda_data(v jsonb)
returns date language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) <> 'string' then return null; end if;
  return case when (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}' then to_date(left(v #>> '{}', 10), 'YYYY-MM-DD')
              when (v #>> '{}') ~ '^\d{2}/\d{2}/\d{4}$' then to_date(v #>> '{}', 'DD/MM/YYYY') end;
exception when others then return null;
end $$;

-- O passo vale para esta venda? (condição e filtros por campo)
create or replace function public.posvenda_passo_filtra(p_negocio bigint, p_filtros jsonb)
returns boolean language plpgsql stable set search_path = public, pg_temp as $$
declare f jsonb; v jsonb; t text; alvo text; ok boolean;
begin
  if jsonb_typeof(p_filtros -> 'campos') <> 'array' then return true; end if;
  for f in select x from jsonb_array_elements(p_filtros -> 'campos') x loop
    v := public.posvenda_campo(p_negocio, f ->> 'chave');
    t := lower(coalesce(v #>> '{}', ''));
    alvo := lower(coalesce(f ->> 'valor', ''));
    ok := case f ->> 'op'
      when 'preenchido' then t <> ''
      when 'igual' then t = alvo
      when 'diferente' then t <> alvo
      when 'contem' then position(alvo in t) > 0
      when 'maior' then public.posvenda_numero(v) > public.posvenda_numero(to_jsonb(f ->> 'valor'))
      when 'menor' then public.posvenda_numero(v) < public.posvenda_numero(to_jsonb(f ->> 'valor'))
      else true end;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  return true;
end $$;

-- Soma `n` intervalos de repetição a uma data.
create or replace function public.posvenda_somar_repeticao(p_dia date, p_intervalo int, p_unidade text, p_n int)
returns date language sql immutable as $$
  select case when p_n <= 0 or p_intervalo is null then p_dia
              when p_unidade = 'meses' then cast(p_dia + make_interval(months => p_intervalo * p_n) as date)  -- data pura, sem fuso
              else p_dia + p_intervalo * p_n end
$$;

-- A data (dia local) da ocorrência `p_ocorrencia` de um passo para uma venda. Nulo = não dá para calcular (sem o campo).
create or replace function public.posvenda_data_do_passo(p_negocio bigint, p_passo bigint, p_ocorrencia int default 1)
returns date language plpgsql stable set search_path = public, pg_temp as $$
declare
  n public.negocios; p public.posvenda_cadencia_passos; v_base date; v_dia date; v_mes int; v_dd int; v_ano int;
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
    loop  -- a próxima ocorrência do dia do ano DEPOIS da venda (29/02 cai no último dia de fevereiro)
      v_dia := make_date(v_ano, v_mes, 1) + (least(v_dd, extract(day from (make_date(v_ano, v_mes, 1) + interval '1 month - 1 day'))::int) - 1);
      exit when v_dia > v_base;
      v_ano := v_ano + 1;
    end loop;
    return public.posvenda_somar_repeticao(v_dia + p.dia_offset, coalesce(p.repetir_intervalo, 12),
                                           coalesce(p.repetir_unidade, 'meses'), k - 1);

  elsif p.ancora_tipo = 'campo_data' then
    v_dia := public.posvenda_data(public.posvenda_campo(n.id, p.ancora_campo));
    if v_dia is null then return null; end if;
    return public.posvenda_somar_repeticao(v_dia + p.dia_offset, p.repetir_intervalo, p.repetir_unidade, k - 1);

  elsif p.ancora_tipo = 'uso' then
    v_ini := public.posvenda_numero(public.posvenda_campo(n.id, p.ancora_campo));
    v_ritmo := coalesce(case when p.uso_ritmo_campo is not null then public.posvenda_numero(public.posvenda_campo(n.id, p.uso_ritmo_campo)) end,
                        p.uso_ritmo_padrao);
    if v_ini is null then return null; end if;
    v_ref_em := v_base; v_ref_valor := v_ini;
    -- a leitura mais recente depois da venda recalcula o ritmo (uso real por dia)
    select valor, em into v_le from public.posvenda_uso_leituras
     where negocio_id = n.id and campo = p.ancora_campo and em > v_base order by em desc, id desc limit 1;
    if v_le.em is not null then
      if v_le.valor > v_ini then v_ritmo := (v_le.valor - v_ini) / (v_le.em - v_base); end if;
      v_ref_em := v_le.em; v_ref_valor := v_le.valor;
    end if;
    if v_ritmo is null or v_ritmo <= 0 then return null; end if;
    v_alvo := v_ini + p.uso_alvo * k;  -- a cada `uso_alvo` (a 1ª ocorrência é o 1º alvo)
    return v_ref_em + greatest(ceil((v_alvo - v_ref_valor) / v_ritmo)::int, 0) + p.dia_offset;
  end if;
  return null;
end $$;

-- ── posvenda_iniciar_jornadas: data pela âncora, filtros por campo, ocorrência ─────────────────────
create or replace function public.posvenda_iniciar_jornadas(p_negocio bigint)
returns bigint language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios;
  c public.posvenda_cadencias;
  p public.posvenda_cadencia_passos;
  v_cat bigint; v_cond text; v_jor bigint;
  v_fuso text; v_hoje date; v_dia date; v_k int;
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

  -- recompra da mesma categoria: cancela os passos pendentes DO PRODUTO das jornadas anteriores do cliente
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

  for p in select * from public.posvenda_cadencia_passos where cadencia_id = c.id and ativo order by ordem loop
    continue when p.filtros ? 'condicao' and (p.filtros ->> 'condicao') is distinct from v_cond;
    continue when not public.posvenda_passo_filtra(n.id, p.filtros);
    -- a ocorrência que vale: a primeira; se repete e a data já passou, a primeira de hoje em diante
    v_k := 1;
    v_dia := public.posvenda_data_do_passo(n.id, p.id, 1);
    continue when v_dia is null;
    while v_dia < v_hoje and p.repetir_intervalo is not null and (p.repetir_max is null or v_k < p.repetir_max) and v_k < 1000 loop
      v_k := v_k + 1;
      v_dia := public.posvenda_data_do_passo(n.id, p.id, v_k);
      exit when v_dia is null;
    end loop;
    continue when v_dia is null or v_dia < v_hoje;  -- passo que já passou não nasce

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
                                                   responsavel_id, origem_responsavel, previsto_para, status, motivo, juntado_a, ocorrencia)
      values (n.empresa_id, n.filial_id, v_jor, p.id, n.contato_id, n.id,
              v_igual.responsavel_id, v_igual.origem_responsavel, v_igual.previsto_para, 'juntado', 'mesmo_dia', v_igual.id, v_k);
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
                                                 responsavel_id, origem_responsavel, previsto_para, ocorrencia)
    values (n.empresa_id, n.filial_id, v_jor, p.id, n.contato_id, n.id, r.responsavel_id, r.origem,
            (r.dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, r.dia, coalesce(p.hora_sugerida, time '10:00'))) at time zone v_fuso, v_k);
  end loop;
  return v_jor;
end $$;

-- ── posvenda_reancorar_jornada: a mesma data pela âncora ─────────────────────────────────────────
create or replace function public.posvenda_reancorar_jornada(p_negocio bigint)
returns int language plpgsql volatile set search_path = public, pg_temp as $$
declare
  n public.negocios;
  v_fuso text; v_hoje date; v_dia date; v int := 0;
  a record;
begin
  select * into n from public.negocios where id = p_negocio;
  if not found or n.status <> 'ganho' or n.ganho_em is null then return 0; end if;
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  update public.posvenda_jornadas set ancora_em = n.ganho_em where negocio_id = p_negocio and status in ('ativa', 'pausada');
  for a in
    select x.id, x.previsto_para, x.passo_id, x.ocorrencia from public.posvenda_acompanhamentos x
      join public.posvenda_jornadas j on j.id = x.jornada_id
     where j.negocio_id = p_negocio and j.status in ('ativa', 'pausada') and x.status in ('pendente', 'juntado')
  loop
    v_dia := public.posvenda_data_do_passo(p_negocio, a.passo_id, a.ocorrencia);
    if v_dia is null or v_dia < v_hoje then
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

-- ── Repetição: a ocorrência saiu da fila → nasce a próxima ──────────────────────────────────────
create or replace function public.posvenda_repetir_passo()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.posvenda_cadencia_passos; n public.negocios; j public.posvenda_jornadas; v_dia date; v_hoje date; r record; v_fuso text;
begin
  if old.status <> 'pendente' or new.status not in ('feito', 'sem_resposta', 'pulado', 'perdido') then return null; end if;
  select * into p from public.posvenda_cadencia_passos where id = new.passo_id;
  if p.repetir_intervalo is null or not p.ativo or (p.repetir_max is not null and new.ocorrencia >= p.repetir_max) then return null; end if;
  select * into j from public.posvenda_jornadas where id = new.jornada_id;
  if j.status <> 'ativa' or new.negocio_id is null then return null; end if;
  select * into n from public.negocios where id = new.negocio_id;
  if n.status <> 'ganho' then return null; end if;
  -- não duplica: a próxima ocorrência já existe
  if exists (select 1 from public.posvenda_acompanhamentos where jornada_id = new.jornada_id and passo_id = new.passo_id
              and ocorrencia = new.ocorrencia + 1) then return null; end if;

  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_dia := public.posvenda_data_do_passo(n.id, p.id, new.ocorrencia + 1);
  if v_dia is null then return null; end if;
  v_dia := greatest(v_dia, v_hoje + 1);
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  if p.responsavel like 'usuario:%' then
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
drop trigger if exists posvenda_acompanhamentos_repetir on public.posvenda_acompanhamentos;
create trigger posvenda_acompanhamentos_repetir after update of status on public.posvenda_acompanhamentos
  for each row execute function public.posvenda_repetir_passo();

-- ── Uso informado: grava a leitura e recalcula os passos de uso pendentes ───────────────────────
create or replace function public.posvenda_uso_registrar(p_negocio bigint, p_campo text, p_valor numeric, p_em date default null)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n public.negocios; v_em date; a record; v_dia date; v_fuso text; v int := 0; v_hoje date;
begin
  select * into n from public.negocios where id = p_negocio;
  if n.id is null then raise exception using errcode = 'P0002', message = 'NAO_ENCONTRADO'; end if;
  perform public.posvenda_exigir_sessao(n.empresa_id);
  if n.responsavel_id is distinct from auth.uid() and not public.is_empresa_admin(n.empresa_id)
     and not exists (select 1 from public.posvenda_acompanhamentos x where x.negocio_id = n.id and x.responsavel_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'SEM_PERMISSAO: só quem cuida do cliente, o dono ou um administrador informa o uso.';
  end if;
  if p_valor is null or p_valor < 0 or coalesce(p_campo, '') !~ '^[a-z0-9_]{1,63}$' then
    raise exception using errcode = 'P0001', message = 'VALOR_INVALIDO';
  end if;
  v_hoje := public.posvenda_dia_local(n.empresa_id, now());
  v_em := least(coalesce(p_em, v_hoje), v_hoje);
  insert into public.posvenda_uso_leituras (empresa_id, negocio_id, campo, valor, em, registrado_por)
  values (n.empresa_id, n.id, p_campo, p_valor, v_em, auth.uid());
  v_fuso := coalesce(public.empresa_fuso(n.empresa_id), 'America/Sao_Paulo');
  for a in
    select x.id, x.passo_id, x.ocorrencia, x.previsto_para from public.posvenda_acompanhamentos x
      join public.posvenda_cadencia_passos pp on pp.id = x.passo_id
      join public.posvenda_jornadas j on j.id = x.jornada_id
     where x.negocio_id = n.id and x.status = 'pendente' and j.status = 'ativa' and pp.ancora_tipo = 'uso' and pp.ancora_campo = p_campo
  loop
    v_dia := public.posvenda_data_do_passo(n.id, a.passo_id, a.ocorrencia);
    continue when v_dia is null;
    v_dia := public.core_dia_aberto(n.empresa_id, n.filial_id, greatest(v_dia, v_hoje));
    update public.posvenda_acompanhamentos
       set previsto_para = (v_dia + public.core_hora_no_expediente(n.empresa_id, n.filial_id, v_dia, (a.previsto_para at time zone v_fuso)::time)) at time zone v_fuso
     where id = a.id;
    v := v + 1;
  end loop;
  return jsonb_build_object('passos_recalculados', v);
end $$;

do $$
declare f text;
begin
  foreach f in array array['posvenda_campo(bigint,text)', 'posvenda_numero(jsonb)', 'posvenda_data(jsonb)',
                           'posvenda_passo_filtra(bigint,jsonb)', 'posvenda_somar_repeticao(date,integer,text,integer)',
                           'posvenda_data_do_passo(bigint,bigint,integer)', 'posvenda_repetir_passo()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke all on function public.posvenda_uso_registrar(bigint,text,numeric,date) from public, anon';
  execute 'grant execute on function public.posvenda_uso_registrar(bigint,text,numeric,date) to authenticated, service_role';
end $$;
