-- ETAPA 1.1b — CARGOS E PERMISSÕES NO SERVIDOR, EMPRESA ATIVA, SUPERADMIN COMO PLATAFORMA (25/11/2026;
-- docs/etapa-1.1-plano.md §2).
--
-- Compatível com o app no ar:
--   - o CARGO passa a ser a fonte; empresa_usuarios.role vira DERIVADO do cargo (papel_base) por gatilho, nos
--     dois sentidos enquanto o app antigo gravar role: quem grava role recebe o cargo correspondente; quem grava
--     cargo_id recebe o role do cargo. As 264 checagens de papel do app continuam certas (remoção: etapa E1.6);
--   - get_empresa_id, filiais_visiveis, sessao_pode_escrever, prevent_privilege_escalation: MESMA assinatura.
--     Para todo usuário de hoje o resultado é idêntico (conferido na produção em 25/11: 0 usuários com dois
--     vínculos ativos; superadmin sem vínculo; 1 dono por empresa);
--   - empresas.permissoes continua sendo gravada pela tela antiga; um gatilho leva o que for salvo para os
--     cargos (ponte, sai na 1.1h);
--   - nenhum dado da JM muda de cargo aqui: a semente só reproduz o papel de hoje (a 1.1c faz o mapeamento).
-- Decisão D-A1 (LGPD): a auditoria da escrita da plataforma guarda só tabela, id e NOMES dos campos alterados,
-- nunca valores.
--
-- Volta: supabase/scripts/volta/volta-cargos-permissoes.sql (devolve os corpos das funções; tabelas ficam).

-- ── Catálogo de permissões ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.permissoes_catalogo (
  chave   text primary key check (chave ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  rotulo  text not null,
  grupo   text not null,
  modulo  text,                     -- nulo = núcleo; senão, só aparece com o módulo ligado
  tipo    text not null default 'sim_nao' check (tipo in ('sim_nao', 'limite')),
  ordem   int not null default 0
);
insert into public.permissoes_catalogo (chave, rotulo, grupo, modulo, ordem) values
  ('core.ver_leads_outros',  'Ver leads de outras pessoas',                    'Comercial',    null, 10),
  ('core.ver_vendas_outros', 'Ver vendas e resultados de outras pessoas',      'Comercial',    null, 20),
  ('core.ver_relatorios',    'Ver Relatórios',                                 'Gestão',       null, 30),
  ('core.ver_financeiro',    'Ver Financeiro',                                 'Gestão',       null, 40),
  ('core.exportar',          'Exportar dados',                                 'Gestão',       null, 50),
  ('core.excluir',           'Excluir registros',                              'Gestão',       null, 60),
  ('lojas.ver_rede',         'Ver todas as lojas (a rede)',                    'Lojas',        null, 70),
  ('config.editar',          'Alterar as configurações da empresa',            'Administração', null, 80),
  ('equipe.cargos',          'Criar e editar cargos e trocar o cargo das pessoas', 'Administração', null, 90),
  ('auditoria.ver',          'Ver a Auditoria',                                'Administração', null, 100),
  ('estoque.ver_custo',      'Ver custo, margem e lucro',                      'Estoque',      'estoque', 110),
  ('estoque.preco_variante', 'Editar o preço da variante',                     'Estoque',      'estoque', 120),
  ('estoque.preco_proprio',  'Definir o preço próprio de uma unidade',         'Estoque',      'estoque', 130)
on conflict (chave) do nothing;
alter table public.permissoes_catalogo enable row level security;
revoke all on table public.permissoes_catalogo from public, anon, authenticated;
grant select on table public.permissoes_catalogo to authenticated, service_role;
drop policy if exists permissoes_catalogo_select on public.permissoes_catalogo;
create policy permissoes_catalogo_select on public.permissoes_catalogo for select to authenticated using (true);

-- ── Cargos ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.empresa_cargos (
  id              bigint generated always as identity primary key,
  empresa_id      bigint not null references public.empresas(id) on delete cascade,
  nome            text not null check (length(btrim(nome)) between 2 and 60),
  descricao       text,
  sistema         boolean not null default false,     -- Dono: não edita, não apaga, tem tudo
  papel_base      text not null check (papel_base in ('owner', 'admin', 'vendedor', 'tecnico')),
  somente_leitura boolean not null default false,     -- Consulta: nenhuma escrita em lugar nenhum
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  unique (empresa_id, nome),
  check (not sistema or papel_base = 'owner'),
  check (not (sistema and somente_leitura))
);
create unique index if not exists empresa_cargos_um_dono on public.empresa_cargos (empresa_id) where sistema;
create unique index if not exists empresa_cargos_id_empresa on public.empresa_cargos (id, empresa_id);

create table if not exists public.empresa_cargo_permissoes (
  cargo_id   bigint not null,
  empresa_id bigint not null,
  permissao  text not null references public.permissoes_catalogo(chave) on delete cascade,
  limite     numeric,
  primary key (cargo_id, permissao),
  foreign key (cargo_id, empresa_id) references public.empresa_cargos (id, empresa_id) on delete cascade
);
create index if not exists empresa_cargo_permissoes_empresa_idx on public.empresa_cargo_permissoes (empresa_id);

alter table public.empresa_cargos enable row level security;
alter table public.empresa_cargo_permissoes enable row level security;
revoke all on table public.empresa_cargos, public.empresa_cargo_permissoes from public, anon, authenticated;
grant select on table public.empresa_cargos, public.empresa_cargo_permissoes to authenticated;
grant select, insert, update, delete on table public.empresa_cargos, public.empresa_cargo_permissoes to service_role;
drop policy if exists empresa_cargos_select on public.empresa_cargos;
create policy empresa_cargos_select on public.empresa_cargos for select to authenticated
  using (empresa_id = (select public.get_empresa_id()));
drop policy if exists empresa_cargo_permissoes_select on public.empresa_cargo_permissoes;
create policy empresa_cargo_permissoes_select on public.empresa_cargo_permissoes for select to authenticated
  using (empresa_id = (select public.get_empresa_id()));

alter table public.empresa_usuarios add column if not exists cargo_id bigint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'empresa_usuarios_cargo_fk') then
    alter table public.empresa_usuarios add constraint empresa_usuarios_cargo_fk
      foreign key (cargo_id, empresa_id) references public.empresa_cargos (id, empresa_id) on delete restrict;
  end if;
end $$;
create index if not exists empresa_usuarios_cargo_idx on public.empresa_usuarios (cargo_id);

alter table public.usuarios add column if not exists empresa_ativa_id bigint references public.empresas(id) on delete set null;

-- ── Semente: os cargos de fábrica de uma empresa, com as permissões que ela já salvou ──────────────────
-- Reproduz o papel de hoje: Dono (owner), Administrador (admin), Vendedor, Técnico e Consulta (só leitura).
-- As 6 permissões antigas vêm de empresas.permissoes (o que o dono salvou) ou do padrão de lib/permissoes.ts.
create or replace function public.cargos_semear(p_empresa bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_perm jsonb := coalesce((select permissoes from public.empresas where id = p_empresa), '{}'::jsonb);
  c record;
  k record;
  v_id bigint;
  v_val boolean;
begin
  insert into public.empresa_cargos (empresa_id, nome, descricao, sistema, papel_base, somente_leitura) values
    (p_empresa, 'Dono', 'Acesso total. Não pode ser editado nem apagado; a empresa sempre tem pelo menos um Dono.', true, 'owner', false),
    (p_empresa, 'Administrador', 'Administra a empresa: configurações, equipe, relatórios e custo.', false, 'admin', false),
    (p_empresa, 'Vendedor', 'Atende e vende. Vê os próprios leads e vendas.', false, 'vendedor', false),
    (p_empresa, 'Técnico', 'Assistência e ordens de serviço.', false, 'tecnico', false),
    (p_empresa, 'Consulta', 'Só leitura, sem custo. Para contas de acompanhamento.', false, 'vendedor', true)
  on conflict (empresa_id, nome) do nothing;

  for c in select id, nome, papel_base, sistema, somente_leitura from public.empresa_cargos where empresa_id = p_empresa loop
    if c.sistema then continue; end if;       -- o Dono tem tudo por definição (tem_permissao), sem linhas
    if exists (select 1 from public.empresa_cargo_permissoes where cargo_id = c.id) then continue; end if;
    -- as 6 permissões antigas, pelo papel de base (Consulta: as de leitura fixas abaixo)
    for k in select * from (values
        ('core.ver_financeiro', 'verFinanceiro'), ('core.ver_relatorios', 'verRelatorios'),
        ('core.ver_leads_outros', 'verLeadsOutros'), ('core.ver_vendas_outros', 'verVendasOutros'),
        ('core.excluir', 'excluir'), ('core.exportar', 'exportar')) t(chave, antiga) loop
      if c.somente_leitura then
        v_val := k.chave in ('core.ver_leads_outros', 'core.ver_vendas_outros', 'core.ver_relatorios');   -- sem Financeiro (Q2)
      else
        v_val := coalesce((v_perm -> c.papel_base ->> k.antiga)::boolean,
          case c.papel_base
            when 'admin' then true
            when 'tecnico' then k.antiga = 'verLeadsOutros'
            else false end);
      end if;
      if v_val then
        insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c.id, p_empresa, k.chave)
        on conflict do nothing;
      end if;
    end loop;
    -- as novas: Administrador tem tudo menos editar cargos (é do Dono); Consulta vê a rede
    if c.papel_base = 'admin' and not c.somente_leitura then
      insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao)
      select c.id, p_empresa, chave from public.permissoes_catalogo
       where chave in ('lojas.ver_rede', 'config.editar', 'auditoria.ver', 'estoque.ver_custo', 'estoque.preco_variante', 'estoque.preco_proprio')
      on conflict do nothing;
    elsif c.somente_leitura then
      insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c.id, p_empresa, 'lojas.ver_rede')
      on conflict do nothing;
    end if;
  end loop;
end $$;
revoke all on function public.cargos_semear(bigint) from public, anon, authenticated;
grant execute on function public.cargos_semear(bigint) to service_role;

-- ── Cargo ⇄ papel (compatibilidade até a E1.6) ─────────────────────────────────────────────────────────
create or replace function public.empresa_usuarios_cargo_papel()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cargo record;
begin
  if tg_op = 'INSERT' then
    -- superadmin é plataforma: nunca tem vínculo com empresa (fecha o "resíduo aceito" de 03/09)
    if exists (select 1 from public.usuarios u where u.id = new.usuario_id and u.is_super_admin) then
      raise exception 'PLATAFORMA_SEM_VINCULO: conta da plataforma não entra na equipe de uma empresa' using errcode = 'P0001';
    end if;
  end if;

  if not exists (select 1 from public.empresa_cargos where empresa_id = new.empresa_id) then
    perform public.cargos_semear(new.empresa_id);
  end if;

  if tg_op = 'INSERT' and new.cargo_id is null
     or tg_op = 'UPDATE' and new.cargo_id is not distinct from old.cargo_id and new.role is distinct from old.role then
    -- quem gravou só o papel (app antigo): o cargo de fábrica desse papel
    select id into new.cargo_id from public.empresa_cargos
     where empresa_id = new.empresa_id and papel_base = coalesce(new.role, 'vendedor') and not somente_leitura
     order by sistema desc, id limit 1;
  end if;

  select * into v_cargo from public.empresa_cargos where id = new.cargo_id and empresa_id = new.empresa_id;
  if v_cargo.id is null then
    raise exception 'CARGO_INVALIDO: o cargo não é desta empresa' using errcode = 'P0001';
  end if;
  new.role := v_cargo.papel_base;
  -- Consulta não entra na roleta, na esteira nem no pós-venda
  if v_cargo.somente_leitura then
    new.participa_roleta := false;
  end if;
  return new;
end $$;
revoke all on function public.empresa_usuarios_cargo_papel() from public, anon, authenticated;

drop trigger if exists empresa_usuarios_cargo_papel on public.empresa_usuarios;
create trigger empresa_usuarios_cargo_papel
  before insert or update of cargo_id, role, empresa_id on public.empresa_usuarios
  for each row execute function public.empresa_usuarios_cargo_papel();

-- A empresa nunca fica sem Dono: conferido no fim da transação (trocar de Dono numa transação só funciona).
create or replace function public.empresa_usuarios_dono_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp bigint := old.empresa_id;
begin
  -- só quando ESTA mudança tirou um Dono ativo
  if not (old.ativo and exists (select 1 from public.empresa_cargos c where c.id = old.cargo_id and c.sistema)) then
    return null;
  end if;
  if not exists (select 1 from public.empresas where id = v_emp) then
    return null;   -- a empresa está sendo excluída
  end if;
  if not exists (select 1 from public.empresa_usuarios eu join public.empresa_cargos c on c.id = eu.cargo_id
                  where eu.empresa_id = v_emp and eu.ativo and c.sistema) then
    raise exception 'EMPRESA_SEM_DONO: a empresa precisa de pelo menos um Dono ativo' using errcode = 'P0001';
  end if;
  return null;
end $$;
revoke all on function public.empresa_usuarios_dono_guarda() from public, anon, authenticated;

drop trigger if exists empresa_usuarios_dono_guarda on public.empresa_usuarios;
create constraint trigger empresa_usuarios_dono_guarda
  after update or delete on public.empresa_usuarios
  deferrable initially deferred
  for each row execute function public.empresa_usuarios_dono_guarda();

-- Semente de todas as empresas e cargo de cada vínculo (o papel de hoje; nada muda de papel)
do $$
declare e bigint;
begin
  for e in select id from public.empresas order by id loop
    perform public.cargos_semear(e);
  end loop;
  update public.empresa_usuarios eu
     set cargo_id = (select c.id from public.empresa_cargos c
                      where c.empresa_id = eu.empresa_id and c.papel_base = eu.role and not c.somente_leitura
                      order by c.sistema desc, c.id limit 1)
   where eu.cargo_id is null;
  if exists (select 1 from public.empresa_usuarios where cargo_id is null) then
    raise exception 'CARGOS_SEMENTE: vínculo sem cargo depois da semente';
  end if;
end $$;

-- Empresa nova já nasce com os cargos
create or replace function public.empresas_semear_cargos()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  perform public.cargos_semear(new.id);
  return null;
end $$;
revoke all on function public.empresas_semear_cargos() from public, anon, authenticated;
drop trigger if exists empresas_semear_cargos on public.empresas;
create trigger empresas_semear_cargos after insert on public.empresas
  for each row execute function public.empresas_semear_cargos();

-- Ponte: a tela antiga de Permissões grava empresas.permissoes → as 6 permissões dos cargos de fábrica
create or replace function public.empresas_permissoes_ponte()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare c record; k record; v_val boolean;
begin
  for c in select id, papel_base from public.empresa_cargos
            where empresa_id = new.id and not sistema and not somente_leitura and nome in ('Administrador', 'Vendedor', 'Técnico') loop
    for k in select * from (values
        ('core.ver_financeiro', 'verFinanceiro'), ('core.ver_relatorios', 'verRelatorios'),
        ('core.ver_leads_outros', 'verLeadsOutros'), ('core.ver_vendas_outros', 'verVendasOutros'),
        ('core.excluir', 'excluir'), ('core.exportar', 'exportar')) t(chave, antiga) loop
      v_val := (new.permissoes -> c.papel_base ->> k.antiga)::boolean;
      if v_val is null then continue; end if;
      if v_val then
        insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao) values (c.id, new.id, k.chave) on conflict do nothing;
      else
        delete from public.empresa_cargo_permissoes where cargo_id = c.id and permissao = k.chave;
      end if;
    end loop;
  end loop;
  return null;
end $$;
revoke all on function public.empresas_permissoes_ponte() from public, anon, authenticated;
drop trigger if exists empresas_permissoes_ponte on public.empresas;
create trigger empresas_permissoes_ponte after update of permissoes on public.empresas
  for each row when (new.permissoes is distinct from old.permissoes)
  execute function public.empresas_permissoes_ponte();

-- ── Empresa ativa ──────────────────────────────────────────────────────────────────────────────────────
-- Ordem: (1) impersonação válida; (2) empresa ativa escolhida, com vínculo ativo; (3) o único vínculo ativo;
-- (4) nulo (com dois vínculos e nenhuma escolha, a RLS nega e o app pede "Escolha a empresa").
create or replace function public.get_empresa_id()
returns bigint
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_super   boolean;
  v_imp     bigint;
  v_expires timestamptz;
  v_ativa   bigint;
  v_n       int;
  v_empresa bigint;
begin
  select is_super_admin, impersonando_empresa_id, impersonando_expires_at, empresa_ativa_id
    into v_super, v_imp, v_expires, v_ativa
    from usuarios where id = auth.uid();

  if v_super and v_imp is not null and v_expires is not null and v_expires > now() then
    return v_imp;
  end if;

  if v_ativa is not null and exists (select 1 from empresa_usuarios
                                      where usuario_id = auth.uid() and empresa_id = v_ativa and ativo) then
    return v_ativa;
  end if;

  select count(*), min(empresa_id) into v_n, v_empresa
    from empresa_usuarios where usuario_id = auth.uid() and ativo;
  if v_n = 1 then
    return v_empresa;
  end if;
  return null;
end $$;
revoke execute on function public.get_empresa_id() from public, anon;
grant execute on function public.get_empresa_id() to authenticated, service_role;

create or replace function public.trocar_empresa_ativa(p_empresa bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_antes bigint;
begin
  if auth.uid() is null then
    raise exception 'SEM_SESSAO' using errcode = 'P0001';
  end if;
  if not exists (select 1 from empresa_usuarios where usuario_id = auth.uid() and empresa_id = p_empresa and ativo) then
    raise exception 'SEM_VINCULO: você não faz parte desta empresa' using errcode = 'P0001';
  end if;
  select empresa_ativa_id into v_antes from usuarios where id = auth.uid();
  perform set_config('nexus.empresa_ativa_rpc', '1', true);
  update usuarios set empresa_ativa_id = p_empresa, filial_atual_id = null where id = auth.uid();
  perform set_config('nexus.empresa_ativa_rpc', '', true);
  perform public.auditar_emp(p_empresa, 'usuario', auth.uid()::text, 'trocar_empresa',
                             jsonb_build_object('empresa', v_antes), jsonb_build_object('empresa', p_empresa), null, 'trocar_empresa_ativa');
end $$;
revoke all on function public.trocar_empresa_ativa(bigint) from public, anon;
grant execute on function public.trocar_empresa_ativa(bigint) to authenticated;

-- Colunas de plataforma e de sessão só mudam pelo caminho certo
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_super boolean;
begin
  select is_super_admin into v_is_super from public.usuarios where id = auth.uid();

  if not coalesce(v_is_super, false) then
    if old.is_super_admin is distinct from new.is_super_admin then
      raise exception 'Permission denied: cannot modify is_super_admin';
    end if;
    if old.impersonando_empresa_id is distinct from new.impersonando_empresa_id then
      raise exception 'Permission denied: cannot modify impersonando_empresa_id';
    end if;
    if old.impersonando_expires_at is distinct from new.impersonando_expires_at then
      raise exception 'Permission denied: cannot modify impersonando_expires_at';
    end if;
    if old.role is distinct from new.role then
      raise exception 'Permission denied: cannot modify role';
    end if;
    if old.modulos_acesso is distinct from new.modulos_acesso then
      raise exception 'Permission denied: cannot modify modulos_acesso';
    end if;
    if old.permissoes is distinct from new.permissoes then
      raise exception 'Permission denied: cannot modify permissoes';
    end if;
  end if;
  -- empresa ativa: só pela RPC trocar_empresa_ativa (inclusive para o superadmin e a chave de serviço)
  if old.empresa_ativa_id is distinct from new.empresa_ativa_id
     and coalesce(current_setting('nexus.empresa_ativa_rpc', true), '') <> '1' then
    raise exception 'Permission denied: empresa ativa muda só por trocar_empresa_ativa';
  end if;
  return new;
end $$;
revoke execute on function public.prevent_privilege_escalation() from public, anon, authenticated;
grant execute on function public.prevent_privilege_escalation() to service_role;

-- ── Permissão ──────────────────────────────────────────────────────────────────────────────────────────
-- Cargo do vínculo ativo na empresa da sessão. Dono (sistema) = tudo. Superadmin impersonando = tudo
-- (auditado pela plataforma). Sem empresa = nada.
create or replace function public.tem_permissao(p text)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with s as (select public.get_empresa_id() as emp)
  select case
    when (select emp from s) is null then false
    when coalesce(public.is_super_admin(), false) then true
    else exists (
      select 1 from public.empresa_usuarios eu
        join public.empresa_cargos c on c.id = eu.cargo_id
       where eu.usuario_id = auth.uid() and eu.empresa_id = (select emp from s) and eu.ativo
         and (c.sistema or exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = c.id and cp.permissao = p)))
  end
$$;
revoke all on function public.tem_permissao(text) from public, anon;
grant execute on function public.tem_permissao(text) to authenticated, service_role;

create or replace function public.limite_permissao(p text)
returns numeric
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with s as (select public.get_empresa_id() as emp)
  select case
    when (select emp from s) is null then 0
    when coalesce(public.is_super_admin(), false) then null
    else coalesce((
      select case when c.sistema then null else coalesce(cp.limite, 0) end
        from public.empresa_usuarios eu
        join public.empresa_cargos c on c.id = eu.cargo_id
        left join public.empresa_cargo_permissoes cp on cp.cargo_id = c.id and cp.permissao = p
       where eu.usuario_id = auth.uid() and eu.empresa_id = (select emp from s) and eu.ativo
         and (c.sistema or cp.permissao is not null)
       limit 1), 0)
  end
$$;
revoke all on function public.limite_permissao(text) from public, anon;
grant execute on function public.limite_permissao(text) to authenticated, service_role;

-- Somente leitura: empresa suspensa (como hoje) OU cargo Consulta. As políticas restritivas
-- somente_leitura_* de todas as tabelas da empresa já chamam esta função.
create or replace function public.sessao_pode_escrever()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce((select e.status = 'ativo' from public.empresas e where e.id = public.get_empresa_id()), true)
     and not exists (
       select 1 from public.empresa_usuarios eu join public.empresa_cargos c on c.id = eu.cargo_id
        where eu.usuario_id = auth.uid() and eu.empresa_id = public.get_empresa_id() and eu.ativo and c.somente_leitura)
$$;
revoke all on function public.sessao_pode_escrever() from public, anon;
grant execute on function public.sessao_pode_escrever() to authenticated;

-- Rede de lojas: dono/admin como hoje, ou quem tem lojas.ver_rede (o cargo Consulta)
create or replace function public.filiais_visiveis()
returns bigint[]
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp   bigint;
  v_qtd   int;
  v_sel   bigint;
  v_papel text;
  v_casa  bigint;
  v_super boolean;
  v_todas bigint[];
begin
  v_emp := get_empresa_id();
  if v_emp is null then return array[]::bigint[]; end if;

  select count(*) into v_qtd from filiais where empresa_id = v_emp and ativo;
  select coalesce(array_agg(id), array[]::bigint[]) into v_todas
    from filiais where empresa_id = v_emp;

  if v_qtd < 2 then return v_todas || 0::bigint; end if;

  select is_super_admin into v_super from usuarios where id = auth.uid();
  select role, filial_id into v_papel, v_casa
    from empresa_usuarios
    where usuario_id = auth.uid() and empresa_id = v_emp and ativo
    limit 1;

  if coalesce(v_super, false) or v_papel in ('owner', 'admin') or public.tem_permissao('lojas.ver_rede') then
    v_sel := filial_atual();
    if v_sel is not null then return array[v_sel]; end if;
    return v_todas || 0::bigint;
  end if;

  v_casa := coalesce(
    v_casa,
    (select id from filiais where empresa_id = v_emp and matriz and ativo limit 1)
  );
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $$;
revoke execute on function public.filiais_visiveis() from public, anon;
grant execute on function public.filiais_visiveis() to authenticated, service_role;

-- ── Contexto da sessão (uma chamada; corrige o 406 dos .single() em empresa_usuarios) ──────────────────
create or replace function public.sessao_contexto()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid   uuid := auth.uid();
  v_emp   bigint;
  v_super boolean;
  v_imp   boolean;
  c       record;
begin
  if v_uid is null then return null; end if;
  v_emp := public.get_empresa_id();
  select coalesce(is_super_admin, false), (impersonando_empresa_id is not null and impersonando_expires_at > now())
    into v_super, v_imp from public.usuarios where id = v_uid;

  select ec.id, ec.nome, ec.sistema, ec.papel_base, ec.somente_leitura, eu.filial_id into c
    from public.empresa_usuarios eu join public.empresa_cargos ec on ec.id = eu.cargo_id
   where eu.usuario_id = v_uid and eu.empresa_id = v_emp and eu.ativo;

  return jsonb_build_object(
    'usuario_id', v_uid,
    'empresa_id', v_emp,
    'filial_atual', public.filial_atual(),
    'loja_da_pessoa', c.filial_id,
    'plataforma', v_super and coalesce(v_imp, false) and v_emp is not null,
    'superadmin', v_super,
    'papel', case when v_super and v_emp is not null and c.id is null then 'owner' else c.papel_base end,
    'cargo', case when c.id is not null then jsonb_build_object('id', c.id, 'nome', c.nome, 'sistema', c.sistema, 'somente_leitura', c.somente_leitura) end,
    'somente_leitura', not public.sessao_pode_escrever(),
    'permissoes', case
      when v_emp is null then '[]'::jsonb
      when v_super or coalesce(c.sistema, false) then (select jsonb_agg(chave order by ordem) from public.permissoes_catalogo)
      else coalesce((select jsonb_agg(cp.permissao order by cp.permissao) from public.empresa_cargo_permissoes cp where cp.cargo_id = c.id), '[]'::jsonb)
    end,
    'empresas', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) order by e.nome), '[]'::jsonb)
                   from public.empresa_usuarios eu join public.empresas e on e.id = eu.empresa_id
                  where eu.usuario_id = v_uid and eu.ativo));
end $$;
revoke all on function public.sessao_contexto() from public, anon;
grant execute on function public.sessao_contexto() to authenticated, service_role;

-- ── RPCs de cargos (só com equipe.cargos; tudo auditado) ───────────────────────────────────────────────
create or replace function public.cargo_salvar(p_id bigint, p_nome text, p_descricao text, p_permissoes text[], p_somente_leitura boolean default false)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_emp bigint := public.get_empresa_id();
  v_id bigint := p_id;
  v_antes jsonb;
  v_ruins text[];
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = 'P0001'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = 'P0001'; end if;
  if not public.tem_permissao('equipe.cargos') then raise exception 'SEM_PERMISSAO: editar cargos' using errcode = 'P0001'; end if;
  select array_agg(x) into v_ruins from unnest(coalesce(p_permissoes, '{}')) x where x not in (select chave from public.permissoes_catalogo);
  if v_ruins is not null then raise exception 'PERMISSAO_INVALIDA: %', array_to_string(v_ruins, ', ') using errcode = 'P0001'; end if;

  if v_id is null then
    insert into public.empresa_cargos (empresa_id, nome, descricao, papel_base, somente_leitura, criado_por)
    values (v_emp, btrim(p_nome), p_descricao, case when 'config.editar' = any(p_permissoes) then 'admin' else 'vendedor' end,
            coalesce(p_somente_leitura, false), auth.uid())
    returning id into v_id;
  else
    select to_jsonb(c) || jsonb_build_object('permissoes', (select jsonb_agg(permissao order by permissao) from public.empresa_cargo_permissoes where cargo_id = c.id))
      into v_antes from public.empresa_cargos c where c.id = v_id and c.empresa_id = v_emp;
    if v_antes is null then raise exception 'CARGO_INVALIDO' using errcode = 'P0001'; end if;
    if (v_antes ->> 'sistema')::boolean then raise exception 'CARGO_SISTEMA: o Dono não é editável' using errcode = 'P0001'; end if;
    update public.empresa_cargos set nome = btrim(p_nome), descricao = p_descricao, somente_leitura = coalesce(p_somente_leitura, false)
     where id = v_id;
    delete from public.empresa_cargo_permissoes where cargo_id = v_id;
  end if;
  insert into public.empresa_cargo_permissoes (cargo_id, empresa_id, permissao)
  select v_id, v_emp, x from unnest(coalesce(p_permissoes, '{}')) x on conflict do nothing;

  perform public.auditar_emp(v_emp, 'cargo', v_id::text, case when p_id is null then 'criar' else 'alterar' end,
    v_antes - 'criado_em' - 'criado_por', jsonb_build_object('nome', p_nome, 'somente_leitura', coalesce(p_somente_leitura, false),
      'permissoes', (select jsonb_agg(x order by x) from unnest(coalesce(p_permissoes, '{}')) x)), null, 'cargo_salvar');
  return v_id;
end $$;

create or replace function public.cargo_apagar(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_emp bigint := public.get_empresa_id(); v_c record;
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = 'P0001'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = 'P0001'; end if;
  if not public.tem_permissao('equipe.cargos') then raise exception 'SEM_PERMISSAO: editar cargos' using errcode = 'P0001'; end if;
  select * into v_c from public.empresa_cargos where id = p_id and empresa_id = v_emp;
  if v_c.id is null then raise exception 'CARGO_INVALIDO' using errcode = 'P0001'; end if;
  if v_c.sistema then raise exception 'CARGO_SISTEMA: o Dono não pode ser apagado' using errcode = 'P0001'; end if;
  if exists (select 1 from public.empresa_usuarios where cargo_id = p_id) then
    raise exception 'CARGO_EM_USO: troque o cargo das pessoas antes de apagar' using errcode = 'P0001';
  end if;
  delete from public.empresa_cargos where id = p_id;
  perform public.auditar_emp(v_emp, 'cargo', p_id::text, 'apagar', jsonb_build_object('nome', v_c.nome), null, null, 'cargo_apagar');
end $$;

create or replace function public.usuario_cargo_trocar(p_usuario uuid, p_cargo bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_emp bigint := public.get_empresa_id(); v_antes bigint;
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = 'P0001'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = 'P0001'; end if;
  if not public.tem_permissao('equipe.cargos') then raise exception 'SEM_PERMISSAO: trocar cargo' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.empresa_cargos where id = p_cargo and empresa_id = v_emp) then
    raise exception 'CARGO_INVALIDO' using errcode = 'P0001';
  end if;
  select cargo_id into v_antes from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = v_emp;
  if not found then raise exception 'SEM_VINCULO' using errcode = 'P0001'; end if;
  update public.empresa_usuarios set cargo_id = p_cargo where usuario_id = p_usuario and empresa_id = v_emp;
  perform public.auditar_emp(v_emp, 'usuario', p_usuario::text, 'trocar_cargo',
    jsonb_build_object('cargo', v_antes), jsonb_build_object('cargo', p_cargo), null, 'usuario_cargo_trocar');
end $$;

revoke all on function public.cargo_salvar(bigint, text, text, text[], boolean) from public, anon;
revoke all on function public.cargo_apagar(bigint) from public, anon;
revoke all on function public.usuario_cargo_trocar(uuid, bigint) from public, anon;
grant execute on function public.cargo_salvar(bigint, text, text, text[], boolean) to authenticated;
grant execute on function public.cargo_apagar(bigint) to authenticated;
grant execute on function public.usuario_cargo_trocar(uuid, bigint) to authenticated;

-- ── Auditoria: permissão nova e acessos da plataforma ──────────────────────────────────────────────────
drop policy if exists auditoria_eventos_select on public.auditoria_eventos;
create policy auditoria_eventos_select on public.auditoria_eventos
  for select to authenticated
  using (empresa_id = (select public.get_empresa_id()) and (select public.tem_permissao('auditoria.ver')));

-- config_salvar: a permissão da configuração passa a ser config.editar (Dono e Administrador, como antes)
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.config_salvar(text, text, jsonb, bigint)'::regprocedure) into v_src;
  if position('public.is_empresa_admin(v_emp)' in v_src) = 0 then
    raise exception 'CONFIG_SALVAR_INESPERADO: corpo diferente do esperado (20261125000400)';
  end if;
  execute replace(replace(v_src, 'not public.is_empresa_admin(v_emp)', 'not public.tem_permissao(''config.editar'')'),
                  'só dono ou administrador altera a configuração', 'sem permissão para alterar a configuração');
end $$;

-- Entrada e saída da plataforma na auditoria da empresa (o dono vê); superadmin_logs continua como está
create or replace function public.set_impersonation(p_empresa_id bigint, p_ttl_seconds integer default 14400)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_super boolean;
  v_antes bigint;
begin
  select is_super_admin, case when impersonando_expires_at > now() then impersonando_empresa_id end
    into v_is_super, v_antes from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;

  if p_empresa_id is null then
    update public.usuarios set impersonando_empresa_id = null, impersonando_expires_at = null where id = auth.uid();
  else
    if not exists (select 1 from public.empresas where id = p_empresa_id) then
      raise exception 'Empresa % nao encontrada', p_empresa_id;
    end if;
    update public.usuarios
       set impersonando_empresa_id = p_empresa_id,
           impersonando_expires_at = now() + make_interval(secs => p_ttl_seconds)
     where id = auth.uid();
  end if;

  if v_antes is not null and v_antes is distinct from p_empresa_id then
    insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, origem)
    values (v_antes, auth.uid(), auth.uid(), 'plataforma', auth.uid()::text, 'plataforma_saiu', 'set_impersonation');
  end if;
  if p_empresa_id is not null and v_antes is distinct from p_empresa_id then
    insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, origem)
    values (p_empresa_id, auth.uid(), auth.uid(), 'plataforma', auth.uid()::text, 'plataforma_entrou', 'set_impersonation');
  end if;
end $$;
revoke execute on function public.set_impersonation(bigint, integer) from public, anon;
grant execute on function public.set_impersonation(bigint, integer) to authenticated, service_role;

create or replace function public.encerrar_impersonacao()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_super boolean;
  v_antes bigint;
begin
  select is_super_admin, case when impersonando_expires_at > now() then impersonando_empresa_id end
    into v_is_super, v_antes from public.usuarios where id = auth.uid();
  if not coalesce(v_is_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;
  update public.usuarios set impersonando_empresa_id = null, impersonando_expires_at = null where id = auth.uid();
  if v_antes is not null then
    insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, origem)
    values (v_antes, auth.uid(), auth.uid(), 'plataforma', auth.uid()::text, 'plataforma_saiu', 'encerrar_impersonacao');
  end if;
end $$;
revoke execute on function public.encerrar_impersonacao() from public, anon;
grant execute on function public.encerrar_impersonacao() to authenticated, service_role;

-- Página aberta pela plataforma dentro da empresa: no máximo uma linha por rota por minuto
create or replace function public.plataforma_registrar_acesso(p_rota text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_emp bigint;
begin
  select impersonando_empresa_id into v_emp from public.usuarios
   where id = auth.uid() and is_super_admin and impersonando_expires_at > now();
  if v_emp is null then return; end if;
  if exists (select 1 from public.auditoria_eventos where empresa_id = v_emp and impersonado_por = auth.uid()
              and acao = 'plataforma_acessou' and entidade_id = left(p_rota, 300) and criado_em > now() - interval '1 minute') then
    return;
  end if;
  insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, origem)
  values (v_emp, auth.uid(), auth.uid(), 'plataforma', left(p_rota, 300), 'plataforma_acessou', 'app');
end $$;
revoke all on function public.plataforma_registrar_acesso(text) from public, anon;
grant execute on function public.plataforma_registrar_acesso(text) to authenticated;

-- Toda escrita da plataforma numa tabela da empresa: tabela, id e os NOMES dos campos alterados (D-A1:
-- nenhum valor, nenhum dado pessoal). Para quem não é superadmin impersonando, sai na primeira linha.
create or replace function public.plataforma_auditar_escrita()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_emp bigint;
  v_campos jsonb;
  v_linha jsonb;
begin
  if v_uid is null then return null; end if;
  select impersonando_empresa_id into v_emp from public.usuarios
   where id = v_uid and is_super_admin and impersonando_expires_at > now();
  if v_emp is null then return null; end if;

  v_linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_campos
      from jsonb_object_keys(to_jsonb(new)) k
     where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k;
  end if;
  insert into public.auditoria_eventos (empresa_id, usuario_id, impersonado_por, entidade, entidade_id, acao, depois, origem)
  values (coalesce((v_linha ->> 'empresa_id')::bigint, v_emp), v_uid, v_uid, 'plataforma',
          tg_table_name || ':' || coalesce(v_linha ->> 'id', '?'), 'plataforma_' || lower(tg_op),
          case when v_campos is not null then jsonb_build_object('campos', v_campos) end, 'gatilho');
  return null;
end $$;
revoke all on function public.plataforma_auditar_escrita() from public, anon, authenticated;

do $$
declare t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'empresa_id'
       and c.table_name not in ('auditoria_eventos', 'acessos', 'superadmin_logs', 'rate_limit', 'historico_bruto',
                                'zapintel_conversa_cache', 'diagnostico_canais', 'rotinas_execucoes_empresas')
       and c.table_name not like '\_backup%'
     order by 1
  loop
    execute format('drop trigger if exists zz_plataforma_auditar on public.%I', t);
    execute format('create trigger zz_plataforma_auditar after insert or update or delete on public.%I for each row execute function public.plataforma_auditar_escrita()', t);
  end loop;
end $$;
