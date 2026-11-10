-- MÓDULO TRANSMISSÃO (pedido do Lucas, 10/11/2026). Uma migração só.
--
-- Disparar UM modelo aprovado da Meta para uma lista de contatos de UMA loja, pelo
-- WhatsApp da loja. A lista nasce de um filtro (funil, etapa, origem, situação, última
-- mensagem há X dias) — o embrião do módulo Públicos: `transmissao_publico` é a função
-- que resolve o filtro, e é ela que Públicos vai herdar.
--
-- As travas são as do Automatize (04/11/2026), repetidas onde o envio acontece:
--   - só modelo APROVADO (aqui, no servidor e de novo na Edge);
--   - opt-out e bloqueado (contatos.opt_out_em / contatos.ativo = false) ficam fora;
--   - horário de atendimento da loja e teto por hora (configurável por empresa, chave
--     `transmissao` em configuracoes_sistema): quem não cabe espera, nada é descartado;
--   - 1 envio do MESMO modelo por contato a cada 7 dias, contando o Automatize junto;
--   - pausar: a transmissão sai de 'enviando' e a Edge recusa o que estiver em voo.
--
-- 1. transmissoes: a transmissão (loja, modelo, filtro, situação).
-- 2. transmissao_envios: um por contato — a fila e o acompanhamento. O "entregue" e o
--    "lida" vêm de mensagens.status_entrega (o webhook de status da Meta já grava lá);
--    o "respondeu" é do gatilho do item 6.
-- 3. transmissao_publico: o filtro resolvido (interno, sem grant para a sessão).
-- 4. transmissao_previa / transmissao_montar: a prévia da contagem e a lista congelada
--    no disparo. SECURITY DEFINER, só dono/admin (conferido dentro).
-- 5. transmissao_reservar: o lote do cron, FOR UPDATE SKIP LOCKED (só service_role).
-- 6. Gatilho em mensagens: a resposta de quem recebeu marca o envio e põe a transmissão
--    no card do contato (negocios.dados._transmissao) + negocio_historico.
--
-- Sem job novo no pg_cron: a fila roda no job `automacoes-hora` que já existe (a rota
-- /api/cron/automacoes processa também as transmissões). Volta:
-- supabase/scripts/volta/volta-transmissao.sql.

-- 1 ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.transmissoes (
  id             bigint generated always as identity primary key,
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  filial_id      bigint references public.filiais(id) on delete set null,
  canal_tipo     text not null default 'whatsapp' check (canal_tipo in ('whatsapp')),
  nome           text not null check (length(btrim(nome)) between 1 and 120),
  modelo_id      bigint not null references public.modelos_mensagem(id) on delete restrict,
  parametros     jsonb not null default '[]'::jsonb check (jsonb_typeof(parametros) = 'array'),
  filtro         jsonb not null default '{}'::jsonb check (jsonb_typeof(filtro) = 'object'),
  status         text not null default 'rascunho'
                 check (status in ('rascunho', 'agendada', 'enviando', 'pausada', 'concluida', 'encerrada')),
  agendada_para  timestamptz,
  iniciada_em    timestamptz,
  pausada_em     timestamptz,
  concluida_em   timestamptz,
  total          integer not null default 0,
  criado_por     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.transmissoes is 'Módulo Transmissão: um modelo aprovado para a lista de uma loja. Dono/admin grava; a loja lê.';
create index if not exists transmissoes_empresa_idx on public.transmissoes (empresa_id, created_at desc);
create index if not exists transmissoes_fila_idx on public.transmissoes (status) where status in ('agendada', 'enviando');

drop trigger if exists transmissoes_updated_at on public.transmissoes;
create trigger transmissoes_updated_at before update on public.transmissoes
  for each row execute function update_updated_at();

alter table public.transmissoes enable row level security;
drop policy if exists transmissoes_leitura on public.transmissoes;
drop policy if exists transmissoes_escrita on public.transmissoes;
create policy transmissoes_leitura on public.transmissoes for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
create policy transmissoes_escrita on public.transmissoes for all to authenticated
  using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))
  with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id));
revoke all on public.transmissoes from anon, authenticated;
grant select, insert, update, delete on public.transmissoes to authenticated;
grant all on public.transmissoes to service_role;

-- 2 ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.transmissao_envios (
  id                   bigint generated always as identity primary key,
  empresa_id           bigint not null references public.empresas(id) on delete cascade,
  filial_id            bigint references public.filiais(id) on delete set null,
  transmissao_id       bigint not null references public.transmissoes(id) on delete cascade,
  contato_id           bigint not null references public.contatos(id) on delete cascade,
  negocio_id           bigint references public.negocios(id) on delete set null,
  modelo_id            bigint references public.modelos_mensagem(id) on delete set null,
  telefone             text,
  status               text not null default 'pendente'
                       check (status in ('pendente', 'enviando', 'enviada', 'falhou', 'pulada')),
  tentativas           integer not null default 0,
  reservada_em         timestamptz,
  enviada_em           timestamptz,
  motivo               text,
  mensagem_id          bigint,
  respondida_em        timestamptz,
  resposta_mensagem_id bigint,
  created_at           timestamptz not null default now(),
  unique (transmissao_id, contato_id)
);
comment on table public.transmissao_envios is 'Módulo Transmissão: um envio por contato (fila + acompanhamento). Só service_role grava.';
create index if not exists transmissao_envios_fila_idx on public.transmissao_envios (transmissao_id, status, id);
create index if not exists transmissao_envios_teto_idx on public.transmissao_envios (empresa_id, enviada_em) where status = 'enviada';
create index if not exists transmissao_envios_modelo_idx on public.transmissao_envios (contato_id, modelo_id, enviada_em) where status = 'enviada';
create index if not exists transmissao_envios_resposta_idx on public.transmissao_envios (contato_id, enviada_em) where status = 'enviada' and respondida_em is null;
create index if not exists transmissao_envios_mensagem_idx on public.transmissao_envios (mensagem_id) where mensagem_id is not null;
create index if not exists transmissao_envios_negocio_idx on public.transmissao_envios (negocio_id);

alter table public.transmissao_envios enable row level security;
drop policy if exists transmissao_envios_leitura on public.transmissao_envios;
create policy transmissao_envios_leitura on public.transmissao_envios for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
revoke all on public.transmissao_envios from anon, authenticated;
grant select on public.transmissao_envios to authenticated;
grant all on public.transmissao_envios to service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────────
-- O filtro resolvido: um contato por linha (o negócio mais recente que casa), com o
-- motivo de ficar fora (nulo = apto). Chaves do filtro (todas opcionais):
--   funil_id (número), etapa_ids (números), situacoes ('aberto'|'ganho'|'perdido'),
--   origens (texto, comparado em minúsculas com contatos.origem),
--   sem_mensagem_ha_dias (a última mensagem da conversa na loja é MAIS antiga que N
--   dias, ou nunca houve), com_mensagem_nos_dias (a última é dos últimos N dias).
-- Loja nula só vale para empresa de uma loja (quem chama confere).
create or replace function public.transmissao_publico(p_empresa bigint, p_filial bigint, p_filtro jsonb, p_modelo bigint)
returns table (contato_id bigint, negocio_id bigint, nome text, telefone text, fora text)
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
  v_sem     int := nullif(f ->> 'sem_mensagem_ha_dias', '')::int;
  v_com     int := nullif(f ->> 'com_mensagem_nos_dias', '')::int;
begin
  return query
  with negs as (
    select distinct on (n.contato_id) n.contato_id, n.id as negocio_id
      from negocios n
      join contatos c on c.id = n.contato_id
     where n.empresa_id = p_empresa
       and (p_filial is null or n.filial_id = p_filial)
       and (v_funil is null or n.funil_id = v_funil)
       and (v_etapas is null or n.etapa_id = any (v_etapas))
       and (v_sit is null or n.status = any (v_sit))
       and (v_orig is null or lower(coalesce(c.origem, '')) = any (v_orig))
     order by n.contato_id, n.created_at desc, n.id desc
  ), com_msg as (
    select x.*, (select max(cv.ultima_mensagem_at) from conversas cv
                  where cv.empresa_id = p_empresa and cv.contato_id = x.contato_id
                    and (p_filial is null or cv.filial_id = p_filial or cv.filial_id is null)) as ultima
      from negs x
  )
  select m.contato_id, m.negocio_id, c.nome,
         nullif(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g'), ''),
         case
           when c.opt_out_em is not null then 'opt_out'
           when c.ativo = false then 'bloqueado'
           when length(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g')) < 10 then 'sem_telefone'
           when p_modelo is not null and (
                  exists (select 1 from transmissao_envios e
                           where e.contato_id = m.contato_id and e.modelo_id = p_modelo and e.status = 'enviada'
                             and e.enviada_em > now() - interval '7 days')
               or exists (select 1 from automacao_execucoes a
                           where a.contato_id = m.contato_id and a.modelo_id = p_modelo and a.acao = 'enviar_modelo'
                             and a.status = 'executada' and a.executada_em > now() - interval '7 days'))
             then 'modelo_7_dias'
         end
    from com_msg m
    join contatos c on c.id = m.contato_id
   where (v_sem is null or m.ultima is null or m.ultima < now() - make_interval(days => v_sem))
     and (v_com is null or (m.ultima is not null and m.ultima >= now() - make_interval(days => v_com)));
end $$;
revoke all on function public.transmissao_publico(bigint, bigint, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.transmissao_publico(bigint, bigint, jsonb, bigint) to service_role;

-- A loja pedida é desta empresa e quem pede enxerga ela? Loja nula só em empresa de uma loja.
create or replace function public.transmissao_loja_ok(p_empresa bigint, p_filial bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_filial is null then (select count(*) from filiais where empresa_id = p_empresa and ativo) < 2
    else exists (select 1 from filiais where id = p_filial and empresa_id = p_empresa and ativo)
         and filiais_visiveis() @> array[p_filial]
  end;
$$;
revoke all on function public.transmissao_loja_ok(bigint, bigint) from public, anon, authenticated;
grant execute on function public.transmissao_loja_ok(bigint, bigint) to service_role;

-- 4 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transmissao_previa(p_filial bigint, p_filtro jsonb, p_modelo bigint default null)
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
    raise exception 'só dono ou admin monta transmissão' using errcode = '42501';
  end if;
  if not transmissao_loja_ok(v_emp, p_filial) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  if p_modelo is not null and not exists (select 1 from modelos_mensagem where id = p_modelo and empresa_id = v_emp) then
    raise exception 'modelo de outra empresa' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'total', count(*),
           'aptos', count(*) filter (where p.fora is null),
           'opt_out', count(*) filter (where p.fora = 'opt_out'),
           'bloqueado', count(*) filter (where p.fora = 'bloqueado'),
           'sem_telefone', count(*) filter (where p.fora = 'sem_telefone'),
           'modelo_7_dias', count(*) filter (where p.fora = 'modelo_7_dias'),
           'amostra', coalesce((select jsonb_agg(jsonb_build_object('nome', a.nome, 'final', right(a.telefone, 4)))
                                  from (select q.nome, q.telefone from transmissao_publico(v_emp, p_filial, p_filtro, p_modelo) q
                                         where q.fora is null order by q.nome nulls last limit 5) a), '[]'::jsonb))
    into v
    from transmissao_publico(v_emp, p_filial, p_filtro, p_modelo) p;
  return v;
end $$;
revoke all on function public.transmissao_previa(bigint, jsonb, bigint) from public, anon;
grant execute on function public.transmissao_previa(bigint, jsonb, bigint) to authenticated, service_role;

-- A lista congelada no disparo: aptos entram 'pendente', os de fora entram 'pulada' com o
-- motivo (o acompanhamento mostra quantos ficaram fora e por quê). Só de 'rascunho'.
create or replace function public.transmissao_montar(p_transmissao bigint)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t transmissoes%rowtype;
  v_emp bigint := get_empresa_id();
  v_n int;
begin
  select * into t from transmissoes where id = p_transmissao for update;
  if not found or t.empresa_id is distinct from v_emp or not is_empresa_admin(v_emp) then
    raise exception 'transmissão não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if t.status <> 'rascunho' then
    raise exception 'a transmissão já foi disparada' using errcode = '22023';
  end if;
  if not transmissao_loja_ok(v_emp, t.filial_id) then
    raise exception 'loja inválida para esta empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from modelos_mensagem where id = t.modelo_id and empresa_id = v_emp and status = 'aprovado') then
    raise exception 'o modelo não está aprovado' using errcode = '22023';
  end if;
  insert into transmissao_envios (empresa_id, filial_id, transmissao_id, contato_id, negocio_id, modelo_id, telefone, status, motivo)
  select v_emp, t.filial_id, t.id, p.contato_id, p.negocio_id, t.modelo_id, p.telefone,
         case when p.fora is null then 'pendente' else 'pulada' end,
         case p.fora when 'opt_out' then 'contato pediu para não receber (opt-out)'
                     when 'bloqueado' then 'contato bloqueado'
                     when 'sem_telefone' then 'contato sem telefone'
                     when 'modelo_7_dias' then 'este contato já recebeu este modelo nos últimos 7 dias' end
    from transmissao_publico(v_emp, t.filial_id, t.filtro, t.modelo_id) p
  on conflict (transmissao_id, contato_id) do nothing;
  get diagnostics v_n = row_count;
  -- Ninguém apto: não nasce transmissão vazia (o erro desfaz a lista inteira).
  if not exists (select 1 from transmissao_envios where transmissao_id = t.id and status = 'pendente') then
    raise exception 'ninguém na lista pode receber (todos fora ou lista vazia)' using errcode = '22023';
  end if;
  update transmissoes set total = v_n where id = t.id;
  return v_n;
end $$;
revoke all on function public.transmissao_montar(bigint) from public, anon;
grant execute on function public.transmissao_montar(bigint) to authenticated, service_role;

-- As origens que existem nos contatos da empresa (o filtro "origem" da tela).
create or replace function public.transmissao_origens()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(o order by o), array[]::text[])
    from (select distinct lower(btrim(origem)) as o from contatos
           where empresa_id = get_empresa_id() and nullif(btrim(origem), '') is not null) x
   where is_empresa_admin(get_empresa_id());
$$;
revoke all on function public.transmissao_origens() from public, anon;
grant execute on function public.transmissao_origens() to authenticated, service_role;

-- Os números de cada transmissão numa ida (SECURITY INVOKER: a RLS de quem pede vale —
-- o vendedor conta só a loja dele). Entregue inclui lida; falha inclui a recusa da Meta
-- depois de aceita (status_entrega 'falhou').
create or replace function public.transmissao_numeros(p_ids bigint[])
returns table (transmissao_id bigint, total bigint, pendentes bigint, enviadas bigint, entregues bigint, lidas bigint,
               respondidas bigint, falhas bigint, puladas bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select e.transmissao_id,
         count(*),
         count(*) filter (where e.status in ('pendente', 'enviando')),
         count(*) filter (where e.status = 'enviada'),
         count(*) filter (where e.status = 'enviada' and m.status_entrega in ('entregue', 'lida')),
         count(*) filter (where e.status = 'enviada' and m.status_entrega = 'lida'),
         count(*) filter (where e.respondida_em is not null),
         count(*) filter (where e.status = 'falhou' or (e.status = 'enviada' and m.status_entrega = 'falhou')),
         count(*) filter (where e.status = 'pulada')
    from transmissao_envios e
    left join mensagens m on m.id = e.mensagem_id
   where e.transmissao_id = any (p_ids)
   group by e.transmissao_id;
$$;
revoke all on function public.transmissao_numeros(bigint[]) from public, anon;
grant execute on function public.transmissao_numeros(bigint[]) to authenticated, service_role;

-- 5 ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transmissao_reservar(p_transmissao bigint, p_lote integer default 50)
returns setof public.transmissao_envios
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 'enviando' esquecido (rodada que caiu no meio) volta para a fila depois de 15 min.
  update transmissao_envios set status = 'pendente', reservada_em = null
   where transmissao_id = p_transmissao and status = 'enviando' and reservada_em < now() - interval '15 minutes';

  return query
  update transmissao_envios e set status = 'enviando', reservada_em = now(), tentativas = e.tentativas + 1
   where e.id in (
     select id from transmissao_envios
      where transmissao_id = p_transmissao and status = 'pendente'
      order by id
      limit greatest(1, least(coalesce(p_lote, 50), 500))
      for update skip locked)
  returning e.*;
end $$;
revoke all on function public.transmissao_reservar(bigint, integer) from public, anon, authenticated;
grant execute on function public.transmissao_reservar(bigint, integer) to service_role;

-- 6 ─────────────────────────────────────────────────────────────────────────────
-- Quem recebeu e respondeu (até 7 dias depois do envio): o envio ganha respondida_em, e
-- a transmissão vai para o card do contato na loja — o aberto, senão o mais recente (a
-- mensagem_registrar já reabriu ou criou o card antes deste insert). A `origem` do
-- contato NÃO muda: ela é o canal por onde a tela responde.
create or replace function public.transmissao_resposta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e record;
  v_neg bigint;
begin
  update transmissao_envios x set respondida_em = new.created_at, resposta_mensagem_id = new.id
   where x.id = (select y.id from transmissao_envios y
                  where y.empresa_id = new.empresa_id and y.contato_id = new.contato_id
                    and y.status = 'enviada' and y.respondida_em is null
                    and y.enviada_em <= new.created_at and y.enviada_em > new.created_at - interval '7 days'
                  order by y.enviada_em desc limit 1)
  returning x.transmissao_id, x.filial_id, x.negocio_id into e;
  if not found then return null; end if;

  select n.id into v_neg from negocios n
   where n.empresa_id = new.empresa_id and n.contato_id = new.contato_id
     and n.filial_id is not distinct from coalesce(new.filial_id, e.filial_id)
   order by (n.status = 'aberto' and n.ativo) desc, n.created_at desc, n.id desc limit 1;
  v_neg := coalesce(v_neg, e.negocio_id);
  if v_neg is null then return null; end if;

  update negocios n set dados = jsonb_set(n.dados, '{_transmissao}', jsonb_build_object(
           'id', t.id, 'nome', t.nome, 'respondeu_em', new.created_at))
    from transmissoes t
   where n.id = v_neg and t.id = e.transmissao_id;
  insert into negocio_historico (empresa_id, negocio_id, acao, detalhe)
  select new.empresa_id, v_neg, 'respondeu_transmissao', jsonb_build_object('transmissao_id', t.id, 'nome', t.nome)
    from transmissoes t where t.id = e.transmissao_id;
  return null;
end $$;
revoke all on function public.transmissao_resposta() from public, anon, authenticated;

drop trigger if exists mensagens_transmissao_resposta on public.mensagens;
create trigger mensagens_transmissao_resposta after insert on public.mensagens
  for each row when (new.direcao = 'recebida') execute function public.transmissao_resposta();
