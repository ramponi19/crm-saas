-- Volta da 20261124002000_condicao_usado: tira o gatilho e devolve 'seminovo' aos dados (o app antigo só conhece
-- 'novo' | 'seminovo'). O validador continua aceitando os três (inofensivo).
drop trigger if exists negocios_condicao_neutra on public.negocios;
drop function if exists public.core_venda_condicao_neutra();
update public.negocios set dados = jsonb_set(dados, '{venda,condicao}', '"seminovo"')
 where jsonb_typeof(dados -> 'venda') = 'object' and dados -> 'venda' ->> 'condicao' = 'usado';
update public.posvenda_cadencias set filtros = jsonb_set(filtros, '{condicao}', '"seminovo"') where filtros ->> 'condicao' = 'usado';
update public.posvenda_cadencia_passos set filtros = jsonb_set(filtros, '{condicao}', '"seminovo"') where filtros ->> 'condicao' = 'usado';
update public.posvenda_jornadas set condicao = 'seminovo' where condicao = 'usado';
