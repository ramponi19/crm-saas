-- ENTREGA 1.1r — FALHA DE ROTINA NÃO PODE SER SILENCIOSA (25/11/2026; docs/etapa-1.1r-rotinas-plano.md).
--
-- Toda rotina agendada passa a deixar uma execução registrada, com o resultado por empresa:
--   - rotinas do banco com resultado por empresa (pós-venda, liberação, aquecimento do ZapIntel): o comando do
--     job passa a envolver a MESMA chamada em rotina_registrar(), que grava e devolve o resultado sem mudar;
--   - rotinas que chamam o app (/api/cron/[job]): a rota abre e fecha a própria execução (app, mesmo deploy);
--   - rotinas sem resultado (retenção) e rodadas que caíram inteiras (status 'failed' no pg_cron, quando o
--     registro foi desfeito junto): o conferidor (rotinas_conferir, de 5 em 5 min) registra a partir de
--     cron.job_run_details.
-- Erro em qualquer empresa = execução 'com_erro'. Rotina sem rodar além do intervalo esperado = 'atrasada'
-- (calculado na hora por rotinas_situacao, não depende do conferidor estar de pé).
--
-- Só ACRESCENTA. Nenhuma rotina muda o que faz: a função chamada pelos jobs é a mesma, com os mesmos
-- argumentos; o registro nunca levanta erro (se falhar, a rotina segue igual). O comando antigo dos jobs
-- está no arquivo de volta: supabase/scripts/volta/volta-rotinas-execucoes.sql.

-- ── Catálogo ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rotinas (
  nome               text primary key check (nome ~ '^[a-z][a-z0-9_-]{0,62}$'),
  origem             text not null check (origem in ('pg_cron', 'vercel')),
  agenda             text not null,
  -- como a execução chega à tabela: o envelope do job (sql), a própria rota (rota), o conferidor a partir
  -- do pg_cron (agendador) ou só quando falha (so_falha: o próprio conferidor)
  registro           text not null check (registro in ('envelope', 'rota', 'agendador', 'so_falha')),
  intervalo_esperado interval not null,
  folga              interval not null default interval '15 minutes',
  -- só roda quando há o que fazer (entrada parada, mídia pendente): sem execução não é atraso
  condicional        boolean not null default false,
  descricao          text not null,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

insert into public.rotinas (nome, origem, agenda, registro, intervalo_esperado, folga, condicional, descricao) values
  ('posvenda-rotina-diaria',    'pg_cron', '10 * * * *', 'envelope',  interval '1 hour',     interval '20 minutes', false, 'Pós-venda: tolerância vencida vira perdido; passo de quem está ausente vai para a roleta (uma vez por dia e loja, depois da abertura)'),
  ('liberacao-diaria-esteira',  'pg_cron', '5 * * * *',  'envelope',  interval '1 hour',     interval '20 minutes', false, 'Liberação diária da esteira: lote de negócios sem dono por vendedor da roleta (uma vez por dia e loja)'),
  ('zapintel-conversa-aquecer', 'pg_cron', '0 5 * * *',  'envelope',  interval '1 day',      interval '2 hours',    false, 'ZapIntel: aquece o cache das conversas das empresas com o módulo'),
  ('retencao-diaria',           'pg_cron', '0 7 * * *',  'agendador', interval '1 day',      interval '2 hours',    false, 'Retenção: apaga dados vencidos em lotes (ops.purgar_retencao)'),
  ('automacoes-hora',           'pg_cron', '17 * * * *', 'rota',      interval '1 hour',     interval '20 minutes', false, 'Automatize, públicos e transmissões (/api/cron/automacoes)'),
  ('lgpd-exportacoes-limpar',   'pg_cron', '43 * * * *', 'rota',      interval '1 hour',     interval '20 minutes', false, 'Apaga os ZIPs da exportação LGPD com mais de 24 h (/api/cron/lgpd-limpar)'),
  ('entrada-parada',            'pg_cron', '*/5 * * * *','rota',      interval '5 minutes',  interval '10 minutes', true,  'Alerta de mensagem da Meta que não foi gravada (/api/cron/entrada-parada), só quando há o que conferir'),
  ('resgatar-midias',           'pg_cron', '*/15 * * * *','rota',     interval '15 minutes', interval '15 minutes', true,  'Resgate de mídia pendente do WhatsApp (/api/cron/resgatar-midias), só quando há pendente'),
  ('rotinas-conferir',          'pg_cron', '*/5 * * * *','so_falha',  interval '5 minutes',  interval '10 minutes', false, 'Este conferidor: registra rodadas que caíram e as rotinas sem registro próprio'),
  ('expirar-trials',            'vercel',  '0 6 * * *',  'rota',      interval '1 day',      interval '3 hours',    false, 'Teste vencido sem assinatura vira somente leitura (Vercel Cron)'),
  ('arquivar-eventos',          'vercel',  '0 3 * * *',  'rota',      interval '1 day',      interval '3 hours',    false, 'Apaga eventos do Stripe com mais de 90 dias (Vercel Cron)'),
  ('sync-stripe',               'vercel',  '0 0 * * *',  'rota',      interval '1 day',      interval '3 hours',    false, 'Reconcilia assinaturas do Stripe (Vercel Cron)'),
  ('renovar-tokens',            'vercel',  '30 4 * * *', 'rota',      interval '1 day',      interval '3 hours',    false, 'Renova o token de 60 dias do Instagram (Vercel Cron)'),
  ('reter-audio',               'vercel',  '20 4 * * *', 'rota',      interval '1 day',      interval '3 hours',    false, 'Apaga o áudio já transcrito do armazenamento (Vercel Cron)'),
  ('ponte-vendas',              'vercel',  '40 4 * * *', 'rota',      interval '1 day',      interval '3 hours',    false, 'Ponte venda↔conversa do ZapIntel (Vercel Cron)')
on conflict (nome) do nothing;

-- ── Execuções ──────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.rotinas_execucoes (
  id              bigint generated always as identity primary key,
  rotina          text not null,
  origem          text not null check (origem in ('sql', 'http', 'cron')),
  inicio          timestamptz not null default now(),
  fim             timestamptz,
  status          text not null check (status in ('rodando', 'ok', 'com_erro', 'falhou')),
  empresas_total  int not null default 0,
  empresas_erro   int not null default 0,
  resumo          jsonb,
  erro            text,
  cron_runid      bigint unique,
  reconhecida_em  timestamptz,
  reconhecida_por uuid
);
create index if not exists rotinas_execucoes_rotina_idx on public.rotinas_execucoes (rotina, inicio desc);
create index if not exists rotinas_execucoes_problema_idx on public.rotinas_execucoes (inicio desc)
  where status <> 'ok' and reconhecida_em is null;

create table if not exists public.rotinas_execucoes_empresas (
  execucao_id bigint not null references public.rotinas_execucoes(id) on delete cascade,
  empresa_id  bigint not null,
  status      text not null check (status in ('ok', 'erro')),
  contagens   jsonb,
  erro        text,
  primary key (execucao_id, empresa_id)
);
create index if not exists rotinas_execucoes_empresas_empresa_idx on public.rotinas_execucoes_empresas (empresa_id, execucao_id desc);

comment on table public.rotinas_execucoes is
  'Uma linha por execução de rotina agendada (entrega 1.1r). status: ok, com_erro (alguma empresa falhou), falhou (caiu inteira), rodando.';

-- Só o superadmin lê; ninguém da API grava (só as funções abaixo e o service_role do app).
alter table public.rotinas enable row level security;
alter table public.rotinas_execucoes enable row level security;
alter table public.rotinas_execucoes_empresas enable row level security;
revoke all on table public.rotinas, public.rotinas_execucoes, public.rotinas_execucoes_empresas from public, anon, authenticated;
grant select on table public.rotinas, public.rotinas_execucoes, public.rotinas_execucoes_empresas to authenticated;
grant select, insert, update, delete on table public.rotinas, public.rotinas_execucoes, public.rotinas_execucoes_empresas to service_role;

drop policy if exists rotinas_select on public.rotinas;
create policy rotinas_select on public.rotinas for select to authenticated using ((select public.is_super_admin()));
drop policy if exists rotinas_execucoes_select on public.rotinas_execucoes;
create policy rotinas_execucoes_select on public.rotinas_execucoes for select to authenticated using ((select public.is_super_admin()));
drop policy if exists rotinas_execucoes_empresas_select on public.rotinas_execucoes_empresas;
create policy rotinas_execucoes_empresas_select on public.rotinas_execucoes_empresas for select to authenticated using ((select public.is_super_admin()));

-- ── Registro pelo envelope (rotinas do banco) ──────────────────────────────────────────────────────────
-- Recebe o resultado da rotina no formato {"<empresa_id>": <resultado da empresa>, ...}. Empresa cujo
-- resultado tem a chave "erro" = erro. NUNCA levanta erro e devolve o resultado como recebeu.
create or replace function public.rotina_registrar(p_rotina text, p_inicio timestamptz, p_resultado jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id    bigint;
  k       text;
  v       jsonb;
  v_tot   int := 0;
  v_err   int := 0;
  v_resto jsonb := '{}';
begin
  begin
    insert into public.rotinas_execucoes (rotina, origem, inicio, fim, status)
    values (p_rotina, 'sql', coalesce(p_inicio, now()), clock_timestamp(), 'ok')
    returning id into v_id;

    if jsonb_typeof(p_resultado) = 'object' then
      for k, v in select * from jsonb_each(p_resultado) loop
        if k ~ '^[0-9]{1,18}$' then
          v_tot := v_tot + 1;
          if jsonb_typeof(v) = 'object' and v ? 'erro' then
            v_err := v_err + 1;
            insert into public.rotinas_execucoes_empresas (execucao_id, empresa_id, status, contagens, erro)
            values (v_id, k::bigint, 'erro', v - 'erro', left(v ->> 'erro', 2000));
          else
            insert into public.rotinas_execucoes_empresas (execucao_id, empresa_id, status, contagens)
            values (v_id, k::bigint, 'ok', v);
          end if;
        else
          v_resto := v_resto || jsonb_build_object(k, v);
        end if;
      end loop;
    elsif p_resultado is not null then
      v_resto := jsonb_build_object('resultado', p_resultado);
    end if;

    update public.rotinas_execucoes
       set empresas_total = v_tot, empresas_erro = v_err,
           status = case when v_err > 0 then 'com_erro' else 'ok' end,
           resumo = nullif(v_resto, '{}'::jsonb),
           erro = case when v_err > 0 then v_err || ' empresa(s) com erro' end
     where id = v_id;
  exception when others then
    raise warning 'rotina_registrar(%): registro falhou: %', p_rotina, sqlerrm;
  end;
  return p_resultado;
end $$;
revoke all on function public.rotina_registrar(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.rotina_registrar(text, timestamptz, jsonb) to service_role;

-- ── Registro pela rota do app (/api/cron/[job]) ────────────────────────────────────────────────────────
create or replace function public.rotina_execucao_abrir(p_rotina text)
returns bigint
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.rotinas_execucoes (rotina, origem, status) values (p_rotina, 'http', 'rodando') returning id
$$;

-- p_empresas: [{"empresa": 1, "status": "ok"|"erro", "erro": "...", "contagens": {...}}]
create or replace function public.rotina_execucao_fechar(p_id bigint, p_status text, p_resumo jsonb, p_empresas jsonb, p_erro text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  e   jsonb;
  v_err int := 0;
  v_tot int := 0;
begin
  if jsonb_typeof(p_empresas) = 'array' then
    for e in select * from jsonb_array_elements(p_empresas) loop
      if coalesce(e ->> 'empresa', '') ~ '^[0-9]{1,18}$' then
        v_tot := v_tot + 1;
        if e ->> 'status' = 'erro' then v_err := v_err + 1; end if;
        insert into public.rotinas_execucoes_empresas (execucao_id, empresa_id, status, contagens, erro)
        values (p_id, (e ->> 'empresa')::bigint, case when e ->> 'status' = 'erro' then 'erro' else 'ok' end,
                e -> 'contagens', left(e ->> 'erro', 2000))
        on conflict (execucao_id, empresa_id) do nothing;
      end if;
    end loop;
  end if;
  update public.rotinas_execucoes
     set fim = clock_timestamp(),
         status = case when p_status = 'falhou' then 'falhou'
                       when p_status = 'com_erro' or v_err > 0 then 'com_erro'
                       else 'ok' end,
         empresas_total = v_tot, empresas_erro = v_err,
         resumo = p_resumo, erro = left(p_erro, 2000)
   where id = p_id and status = 'rodando';
end $$;
revoke all on function public.rotina_execucao_abrir(text) from public, anon, authenticated;
revoke all on function public.rotina_execucao_fechar(bigint, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.rotina_execucao_abrir(text) to service_role;
grant execute on function public.rotina_execucao_fechar(bigint, text, jsonb, jsonb, text) to service_role;

-- ── Conferidor ─────────────────────────────────────────────────────────────────────────────────────────
-- Registra a partir do pg_cron (cron.job_run_details): toda rodada 'failed' de qualquer rotina do catálogo
-- (o registro próprio dela foi desfeito junto) e as rodadas das rotinas 'agendador' (sem registro próprio).
-- Idempotente pelo cron_runid. Também fecha como 'falhou' execução de rota que ficou 'rodando' há mais de
-- 30 min (a rota caiu antes de fechar) e apaga execuções 'ok' com mais de 90 dias.
create or replace function public.rotinas_conferir()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cron int := 0;
  v_pend int := 0;
  v_lixo int := 0;
begin
  insert into public.rotinas_execucoes (rotina, origem, inicio, fim, status, erro, cron_runid)
  select j.jobname, 'cron', d.start_time, d.end_time,
         case when d.status = 'failed' then 'falhou' else 'ok' end,
         case when d.status = 'failed' then left(d.return_message, 2000) end,
         d.runid
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    join public.rotinas r on r.nome = j.jobname
   where d.start_time > now() - interval '2 days'
     and d.status in ('succeeded', 'failed')
     and (d.status = 'failed' or r.registro = 'agendador')
     and not exists (select 1 from public.rotinas_execucoes e where e.cron_runid = d.runid);
  get diagnostics v_cron = row_count;

  update public.rotinas_execucoes
     set status = 'falhou', fim = coalesce(fim, now()),
         erro = coalesce(erro, 'a rota não fechou a execução em 30 minutos (caiu ou estourou o tempo)')
   where status = 'rodando' and inicio < now() - interval '30 minutes';
  get diagnostics v_pend = row_count;

  delete from public.rotinas_execucoes where status = 'ok' and inicio < now() - interval '90 days';
  get diagnostics v_lixo = row_count;

  return jsonb_build_object('do_agendador', v_cron, 'rodando_vencidas', v_pend, 'apagadas', v_lixo);
end $$;
revoke all on function public.rotinas_conferir() from public, anon, authenticated;
grant execute on function public.rotinas_conferir() to service_role;

-- ── Situação para o superadmin (calculada na hora) ─────────────────────────────────────────────────────
-- Por rotina: última execução, última rodada do agendador (pg_cron), atrasada? E os problemas não vistos
-- dos últimos 7 dias. O atraso usa, como prova de que rodou: a execução registrada (envelope e rota) ou a
-- rodada do pg_cron (agendador e so_falha). Rotina condicional não fica atrasada por falta de execução,
-- só se o próprio agendador parar. Antes da primeira execução conta desde a criação no catálogo.
create or replace function public.rotinas_situacao()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if not (public.is_super_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'SEM_PERMISSAO: só a plataforma vê as rotinas' using errcode = 'P0001';
  end if;

  with ult_exec as (
    select distinct on (rotina) rotina, id, inicio, fim, status, empresas_total, empresas_erro, erro
      from public.rotinas_execucoes order by rotina, inicio desc
  ), ult_cron as (
    select distinct on (j.jobname) j.jobname, j.active, d.start_time, d.status
      from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
     order by j.jobname, d.start_time desc nulls last
  ), linhas as (
    select r.*, ue.id as exec_id, ue.inicio as exec_inicio, ue.fim as exec_fim, ue.status as exec_status,
           ue.empresas_total, ue.empresas_erro, ue.erro as exec_erro,
           uc.active as cron_ativo, uc.start_time as cron_inicio, uc.status as cron_status,
           case
             when r.origem = 'pg_cron' and coalesce(uc.active, false) is not true then 'job desligado ou inexistente no pg_cron'
             when r.registro in ('envelope', 'rota') and not r.condicional
                  and greatest(coalesce(ue.inicio, r.criado_em), r.criado_em) < now() - (r.intervalo_esperado + r.folga) then 'sem execução registrada no intervalo'
             when r.origem = 'pg_cron'
                  and greatest(coalesce(uc.start_time, r.criado_em), r.criado_em) < now() - (r.intervalo_esperado + r.folga) then 'o agendador não rodou no intervalo'
           end as atraso
      from public.rotinas r
      left join ult_exec ue on ue.rotina = r.nome
      left join ult_cron uc on uc.jobname = r.nome
     where r.ativo
  )
  select jsonb_build_object(
    'agora', now(),
    'rotinas', coalesce((select jsonb_agg(jsonb_build_object(
        'nome', nome, 'origem', origem, 'agenda', agenda, 'descricao', descricao, 'condicional', condicional,
        'ultima_execucao', case when exec_id is not null then jsonb_build_object('id', exec_id, 'inicio', exec_inicio, 'fim', exec_fim,
                              'status', exec_status, 'empresas', empresas_total, 'empresas_erro', empresas_erro, 'erro', exec_erro) end,
        'ultima_rodada_agendador', cron_inicio, 'agendador_status', cron_status,
        'atrasada', atraso is not null, 'motivo_atraso', atraso) order by nome) from linhas), '[]'::jsonb),
    'problemas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'rotina', e.rotina, 'origem', e.origem, 'inicio', e.inicio, 'status', e.status, 'erro', e.erro,
        'empresas', (select jsonb_agg(jsonb_build_object('empresa', x.empresa_id, 'nome', em.nome, 'erro', x.erro) order by x.empresa_id)
                       from public.rotinas_execucoes_empresas x left join public.empresas em on em.id = x.empresa_id
                      where x.execucao_id = e.id and x.status = 'erro')) order by e.inicio desc)
        from public.rotinas_execucoes e
       where e.status in ('com_erro', 'falhou') and e.reconhecida_em is null and e.inicio > now() - interval '7 days'), '[]'::jsonb),
    'atrasadas', (select count(*) from linhas where atraso is not null)
  ) into v;
  return v;
end $$;
revoke all on function public.rotinas_situacao() from public, anon;
grant execute on function public.rotinas_situacao() to authenticated, service_role;

-- "Marcar como visto" (o aviso some; a execução continua registrada).
create or replace function public.rotina_execucao_reconhecer(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_super_admin() then
    raise exception 'SEM_PERMISSAO: só a plataforma marca rotina como vista' using errcode = 'P0001';
  end if;
  update public.rotinas_execucoes set reconhecida_em = now(), reconhecida_por = auth.uid()
   where id = p_id and reconhecida_em is null;
end $$;
revoke all on function public.rotina_execucao_reconhecer(bigint) from public, anon;
grant execute on function public.rotina_execucao_reconhecer(bigint) to authenticated;

-- ── Jobs: a mesma chamada, agora registrada; e o conferidor ────────────────────────────────────────────
-- cron.schedule com um nome que já existe atualiza o comando do mesmo job (mesmo jobid, mesma agenda).
-- Só onde o job existe (no banco local de teste, alguns não existem).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'posvenda-rotina-diaria') then
    perform cron.schedule('posvenda-rotina-diaria', '10 * * * *',
      $c$ select public.rotina_registrar('posvenda-rotina-diaria', now(), public.posvenda_rotina_diaria()) $c$);
  end if;
  if exists (select 1 from cron.job where jobname = 'liberacao-diaria-esteira') then
    perform cron.schedule('liberacao-diaria-esteira', '5 * * * *',
      $c$ select public.rotina_registrar('liberacao-diaria-esteira', now(), public.core_liberar_lotes_do_dia()) $c$);
  end if;
  if exists (select 1 from cron.job where jobname = 'zapintel-conversa-aquecer') then
    -- igual a hoje: se uma empresa falha, a rodada inteira falha (o conferidor registra 'falhou')
    perform cron.schedule('zapintel-conversa-aquecer', '0 5 * * *',
      $c$ select public.rotina_registrar('zapintel-conversa-aquecer', now(),
            (select coalesce(jsonb_object_agg(m.empresa_id::text, jsonb_build_object('conversas', public.zapintel_conversa_aquecer(m.empresa_id))), '{}'::jsonb)
               from public.empresa_modulos m where m.modulo = 'inteligencia' and m.ativo)) $c$);
  end if;
  perform cron.schedule('rotinas-conferir', '*/5 * * * *', $c$ select public.rotinas_conferir() $c$);
end $$;
