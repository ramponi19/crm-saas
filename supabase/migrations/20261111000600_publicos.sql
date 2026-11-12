-- MÓDULO PÚBLICOS (pedido do Lucas, 12/11/2026). Uma migração só.
--
-- Um público é uma lista salva POR REGRA (o mesmo filtro da Transmissão: funil, etapa, situação,
-- origem, última mensagem, etiquetas), de UMA loja, que se atualiza sozinha. Serve à Transmissão
-- ("usar público salvo") e ao Automatize (gatilho "entrou no público"). Decisões do Lucas (12/11):
--   - público por loja (como a Transmissão); só "entrou no público" (sem "saiu");
--   - criar ou editar o filtro recalcula NA HORA e não dispara nada: quem está no público naquele
--     momento é o ponto de partida (o mesmo ao ligar o primeiro gatilho de um público);
--   - a rodada de hora em hora (job `automacoes-hora`, sem job novo) recalcula SÓ os públicos com
--     gatilho ligado ou com transmissão agendada; o resto mostra "atualizado há X".
--
-- 1. publicos: loja, nome, filtro, a contagem e de quando ela é (total, calculado_em). A loja lê;
--    dono/admin grava (a mesma RLS de transmissoes).
-- 2. publicos_membros: quem está no público e desde quando. Só a chave de serviço mexe (a tela usa
--    publicos.total). É o que permite saber quem ENTROU desde a última conta.
-- 3. publicos_resolver: a regra resolvida, UMA para os dois — transmissao_publico passa a chamá-la.
--    Corrige um achado de 11/11: a lista não descartava negócio inativo (negocios.ativo = false,
--    158 em produção em 12/11); agora só negócio ativo entra.
-- 4. publicos_recalcular (serviço): refaz os membros e a contagem; devolve quem entrou se pedido.
-- 5. publicos_previa (sessão, dono/admin): a contagem do formulário, sem gravar.
-- 6. publicos_rodada (serviço): os públicos que a rodada de hora em hora recalcula.
-- 7. automacoes: gatilho 'entrou_no_publico' + coluna publico_id.
-- 8. transmissoes.publico_id + transmissao_remontar (serviço): a agendada refaz a lista pelo
--    público na hora de começar (e guarda o filtro daquele momento na transmissão).
--
-- Custo: duas tabelas novas e vazias; uma coluna nula em automacoes e transmissoes (sem reescrever).
-- Volta: supabase/scripts/volta/volta-publicos.sql (voltar o app antes).

-- 1 ─────────────────────────────────────────────────────────────────────────────
create table public.publicos (
  id            bigint generated always as identity primary key,
  empresa_id    bigint not null references public.empresas(id) on delete cascade,
  -- Loja nula só para empresa de uma loja (quem grava confere). Loja apagada leva o público:
  -- público sem loja numa rede resolveria a rede inteira.
  filial_id     bigint references public.filiais(id) on delete cascade,
  nome          text not null check (length(btrim(nome)) between 1 and 80),
  filtro        jsonb not null default '{}'::jsonb check (jsonb_typeof(filtro) = 'object'),
  total         integer not null default 0,
  calculado_em  timestamptz,
  criado_por    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.publicos is
  'Módulo Públicos: lista salva por regra (filtro da Transmissão) de uma loja. total/calculado_em = a última conta.';
create unique index publicos_nome_uidx on public.publicos (empresa_id, coalesce(filial_id, 0), lower(btrim(nome)));
create index publicos_filial_idx on public.publicos (filial_id) where filial_id is not null;

create trigger publicos_updated_at before update on public.publicos
  for each row execute function update_updated_at();

alter table public.publicos enable row level security;
create policy publicos_leitura on public.publicos for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
create policy publicos_escrita on public.publicos for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
revoke all on public.publicos from anon, authenticated;
grant select, insert, update, delete on public.publicos to authenticated;
grant all on public.publicos to service_role;

-- 2 ─────────────────────────────────────────────────────────────────────────────
create table public.publicos_membros (
  publico_id  bigint not null references public.publicos(id) on delete cascade,
  contato_id  bigint not null references public.contatos(id) on delete cascade,
  -- O negócio que casou com a regra (o mais recente): é nele que a automação age.
  negocio_id  bigint references public.negocios(id) on delete set null,
  empresa_id  bigint not null references public.empresas(id) on delete cascade,
  entrou_em   timestamptz not null default now(),
  primary key (publico_id, contato_id)
);
comment on table public.publicos_membros is
  'Módulo Públicos: quem está em cada público e desde quando. Só a chave de serviço (publicos_recalcular).';
create index publicos_membros_contato_idx on public.publicos_membros (contato_id);
create index publicos_membros_negocio_idx on public.publicos_membros (negocio_id) where negocio_id is not null;
create index publicos_membros_empresa_idx on public.publicos_membros (empresa_id);

alter table public.publicos_membros enable row level security;
revoke all on public.publicos_membros from anon, authenticated;
grant all on public.publicos_membros to service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────────
-- A regra resolvida: um contato por linha, com o negócio ATIVO mais recente que casa. Chaves do
-- filtro (todas opcionais): funil_id, etapa_ids, situacoes ('aberto'|'ganho'|'perdido'), origens
-- (minúsculas, contra contatos.origem), sem_mensagem_ha_dias (última mensagem da conversa na loja
-- mais antiga que N dias, ou nunca houve), com_mensagem_nos_dias (a última é dos últimos N dias),
-- etiquetas_com (tem alguma), etiquetas_sem (não tem nenhuma). Loja nula = a empresa inteira (só
-- empresa de uma loja chega aqui assim: quem chama confere).
create or replace function public.publicos_resolver(p_empresa bigint, p_filial bigint, p_filtro jsonb)
returns table (contato_id bigint, negocio_id bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  f         jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_funil   bigint := nullif(f ->> 'funil_id', '')::bigint;
  v_etapas  bigint[] := case when jsonb_typeof(f -> 'etapa_ids') = 'array' and jsonb_array_length(f -> 'etapa_ids') > 0
                         then array(select jsonb_array_elements_text(f -> 'etapa_ids')::bigint) end;
  v_sit     text[] := case when jsonb_typeof(f -> 'situacoes') = 'array' and jsonb_array_length(f -> 'situacoes') > 0
                         then array(select jsonb_array_elements_text(f -> 'situacoes')) end;
  v_orig    text[] := case when jsonb_typeof(f -> 'origens') = 'array' and jsonb_array_length(f -> 'origens') > 0
                         then array(select lower(jsonb_array_elements_text(f -> 'origens'))) end;
  v_etq_com bigint[] := case when jsonb_typeof(f -> 'etiquetas_com') = 'array' and jsonb_array_length(f -> 'etiquetas_com') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_com')::bigint) end;
  v_etq_sem bigint[] := case when jsonb_typeof(f -> 'etiquetas_sem') = 'array' and jsonb_array_length(f -> 'etiquetas_sem') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_sem')::bigint) end;
  v_sem     int := nullif(f ->> 'sem_mensagem_ha_dias', '')::int;
  v_com     int := nullif(f ->> 'com_mensagem_nos_dias', '')::int;
begin
  return query
  with negs as (
    select distinct on (n.contato_id) n.contato_id, n.id as negocio_id
      from negocios n
      join contatos c on c.id = n.contato_id
     where n.empresa_id = p_empresa
       and n.ativo
       and (p_filial is null or n.filial_id = p_filial)
       and (v_funil is null or n.funil_id = v_funil)
       and (v_etapas is null or n.etapa_id = any (v_etapas))
       and (v_sit is null or n.status = any (v_sit))
       and (v_orig is null or lower(coalesce(c.origem, '')) = any (v_orig))
       and (v_etq_com is null or c.etiqueta_ids && v_etq_com)
       and (v_etq_sem is null or not (c.etiqueta_ids && v_etq_sem))
     order by n.contato_id, n.created_at desc, n.id desc
  ), com_msg as (
    select x.contato_id, x.negocio_id,
           (select max(cv.ultima_mensagem_at) from conversas cv
             where cv.empresa_id = p_empresa and cv.contato_id = x.contato_id
               and (p_filial is null or cv.filial_id = p_filial or cv.filial_id is null)) as ultima
      from negs x
  )
  select m.contato_id, m.negocio_id
    from com_msg m
   where (v_sem is null or m.ultima is null or m.ultima < now() - make_interval(days => v_sem))
     and (v_com is null or (m.ultima is not null and m.ultima >= now() - make_interval(days => v_com)));
end $$;
revoke all on function public.publicos_resolver(bigint, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.publicos_resolver(bigint, bigint, jsonb) to service_role;

-- A Transmissão passa a usar a mesma regra (corpo anterior: 20261111000500_etiquetas).
create or replace function public.transmissao_publico(p_empresa bigint, p_filial bigint, p_filtro jsonb, p_modelo bigint)
returns table (contato_id bigint, negocio_id bigint, nome text, telefone text, fora text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.contato_id, r.negocio_id, c.nome,
         nullif(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g'), ''),
         case
           when c.opt_out_em is not null then 'opt_out'
           when c.ativo = false then 'bloqueado'
           when length(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g')) < 10 then 'sem_telefone'
           when p_modelo is not null and (
                  exists (select 1 from transmissao_envios e
                           where e.contato_id = r.contato_id and e.modelo_id = p_modelo and e.status = 'enviada'
                             and e.enviada_em > now() - interval '7 days')
               or exists (select 1 from automacao_execucoes a
                           where a.contato_id = r.contato_id and a.modelo_id = p_modelo and a.acao = 'enviar_modelo'
                             and a.status = 'executada' and a.executada_em > now() - interval '7 days'))
             then 'modelo_7_dias'
         end
    from publicos_resolver(p_empresa, p_filial, p_filtro) r
    join contatos c on c.id = r.contato_id
$$;
revoke all on function public.transmissao_publico(bigint, bigint, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.transmissao_publico(bigint, bigint, jsonb, bigint) to service_role;

-- 4 ─────────────────────────────────────────────────────────────────────────────
-- Refaz os membros e a contagem de UM público. p_disparar = true devolve quem entrou desde a última
-- conta (a rodada de hora em hora e o "atualizar agora"); false só fotografa (criar, editar o
-- filtro, ligar o primeiro gatilho): ninguém "entra". O FOR UPDATE serializa duas contas do mesmo
-- público (a segunda espera e já não vê como novo quem a primeira gravou).
create or replace function public.publicos_recalcular(p_publico bigint, p_disparar boolean default true)
returns table (contato_id bigint, negocio_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  p    publicos%rowtype;
  v_c  bigint[];
  v_n  bigint[];
begin
  select * into p from publicos where id = p_publico for update;
  if not found then return; end if;
  select coalesce(array_agg(r.contato_id), '{}'), coalesce(array_agg(r.negocio_id), '{}')
    into v_c, v_n
    from publicos_resolver(p.empresa_id, p.filial_id, p.filtro) r;

  delete from publicos_membros m where m.publico_id = p.id and not (m.contato_id = any (v_c));
  update publicos_membros m set negocio_id = x.n
    from unnest(v_c, v_n) as x(c, n)
   where m.publico_id = p.id and m.contato_id = x.c and m.negocio_id is distinct from x.n;

  return query
  with novos as (
    insert into publicos_membros (publico_id, contato_id, negocio_id, empresa_id)
    select p.id, x.c, x.n, p.empresa_id from unnest(v_c, v_n) as x(c, n)
    on conflict on constraint publicos_membros_pkey do nothing
    returning publicos_membros.contato_id, publicos_membros.negocio_id
  )
  select novos.contato_id, novos.negocio_id from novos where p_disparar;

  update publicos set total = cardinality(v_c), calculado_em = now() where id = p.id;
end $$;
revoke all on function public.publicos_recalcular(bigint, boolean) from public, anon, authenticated;
grant execute on function public.publicos_recalcular(bigint, boolean) to service_role;

-- 5 ─────────────────────────────────────────────────────────────────────────────
-- A contagem do formulário (sem gravar): quantos casam e 5 nomes de exemplo. Só dono/admin, loja
-- da empresa e visível para quem pede (nula só em empresa de uma loja).
create or replace function public.publicos_previa(p_filial bigint, p_filtro jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp bigint := get_empresa_id();
  v jsonb;
begin
  if v_emp is null or not is_empresa_admin(v_emp) then
    raise exception 'só dono ou admin monta público' using errcode = '42501';
  end if;
  if not (case
            when p_filial is null then (select count(*) from filiais where empresa_id = v_emp and ativo) < 2
            else exists (select 1 from filiais where id = p_filial and empresa_id = v_emp and ativo)
                 and filiais_visiveis() @> array[p_filial]
          end) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'total', count(*),
           'amostra', coalesce((select jsonb_agg(a.nome) from (
                         select c.nome from publicos_resolver(v_emp, p_filial, p_filtro) q
                           join contatos c on c.id = q.contato_id
                          order by c.nome nulls last limit 5) a), '[]'::jsonb))
    into v
    from publicos_resolver(v_emp, p_filial, p_filtro) r;
  return v;
end $$;
revoke all on function public.publicos_previa(bigint, jsonb) from public, anon;
grant execute on function public.publicos_previa(bigint, jsonb) to authenticated, service_role;

-- 7 ─────────────────────────────────────────────────────────────────────────────
alter table public.automacoes drop constraint if exists automacoes_gatilho_check;
alter table public.automacoes add constraint automacoes_gatilho_check
  check (gatilho = any (array['entrou_na_etapa', 'parado_x_horas', 'recebeu_etiqueta', 'entrou_no_publico']));
-- Como a etiqueta: apagar o público apaga as automações dele (a tela diz quantas antes de apagar).
alter table public.automacoes add column publico_id bigint references public.publicos(id) on delete cascade;
alter table public.automacoes add constraint automacoes_publico_check
  check (gatilho <> 'entrou_no_publico' or publico_id is not null);
create index automacoes_publico_idx on public.automacoes (publico_id) where publico_id is not null;

-- 8 ─────────────────────────────────────────────────────────────────────────────
-- A transmissão guarda de que público veio (o filtro dela é a cópia do daquele momento). Público
-- apagado: a transmissão fica, com o filtro que usou.
alter table public.transmissoes add column publico_id bigint references public.publicos(id) on delete set null;
create index transmissoes_publico_idx on public.transmissoes (publico_id) where publico_id is not null;

-- Agendada que veio de público: na hora de começar, a lista é refeita pelo público como ele está
-- (a montada no agendamento era a de então). Só enquanto 'agendada' e sem nada enviado; quem fica
-- fora entra 'pulada' com o motivo, como em transmissao_montar. Devolve quantos ficaram na lista.
create or replace function public.transmissao_remontar(p_transmissao bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t  transmissoes%rowtype;
  v_filtro jsonb;
  v_n int;
begin
  select * into t from transmissoes where id = p_transmissao for update;
  if not found or t.status <> 'agendada' or t.publico_id is null then return null; end if;
  if exists (select 1 from transmissao_envios where transmissao_id = t.id and status not in ('pendente', 'pulada')) then
    return null;
  end if;
  select filtro into v_filtro from publicos where id = t.publico_id and empresa_id = t.empresa_id
     and filial_id is not distinct from t.filial_id;
  if v_filtro is null then return null; end if;

  delete from transmissao_envios where transmissao_id = t.id;
  insert into transmissao_envios (empresa_id, filial_id, transmissao_id, contato_id, negocio_id, modelo_id, telefone, status, motivo)
  select t.empresa_id, t.filial_id, t.id, p.contato_id, p.negocio_id, t.modelo_id, p.telefone,
         case when p.fora is null then 'pendente' else 'pulada' end,
         case p.fora when 'opt_out' then 'contato pediu para não receber (opt-out)'
                     when 'bloqueado' then 'contato bloqueado'
                     when 'sem_telefone' then 'contato sem telefone'
                     when 'modelo_7_dias' then 'este contato já recebeu este modelo nos últimos 7 dias' end
    from transmissao_publico(t.empresa_id, t.filial_id, v_filtro, t.modelo_id) p
  on conflict (transmissao_id, contato_id) do nothing;
  get diagnostics v_n = row_count;
  update transmissoes set filtro = v_filtro, total = v_n where id = t.id;
  return v_n;
end $$;
revoke all on function public.transmissao_remontar(bigint) from public, anon, authenticated;
grant execute on function public.transmissao_remontar(bigint) to service_role;

-- 6 ─────────────────────────────────────────────────────────────────────────────
-- (Depois do 7 e do 8: lê as colunas publico_id.) O que a rodada de hora em hora recalcula:
-- público com automação "entrou no público" LIGADA ou com transmissão AGENDADA. O resto fica com
-- a última conta (a tela diz de quando é).
create or replace function public.publicos_rodada()
returns table (publico_id bigint, empresa_id bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.empresa_id
    from publicos p
   where exists (select 1 from automacoes a
                  where a.publico_id = p.id and a.gatilho = 'entrou_no_publico' and a.ativo)
      or exists (select 1 from transmissoes t
                  where t.publico_id = p.id and t.status = 'agendada')
   order by p.id
$$;
revoke all on function public.publicos_rodada() from public, anon, authenticated;
grant execute on function public.publicos_rodada() to service_role;
