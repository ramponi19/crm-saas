-- 1.1h PARTE 2, H2: LEITURA PROTEGIDA de chaves de configuração (docs/etapa-1.1-plano.md §5.1; vem da precificação §8.3).
-- A margem da precificação somada ao preço revela o custo; então `precificacao.*` (e a Auditoria dessas chaves) só é
-- lida por quem tem `estoque.ver_custo`. Genérico: `config_chave_leitura(chave_prefixo, permissao)` espelha a marca
-- `leitura` do catálogo (lib/config.ts). Chave sem marca continua legível como hoje.
--   - empresa_config: a política de SELECT exige a permissão da chave marcada;
--   - config_valor (a da sessão): devolve nulo para quem não tem (config_valor_emp é interna: só funções do banco e a
--     chave de serviço a executam, e continua lendo tudo — os jobs precisam);
--   - auditoria_eventos: linha de `config` de chave marcada só com a permissão (a tela Auditoria lê pela sessão);
--   - config_salvar segue exigindo a permissão de edição (config.editar) — a de edição da precificação vem na P1a.
-- Volta: supabase/scripts/volta/volta-h2-config-leitura.sql (políticas e config_valor como antes).

set local lock_timeout = '5s';

create table if not exists public.config_chave_leitura (
  chave_prefixo text primary key check (chave_prefixo ~ '^[a-z][a-z0-9_]*\.([a-z][a-z0-9_]*)?$'),
  permissao     text not null references public.permissoes_catalogo(chave)
);
comment on table public.config_chave_leitura is
  '1.1h H2: chaves de configuração de leitura protegida (prefixo "modulo." ou "modulo.chave"). Espelho da marca `leitura` do catálogo lib/config.ts.';
alter table public.config_chave_leitura enable row level security;
drop policy if exists config_chave_leitura_select on public.config_chave_leitura;
create policy config_chave_leitura_select on public.config_chave_leitura for select to authenticated using (true);
revoke all on public.config_chave_leitura from anon, authenticated;
grant select on public.config_chave_leitura to authenticated;
grant all on public.config_chave_leitura to service_role;

insert into public.config_chave_leitura (chave_prefixo, permissao) values ('precificacao.', 'estoque.ver_custo')
on conflict (chave_prefixo) do update set permissao = excluded.permissao;

-- A sessão pode ler a chave `modulo.chave`? (sem marca: sim)
create or replace function public.config_pode_ler(p_chave_completa text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((
    select public.tem_permissao(l.permissao)
      from public.config_chave_leitura l
     where split_part(coalesce(p_chave_completa, ''), '@', 1) like l.chave_prefixo || '%'
     order by length(l.chave_prefixo) desc
     limit 1), true)
$function$;
revoke all on function public.config_pode_ler(text) from public, anon;
grant execute on function public.config_pode_ler(text) to authenticated, service_role;

alter policy empresa_config_select on public.empresa_config
  using (empresa_id = (select public.get_empresa_id()) and public.config_pode_ler(modulo || '.' || chave));

alter policy auditoria_eventos_select on public.auditoria_eventos
  using (empresa_id = (select public.get_empresa_id()) and (select public.tem_permissao('auditoria.ver'))
         and (entidade <> 'config' or public.config_pode_ler(entidade_id)));

create or replace function public.config_valor(p_modulo text, p_chave text, p_filial bigint DEFAULT NULL::bigint)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case when public.config_pode_ler(p_modulo || '.' || p_chave)
              then public.config_valor_emp(public.get_empresa_id(), p_modulo, p_chave, p_filial) end
$function$;
