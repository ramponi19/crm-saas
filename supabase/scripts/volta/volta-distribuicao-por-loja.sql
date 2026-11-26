-- VOLTA da 20261126001100/0110 (5b): `distribuicao_lista` passa a responder "não configurada" (NULL) para tudo, então
-- roleta, liberação e roleta do pós-venda voltam à regra antiga (vínculo + participa_roleta) e a reserva da loja é pulada
-- (vai direto aos administradores e Donos, como antes). As funções de gravar passam a recusar. Tabelas e dados ficam
-- (sem drop): desfazer a volta é recriar distribuicao_lista com o corpo da 0100.
-- Para voltar também o app: promover o deploy anterior na Vercel.
begin;
set local lock_timeout = '5s';
create or replace function public.distribuicao_lista(p_empresa bigint, p_filial bigint, p_lista text)
 returns uuid[] language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$ select null::uuid[] $function$;
create or replace function public.distribuicao_salvar(p_filial bigint, p_lista text, p_usuarios uuid[])
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$ begin raise exception 'SEM_PERMISSAO: distribuição por loja desligada (volta da 5b)' using errcode = '42501'; end $function$;
create or replace function public.comissao_loja_salvar(p_usuario uuid, p_filial bigint)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$ begin raise exception 'SEM_PERMISSAO: distribuição por loja desligada (volta da 5b)' using errcode = '42501'; end $function$;
commit;
