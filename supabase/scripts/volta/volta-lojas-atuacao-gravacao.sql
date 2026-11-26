-- VOLTA da 20261126000900_lojas_atuacao_gravacao: desliga a conferência nas tabelas (o gatilho passa a não fazer nada) e
-- devolve o corpo anterior de filial_atual. As funções filiais_atuacao* ficam (inofensivas; a 0910 usa). Rodar a volta da
-- 0910 antes, se for desfazer as duas.
begin;
set local lock_timeout = '5s';
create or replace function public.loja_atuacao_confere()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $function$ begin return new; end $function$;
create or replace function public.filial_atual()
 returns bigint language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint; v_sel bigint;
begin
  v_emp := get_empresa_id();
  if v_emp is null then return null; end if;
  select u.filial_atual_id into v_sel from usuarios u where u.id = auth.uid();
  if v_sel is null then return null; end if;
  if not exists (select 1 from filiais f where f.id = v_sel and f.empresa_id = v_emp and f.ativo) then
    return null;
  end if;
  return v_sel;
end $function$;
commit;
