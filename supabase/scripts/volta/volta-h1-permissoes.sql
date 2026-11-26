-- VOLTA da H1b (20261126001210): religa a ponte empresas.permissoes → cargos.
-- Se a H1c (20261126001220) já tiver rodado, a PARTE 2 recria a coluna e a preenche do backup; a função da ponte é a
-- da 1.1b (20261125000700_cargos_permissoes.sql) e precisa ser recriada de lá antes de religar.
begin;
set local lock_timeout = '5s';
alter table public.empresas enable trigger empresas_permissoes_ponte;
commit;

-- PARTE 2 (só depois da H1c):
-- begin;
-- set local lock_timeout = '5s';
-- alter table public.empresas add column if not exists permissoes jsonb;
-- update public.empresas e set permissoes = b.permissoes from public._backup_empresas_permissoes_1_1h b where b.empresa_id = e.id;
-- (recriar a função e o gatilho empresas_permissoes_ponte a partir da 20261125000700)
-- commit;
