-- VOLTA da 20261126000910_usuarios_loja_topo_atuacao: o gatilho passa a não conferir nada (sem drop).
begin;
set local lock_timeout = '5s';
create or replace function public.usuarios_loja_topo_confere()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$ begin return new; end $function$;
commit;
