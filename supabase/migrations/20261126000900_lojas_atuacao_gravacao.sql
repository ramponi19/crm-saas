-- CORREÇÃO DE SEGURANÇA (26/11/2026; docs/lojas-e-distribuicao-plano.md, achado da 5a): a pessoa só GRAVA em loja em que
-- pode atuar. Antes: um vendedor podia gravar o próprio `usuarios.filial_atual_id` (loja do topo) e a loja de gravação
-- (`filial_gravacao`) usava a loja do topo antes da do vínculo, sem conferir "ver a rede"; nas tabelas cujo INSERT confere
-- só a empresa, ele gravaria em outra loja.
--   - `filiais_atuacao_de(usuário, empresa)` / `filiais_atuacao()`: as lojas em que a pessoa pode atuar. Empresa com menos
--     de 2 lojas ativas: todas. Superadmin, Dono/Administrador (owner/admin) ou `lojas.ver_rede`: todas. Os demais: a loja
--     do vínculo (vazia = a matriz). (Na 5a, os demais passam a ser a lista de "lojas que enxerga".)
--   - `filial_atual()`: a loja do topo só vale se for de atuação (senão, nula → a loja de gravação cai no vínculo).
--   - gatilho `zy_loja_atuacao_confere` (BEFORE INSERT/UPDATE OF filial_id) em contatos, negocios, conversas, mensagens,
--     vendas_vendas, vendas_pagamentos, estoque_unidades, compras_pedidos e tarefas: gravação DIRETA pelo navegador
--     (papéis authenticated/anon) numa loja fora da atuação é recusada (LOJA_SEM_ATUACAO). Funções do banco (SECURITY
--     DEFINER) e rotas com chave de serviço passam aqui — as rotas conferem no servidor (lib/sessao: exigirLojaDeAtuacao).
--     O nome começa com "zy_" para rodar DEPOIS dos gatilhos *_preencher_filial (BEFORE, em ordem alfabética).
-- Nenhuma gravação legítima muda: o levantamento de 30 dias (26/11) não achou gravação fora da loja de atuação.
-- Só funções novas, troca de corpo de filial_atual e create trigger (sem drop), um por tabela, com lock_timeout.
-- O gatilho em `usuarios` (loja do topo só de atuação) vai à parte: 20261126000910 (lição do deadlock de 25/11).
-- Volta: supabase/scripts/volta/volta-lojas-atuacao-gravacao.sql

set local lock_timeout = '5s';

create or replace function public.filiais_atuacao_de(p_usuario uuid, p_empresa bigint)
 returns bigint[]
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_todas bigint[]; v_qtd int; v_papel text; v_cargo bigint; v_casa bigint; v_super boolean;
begin
  if p_empresa is null or p_usuario is null then return array[]::bigint[]; end if;
  select coalesce(array_agg(id order by id) filter (where ativo), array[]::bigint[]), count(*) filter (where ativo)
    into v_todas, v_qtd from public.filiais where empresa_id = p_empresa;
  if v_qtd < 2 then return v_todas; end if;
  select is_super_admin into v_super from public.usuarios where id = p_usuario;
  if coalesce(v_super, false) then return v_todas; end if;
  select role, cargo_id, filial_id into v_papel, v_cargo, v_casa
    from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = p_empresa and ativo limit 1;
  if not found then return array[]::bigint[]; end if;
  if v_papel in ('owner', 'admin')
     or exists (select 1 from public.empresa_cargos c where c.id = v_cargo and c.sistema)
     or exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = v_cargo and cp.permissao = 'lojas.ver_rede') then
    return v_todas;
  end if;
  v_casa := coalesce(v_casa, (select id from public.filiais where empresa_id = p_empresa and matriz and ativo limit 1));
  if v_casa is null then return array[]::bigint[]; end if;
  return array[v_casa];
end $function$;
revoke all on function public.filiais_atuacao_de(uuid, bigint) from public, anon, authenticated;

create or replace function public.filiais_atuacao()
 returns bigint[]
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select public.filiais_atuacao_de(auth.uid(), public.get_empresa_id())
$function$;
revoke all on function public.filiais_atuacao() from public, anon;
grant execute on function public.filiais_atuacao() to authenticated, service_role;

-- a loja do topo só vale se a pessoa puder atuar nela
create or replace function public.filial_atual()
 returns bigint
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint; v_sel bigint;
begin
  v_emp := get_empresa_id();
  if v_emp is null then return null; end if;

  select u.filial_atual_id into v_sel from usuarios u where u.id = auth.uid();
  if v_sel is null then return null; end if;

  -- Seleção velha (loja desativada, ou de outra empresa) vale como "Rede", nunca como acesso a uma loja que ela não
  -- deveria mais ver. E (26/11/2026) loja em que a pessoa não pode atuar também não vale.
  if not exists (select 1 from filiais f where f.id = v_sel and f.empresa_id = v_emp and f.ativo)
     or not (v_sel = any (public.filiais_atuacao_de(auth.uid(), v_emp))) then
    return null;
  end if;

  return v_sel;
end $function$;

create or replace function public.loja_atuacao_confere()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- só gravação direta pelo navegador; funções do banco (dono) e rotas de serviço conferem por conta própria
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'UPDATE' and new.filial_id is not distinct from old.filial_id then return new; end if;
  if new.filial_id is null then return new; end if;
  if not (new.filial_id = any (public.filiais_atuacao())) then
    raise exception 'LOJA_SEM_ATUACAO: você não pode gravar nesta loja' using errcode = '42501';
  end if;
  return new;
end $function$;
revoke all on function public.loja_atuacao_confere() from public, anon, authenticated;

create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.contatos
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.negocios
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.conversas
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.mensagens
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.vendas_vendas
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.vendas_pagamentos
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.estoque_unidades
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.compras_pedidos
  for each row execute function public.loja_atuacao_confere();
create or replace trigger zy_loja_atuacao_confere before insert or update of filial_id on public.tarefas
  for each row execute function public.loja_atuacao_confere();
