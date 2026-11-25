-- ETAPA 1.1a — AUDITORIA ÚNICA (25/11/2026; docs/etapa-1.1-plano.md §1, PDV v2 §B "Auditoria").
--
-- Uma tabela só para "quem, quando, o quê, antes e depois", de qualquer módulo: configuração (1.1a), cargos e
-- acessos da plataforma (1.1b), custo (1.1d) e o histórico de preço da variante (1.2, D11). Não substitui
-- `eventos` (eventos de domínio para automações) nem `negocio_historico` (linha do tempo do negócio).
--
-- Regras:
--   - INSERT só pela função auditar() / auditar_emp(), chamadas de dentro das RPCs e gatilhos. Empresa, loja,
--     usuário e "impersonado_por" são preenchidos pela função, nunca pelo chamador;
--   - imutável: sem grant de escrita para nenhum papel da API (anon, authenticated, service_role) e gatilho
--     que recusa UPDATE/DELETE/TRUNCATE por qualquer caminho. ÚNICA exceção: a exclusão da própria empresa
--     (hard_delete_empresa apaga a linha de `empresas`; o gatilho AFTER DELETE expurga a auditoria dela,
--     LGPD), marcada por nexus.auditoria_expurgo = id da empresa, só dentro desse gatilho;
--   - leitura: membro da empresa com permissão de auditoria. Na 1.1a, dono/admin (is_empresa_admin); a 1.1b
--     troca por tem_permissao('auditoria.ver').
--
-- Só ADICIONA: nenhuma tabela, função ou tela de hoje muda. Compatível com o app no ar.
-- Volta: supabase/scripts/volta/volta-auditoria-eventos.sql.

create table if not exists public.auditoria_eventos (
  id              bigint generated always as identity primary key,
  -- sem FK: o registro sobrevive a mudanças na empresa; só some com a exclusão da própria empresa (gatilho abaixo)
  empresa_id      bigint,
  filial_id       bigint,
  usuario_id      uuid,
  impersonado_por uuid,
  entidade        text not null check (entidade ~ '^[a-z][a-z0-9_]{0,62}$'),
  entidade_id     text,
  acao            text not null check (acao ~ '^[a-z][a-z0-9_]{0,62}$'),
  antes           jsonb,
  depois          jsonb,
  motivo          text check (motivo is null or length(motivo) <= 2000),
  origem          text check (origem is null or length(origem) <= 200),
  criado_em       timestamptz not null default now()
);

comment on table public.auditoria_eventos is
  'Auditoria única (etapa 1.1): quem, quando, o quê, antes e depois. Só a função auditar() insere; imutável. Ver docs/etapa-1.1-plano.md §1.';
comment on column public.auditoria_eventos.impersonado_por is 'Superadmin (plataforma) que fez a ação dentro da empresa, pela impersonação.';
comment on column public.auditoria_eventos.origem is 'Nome da RPC, gatilho, rota ou script que gravou.';

create index if not exists auditoria_eventos_empresa_em_idx on public.auditoria_eventos (empresa_id, criado_em desc);
create index if not exists auditoria_eventos_entidade_idx on public.auditoria_eventos (empresa_id, entidade, entidade_id);
create index if not exists auditoria_eventos_usuario_idx on public.auditoria_eventos (empresa_id, usuario_id, criado_em desc);
create index if not exists auditoria_eventos_plataforma_idx on public.auditoria_eventos (empresa_id, criado_em desc)
  where impersonado_por is not null;

-- ── Imutável ───────────────────────────────────────────────────────────────────────────────────────────
revoke all on table public.auditoria_eventos from public, anon, authenticated, service_role;
grant select on table public.auditoria_eventos to authenticated, service_role;

create or replace function public.auditoria_eventos_imutavel()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'DELETE' and current_setting('nexus.auditoria_expurgo', true) = old.empresa_id::text then
    return old;   -- exclusão da própria empresa (gatilho empresas_expurgar_auditoria)
  end if;
  raise exception 'AUDITORIA_IMUTAVEL: registro de auditoria não se altera nem se apaga' using errcode = 'P0001';
end $$;

drop trigger if exists auditoria_eventos_imutavel on public.auditoria_eventos;
create trigger auditoria_eventos_imutavel
  before update or delete on public.auditoria_eventos
  for each row execute function public.auditoria_eventos_imutavel();

drop trigger if exists auditoria_eventos_sem_truncate on public.auditoria_eventos;
create trigger auditoria_eventos_sem_truncate
  before truncate on public.auditoria_eventos
  for each statement execute function public.auditoria_eventos_imutavel();

-- Exclusão da empresa (hard_delete_empresa, superadmin): a auditoria dela vai junto.
create or replace function public.empresas_expurgar_auditoria()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config('nexus.auditoria_expurgo', old.id::text, true);
  delete from public.auditoria_eventos where empresa_id = old.id;
  perform set_config('nexus.auditoria_expurgo', '', true);
  return old;
end $$;
revoke all on function public.empresas_expurgar_auditoria() from public, anon, authenticated;

drop trigger if exists empresas_expurgar_auditoria on public.empresas;
create trigger empresas_expurgar_auditoria
  after delete on public.empresas
  for each row execute function public.empresas_expurgar_auditoria();

-- ── Leitura ────────────────────────────────────────────────────────────────────────────────────────────
alter table public.auditoria_eventos enable row level security;
drop policy if exists auditoria_eventos_select on public.auditoria_eventos;
create policy auditoria_eventos_select on public.auditoria_eventos
  for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) and (select public.is_empresa_admin(empresa_id)));

-- ── Gravação ───────────────────────────────────────────────────────────────────────────────────────────
-- Com a empresa explícita: gatilhos, jobs e rotas do servidor (service_role). Usuário e "impersonado_por" vêm
-- da sessão quando houver (auth.uid()); num job, ficam nulos.
create or replace function public.auditar_emp(
  p_empresa     bigint,
  p_entidade    text,
  p_entidade_id text,
  p_acao        text,
  p_antes       jsonb default null,
  p_depois      jsonb default null,
  p_motivo      text default null,
  p_origem      text default null,
  p_filial      bigint default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid   uuid := auth.uid();
  v_imp   uuid;
  v_id    bigint;
begin
  if v_uid is not null then
    select u.id into v_imp
      from public.usuarios u
     where u.id = v_uid and u.is_super_admin
       and u.impersonando_empresa_id = p_empresa
       and u.impersonando_expires_at > now();
  end if;
  insert into public.auditoria_eventos
    (empresa_id, filial_id, usuario_id, impersonado_por, entidade, entidade_id, acao, antes, depois, motivo, origem)
  values
    (p_empresa, p_filial, v_uid, v_imp, p_entidade, p_entidade_id, p_acao, p_antes, p_depois, p_motivo, p_origem)
  returning id into v_id;
  return v_id;
end $$;

-- Pela sessão: a empresa e a loja são as da sessão (get_empresa_id / filial_atual), nunca do chamador.
create or replace function public.auditar(
  p_entidade    text,
  p_entidade_id text,
  p_acao        text,
  p_antes       jsonb default null,
  p_depois      jsonb default null,
  p_motivo      text default null,
  p_origem      text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp bigint := public.get_empresa_id();
begin
  if v_emp is null then
    raise exception 'SEM_EMPRESA: auditoria sem empresa na sessão' using errcode = 'P0001';
  end if;
  return public.auditar_emp(v_emp, p_entidade, p_entidade_id, p_acao, p_antes, p_depois, p_motivo, p_origem,
                            public.filial_atual());
end $$;

-- Ninguém da API chama direto: só funções SECURITY DEFINER (que rodam como dono) e o servidor.
revoke all on function public.auditar_emp(bigint, text, text, text, jsonb, jsonb, text, text, bigint) from public, anon, authenticated;
grant execute on function public.auditar_emp(bigint, text, text, text, jsonb, jsonb, text, text, bigint) to service_role;
revoke all on function public.auditar(text, text, text, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;

comment on function public.auditar_emp(bigint, text, text, text, jsonb, jsonb, text, text, bigint) is
  'Grava uma linha de auditoria com a empresa explícita (gatilhos, jobs, servidor). Usuário e impersonação vêm da sessão.';
comment on function public.auditar(text, text, text, jsonb, jsonb, text, text) is
  'Grava uma linha de auditoria com a empresa e a loja da sessão. Só para uso dentro de RPCs SECURITY DEFINER.';
