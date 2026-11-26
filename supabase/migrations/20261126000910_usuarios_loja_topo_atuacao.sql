-- CORREÇÃO DE SEGURANÇA, parte 2 (26/11/2026): a loja do topo (`usuarios.filial_atual_id`) só aceita loja em que a pessoa
-- pode atuar (`filiais_atuacao_de`, 20261126000900). Antes, a política `usuarios_update` deixava a pessoa gravar a própria
-- loja do topo com qualquer valor. Vale para qualquer caminho (navegador, rota com chave de serviço, script), porque a
-- conferência é pelo dono da linha (new.id) e pela empresa da loja escolhida. Nula ("Rede"/sem escolha) sempre passa.
-- À parte da 0900 porque é DDL em `usuarios` (lição do deadlock de 25/11: DDL em usuarios separada, lock_timeout).
-- Volta: supabase/scripts/volta/volta-usuarios-loja-topo-atuacao.sql

set local lock_timeout = '5s';

create or replace function public.usuarios_loja_topo_confere()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint;
begin
  if new.filial_atual_id is null or new.filial_atual_id is not distinct from old.filial_atual_id then return new; end if;
  select empresa_id into v_emp from public.filiais where id = new.filial_atual_id;
  if v_emp is null or not (new.filial_atual_id = any (public.filiais_atuacao_de(new.id, v_emp))) then
    raise exception 'LOJA_SEM_ATUACAO: esta loja não está entre as que a pessoa pode atuar' using errcode = '42501';
  end if;
  return new;
end $function$;
revoke all on function public.usuarios_loja_topo_confere() from public, anon, authenticated;

create or replace trigger usuarios_loja_topo_confere before update of filial_atual_id on public.usuarios
  for each row execute function public.usuarios_loja_topo_confere();
