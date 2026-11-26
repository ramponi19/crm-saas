-- 5b, semente (26/11/2026): cada loja ativa de cada empresa passa a ter a ROLETA e a LIBERAÇÃO configuradas com exatamente
-- quem é elegível hoje (ativo, não conta de serviço, `participa_roleta`; com 2+ lojas, `coalesce(filial_id, matriz)` = a loja;
-- com uma loja só, todos). Quem está ausente entra (ausência é estado, pulada na hora). A reserva do pós-venda começa vazia
-- (= direto para administradores e Donos, como hoje). Loja da comissão = a loja principal (`coalesce(filial_id, matriz)`).
-- Idempotente: só cria o que não existe. Prova: matriz de distribuição antes e depois (supabase/scripts/testes/
-- teste-distribuicao-por-loja.sql e a conferência de leitura na produção) e as rodadas seguintes na página Rotinas.

set local lock_timeout = '5s';

with lojas as (
  select f.empresa_id, f.id filial_id,
         (select count(*) from public.filiais g where g.empresa_id = f.empresa_id and g.ativo) qtd,
         (select g.id from public.filiais g where g.empresa_id = f.empresa_id and g.matriz and g.ativo order by g.id limit 1) matriz
    from public.filiais f where f.ativo
), novas as (
  insert into public.distribuicao_listas (empresa_id, filial_id, lista, configurada_por)
  select l.empresa_id, l.filial_id, x.lista, null from lojas l cross join (values ('roleta'), ('liberacao')) x(lista)
  on conflict do nothing
  returning empresa_id, filial_id, lista
)
insert into public.distribuicao_participantes (empresa_id, filial_id, lista, usuario_id, ordem)
select n.empresa_id, n.filial_id, n.lista, eu.usuario_id,
       row_number() over (partition by n.empresa_id, n.filial_id, n.lista order by eu.usuario_id)
  from novas n
  join lojas l on l.empresa_id = n.empresa_id and l.filial_id = n.filial_id
  join public.empresa_usuarios eu on eu.empresa_id = n.empresa_id
 where eu.ativo and not eu.conta_servico and eu.participa_roleta and eu.usuario_id is not null
   and (l.qtd < 2 or eu.filial_id = n.filial_id or (eu.filial_id is null and n.filial_id = l.matriz))
on conflict do nothing;

-- A loja da comissão saiu em 26/11 (20261126001410: comissão é da pessoa). Reaplicada depois disso (ritual local),
-- a semente pula este trecho.
do $c$
begin
  if to_regclass('public.empresa_usuario_comissao') is null then return; end if;
  insert into public.empresa_usuario_comissao (empresa_id, usuario_id, filial_id, atualizado_por)
  select eu.empresa_id, eu.usuario_id,
         coalesce((select f.id from public.filiais f where f.id = eu.filial_id and f.ativo),
                  (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.matriz and f.ativo order by f.id limit 1),
                  (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.ativo order by f.id limit 1)),
         null
    from public.empresa_usuarios eu
   where eu.ativo and eu.usuario_id is not null
     and exists (select 1 from public.filiais f where f.empresa_id = eu.empresa_id and f.ativo)
  on conflict do nothing;
end $c$;
