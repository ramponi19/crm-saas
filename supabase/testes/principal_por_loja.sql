-- Testes da migração 20261021002800_principal_por_loja (cópia; precisa de zz_antes = foto de
-- lead_mensagens(id, lead_id) tirada antes dela). psql -X -A -F '|' -f principal_por_loja.sql
\pset footer off

\echo '== 1. nenhuma mensagem perdida ou duplicada na view'
select (select count(*) from public.lead_mensagens) linhas_view, (select count(distinct id) from public.lead_mensagens) ids,
       (select count(*) from public.mensagens) mensagens, (select count(*) from public.lead_mensagens where lead_id is null) sem_lead;

\echo '== 2. o caso do Lucas (contato 2552): cada conversa no negócio da loja do canal'
select lm.lead_id, n.filial_id loja_do_lead, m.canal_id, ca.filial_id loja_do_canal, count(*) mensagens
  from public.lead_mensagens lm join public.mensagens m on m.id = lm.id
  left join public.canais ca on ca.id = m.canal_id left join public.negocios n on n.id = lm.lead_id
 where m.contato_id = 2552 group by 1, 2, 3, 4 order by 1, 3;
select id, filial_id, msgs_nao_lidas, ultima_mensagem_at from public.leads where id in (3548, 3598) order by id;

\echo '== 3. mensagem de canal SEMPRE no negócio da loja do canal (todas as empresas)'
select count(*) fora_da_loja_do_canal
  from public.lead_mensagens lm join public.mensagens m on m.id = lm.id join public.canais ca on ca.id = m.canal_id
  join public.negocios n on n.id = lm.lead_id
 where ca.filial_id is not null and n.filial_id is distinct from ca.filial_id;

\echo '== 4. nenhum negócio principal de loja com conversa vazia (todos / fundidos com Jaguariúna / nas duas lojas)'
with principal as (
  select distinct on (n.contato_id, n.filial_id) n.id, n.contato_id, n.filial_id
    from public.negocios n
   order by n.contato_id, n.filial_id, coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc
), com_conversa as (
  select p.* from principal p
   where exists (select 1 from public.mensagens m join public.conversas c on c.id = m.conversa_id
                  where m.contato_id = p.contato_id and m.filial_id = p.filial_id)
), vazio as (
  select c.* from com_conversa c where not exists (select 1 from public.lead_mensagens lm where lm.lead_id = c.id)
), fundidos6 as (
  select distinct f.contato_principal_id contato_id from public.contato_fusoes f
   where exists (select 1 from public.negocios n where n.contato_id = f.contato_principal_id and n.filial_id = 6)
), duas_lojas as (
  select contato_id from public.negocios group by 1 having count(distinct filial_id) > 1
)
select 'todos' grupo, (select count(*) from com_conversa) principais_com_conversa, (select count(*) from vazio) vazios
union all
select 'fundidos com Jaguariuna (' || (select count(*) from fundidos6) || ' contatos)',
       (select count(*) from com_conversa where contato_id in (select contato_id from fundidos6)),
       (select count(*) from vazio where contato_id in (select contato_id from fundidos6))
union all
select 'nas duas lojas (' || (select count(*) from duas_lojas) || ' contatos)',
       (select count(*) from com_conversa where contato_id in (select contato_id from duas_lojas)),
       (select count(*) from vazio where contato_id in (select contato_id from duas_lojas));

\echo '== 5. o que mudou de card (antes -> depois)'
select count(*) filter (where a.lead_id is distinct from lm.lead_id) mensagens_que_mudaram,
       count(distinct m.contato_id) filter (where a.lead_id is distinct from lm.lead_id) contatos
  from zz_antes a join public.lead_mensagens lm on lm.id = a.id join public.mensagens m on m.id = a.id;

\echo '== 6. badge: soma das não lidas nos cards = soma nas conversas (por empresa)'
select l.empresa_id, sum(l.msgs_nao_lidas) badge_cards,
       (select sum(c.nao_lidas) from public.conversas c where c.empresa_id = l.empresa_id) nao_lidas_conversas
  from public.leads l group by 1 order by 1;

\echo '== 7. permissões'
select 'anon=' || count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) || ' authenticated='
       || count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) grants
  from pg_proc p where p.pronamespace = 'public'::regnamespace;
