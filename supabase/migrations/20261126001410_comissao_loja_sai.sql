-- A "loja da comissão" da 5b sai (correção de 26/11/2026: comissão é da pessoa). SÓ DEPOIS do app sem o campo no ar.
-- A tabela só tinha a semente (loja principal de cada um; nenhuma alteração pela tela, 0 auditorias): backup e remoção.
-- Se um dia uma loja tiver tabela de comissão própria, é configuração da REGRA de comissão por loja (fase 2), não um
-- campo da pessoa. Volta: recriar a partir da 20261126001100/0110 e do backup (volta-comissao-da-pessoa.sql, parte 2).

set local lock_timeout = '5s';

create table if not exists public._backup_empresa_usuario_comissao_20261126 as
  select *, now() as copiado_em from public.empresa_usuario_comissao;
revoke all on public._backup_empresa_usuario_comissao_20261126 from anon, authenticated;
alter table public._backup_empresa_usuario_comissao_20261126 enable row level security;

drop function if exists public.comissao_loja_salvar(uuid, bigint);
drop table if exists public.empresa_usuario_comissao;
