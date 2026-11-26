-- 1.1h PARTE 2, H1b: `empresas.permissoes` (o formato de antes dos cargos, 1.1b) deixa de ser usado. Backup da coluna e
-- a ponte para os cargos desligada. À parte das outras porque é DDL em `empresas` (lição de 25/11: lock_timeout, sem
-- drop desnecessário). A COLUNA só sai na H1c (20261126001220), depois de 1 dia sem leitor.
-- Antes: o passo 1 do app no ar (/api/permissoes removida; o /entrar não lê mais a coluna).
-- Volta: supabase/scripts/volta/volta-h1-permissoes.sql (religa a ponte).

set local lock_timeout = '5s';

create table if not exists public._backup_empresas_permissoes_1_1h as
  select id as empresa_id, permissoes, now() as copiado_em from public.empresas where permissoes is not null;
revoke all on public._backup_empresas_permissoes_1_1h from anon, authenticated;
alter table public._backup_empresas_permissoes_1_1h enable row level security;

alter table public.empresas disable trigger empresas_permissoes_ponte;
