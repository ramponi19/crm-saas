-- CONDIÇÃO DA VENDA COM VALOR NEUTRO (Lucas, 24/11/2026; auditoria de universalidade).
--
-- `dados.venda.condicao` era 'novo' | 'seminovo' — "seminovo" é palavra de um ramo (eletrônicos). Passa a ser
-- 'novo' | 'usado' (o rótulo na tela continua vindo do vocabulário da empresa: "Seminovo" na JM, "Usado" no padrão).
--   1. o validador de `dados` (core_validar_dados) aceita 'usado' (e 'seminovo' por compatibilidade);
--   2. gatilho que troca 'seminovo' por 'usado' em toda gravação de negócio (o app antigo, até o deploy, e scripts);
--   3. os dados gravados: negócios, réguas e passos (filtros) e jornadas.
-- A condição ficar OPCIONAL por empresa (`core.condicao_venda` = exigida | opcional | nao_usa) é do app (lib/venda-ganho.ts):
-- no banco ela já é opcional.
--
-- Volta: supabase/scripts/volta/volta-condicao-usado.sql
-- Teste: supabase/scripts/testes/teste-condicao-usado.sql

-- 1. Validador: acrescenta 'usado' na lista (guarda: o trecho de hoje tem de estar lá).
do $$
declare d text; antes constant text := $q$not in ('novo', 'seminovo')$q$;
begin
  d := pg_get_functiondef('public.core_validar_dados()'::regprocedure);
  if position(antes in d) = 0 then
    raise exception 'core_validar_dados mudou (não achei a lista de condições); revise antes de aplicar';
  end if;
  execute replace(d, antes, $q$not in ('novo', 'usado', 'seminovo')$q$);
end $$;

-- 2. Toda gravação: 'seminovo' vira 'usado' (antes do validador e do negocios_venda_exigida: ordem alfabética).
create or replace function public.core_venda_condicao_neutra()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(new.dados -> 'venda') = 'object' and new.dados -> 'venda' ->> 'condicao' = 'seminovo' then
    new.dados := jsonb_set(new.dados, '{venda,condicao}', '"usado"');
  end if;
  return new;
end $$;
drop trigger if exists negocios_condicao_neutra on public.negocios;
create trigger negocios_condicao_neutra before insert or update of dados on public.negocios
  for each row execute function public.core_venda_condicao_neutra();
revoke all on function public.core_venda_condicao_neutra() from public, anon, authenticated;

-- 3. Os dados gravados.
update public.negocios set dados = jsonb_set(dados, '{venda,condicao}', '"usado"')
 where jsonb_typeof(dados -> 'venda') = 'object' and dados -> 'venda' ->> 'condicao' = 'seminovo';
update public.posvenda_cadencias set filtros = jsonb_set(filtros, '{condicao}', '"usado"') where filtros ->> 'condicao' = 'seminovo';
update public.posvenda_cadencia_passos set filtros = jsonb_set(filtros, '{condicao}', '"usado"') where filtros ->> 'condicao' = 'seminovo';
update public.posvenda_jornadas set condicao = 'usado' where condicao = 'seminovo';
