-- COMISSÃO É DA PESSOA, NÃO DE UMA LOJA (correção da 5b, 26/11/2026; decisão do Lucas).
--   - cada venda conta para quem vendeu, em QUALQUER loja; a faixa/percentual soma todas as vendas concluídas da pessoa
--     no período, em todas as lojas;
--   - a meta PESSOAL e a comissão paga são da pessoa: `metas_comissoes` e `vendas_comissoes` deixam de ser recortadas
--     pela loja do topo (antes, com uma loja escolhida, a meta e o pagamento gravados em outra loja sumiam da tela — risco
--     de pagar duas vezes). As duas tabelas estão vazias na produção. A coluna filial_id fica (sem uso; sem drop);
--   - `vendas_da_equipe(inicio, fim)`: as vendas concluídas no período (mês da conclusão, lib/vendas-mes) de TODAS as lojas,
--     com a loja de cada venda e a marca de comissão retida (aparelho de troca pendente). Quem não vê vendas de outros
--     recebe só as próprias. Metas e Comissões somam por pessoa e mostram quanto foi em cada loja.
-- Compatível com o app no ar (só alarga a leitura da própria empresa). A loja da comissão (5b) sai na 1410, depois do app.
-- Volta: supabase/scripts/volta/volta-comissao-da-pessoa.sql

set local lock_timeout = '5s';

alter policy tenant_isolamento on public.metas_comissoes
  using (empresa_id = (select public.get_empresa_id()))
  with check (empresa_id = (select public.get_empresa_id()));
alter policy tenant_isolamento on public.vendas_comissoes
  using (empresa_id = (select public.get_empresa_id()))
  with check (empresa_id = (select public.get_empresa_id()));

create or replace function public.vendas_da_equipe(p_inicio timestamptz, p_fim timestamptz)
 returns table(vendedor_id uuid, filial_id bigint, valor_venda numeric, grupo_pdv text, retida boolean)
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with pend as (
    select distinct u.grupo_pdv from public.estoque_unidades u
     where u.empresa_id = public.get_empresa_id() and u.status = 'pendente' and u.ativo and u.grupo_pdv is not null)
  select v.vendedor_id, v.filial_id, coalesce(v.valor_venda, 0)::numeric, v.grupo_pdv,
         (v.grupo_pdv is not null and v.grupo_pdv in (select grupo_pdv from pend))
    from public.vendas_vendas v
   where v.empresa_id = public.get_empresa_id()
     and v.status = 'concluida'
     and ((v.concluida_em >= p_inicio and v.concluida_em < p_fim)
          or (v.concluida_em is null and v.data_venda >= p_inicio and v.data_venda < p_fim))
     and (public.tem_permissao('core.ver_vendas_outros') or v.vendedor_id = auth.uid())
$function$;
revoke all on function public.vendas_da_equipe(timestamptz, timestamptz) from public, anon;
grant execute on function public.vendas_da_equipe(timestamptz, timestamptz) to authenticated, service_role;
