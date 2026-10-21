-- Teste da RLS de contatos (20261021003000). Roda como cada pessoa, numa transação desfeita:
-- um vendedor de cada loja e o dono com cada loja escolhida no seletor.
--   psql -X -A -F '|' -f contatos_visiveis.sql
\pset footer off
-- os contatos com negócio nas duas lojas, apurados sem RLS
create temp table zz_duas as select contato_id from public.negocios where empresa_id = 1 group by 1 having count(distinct filial_id) > 1;
grant select on zz_duas to authenticated;

create or replace function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_usuario::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.medir(p_quem text) returns table (
  quem text, lojas text, cards bigint, negocios_visiveis bigint, cards_faltando bigint,
  cards_outra_loja bigint, msgs_outra_loja bigint, contatos_visiveis bigint, contatos_sem_vinculo bigint,
  dois_lojas_cards bigint, dois_lojas_negocios bigint, dois_lojas_vazios bigint, lucas text)
language sql as $$
  with v as (select public.filiais_visiveis() f),
  duas as (select contato_id from zz_duas)
  select p_quem, (select f::text from v),
    (select count(*) from public.leads),
    (select count(*) from public.negocios),
    (select count(*) from public.negocios n where not exists (select 1 from public.leads l where l.id = n.id)),
    (select count(*) from public.leads l where not (select f from v) @> array[coalesce(l.filial_id, 0::bigint)]),
    (select count(*) from public.lead_mensagens m where not (select f from v) @> array[coalesce(m.filial_id, 0::bigint)]),
    (select count(*) from public.contatos),
    (select count(*) from public.contatos c where not (select f from v) @> array[coalesce(c.filial_id, 0::bigint)]
        and not exists (select 1 from public.negocios n where n.contato_id = c.id)
        and not exists (select 1 from public.conversas x where x.contato_id = c.id)),
    (select count(*) from public.leads l where l.id in (select n.id from public.negocios n where n.contato_id in (select contato_id from duas))),
    (select count(*) from public.negocios n where n.contato_id in (select contato_id from duas)),
    (select count(*) from public.leads l where l.id in (select n.id from public.negocios n where n.contato_id in (select contato_id from duas))
        and exists (select 1 from public.conversas x join public.mensagens m on m.conversa_id = x.id
                     where x.contato_id = (select contato_id from public.negocios where id = l.id) and m.filial_id = l.filial_id)
        and not exists (select 1 from public.lead_mensagens lm where lm.lead_id = l.id)
        and l.id = (select p.id from public.negocios p where p.contato_id = (select contato_id from public.negocios where id = l.id)
                     and p.filial_id = l.filial_id
                     order by coalesce((p.dados -> '_lead' ->> 'ativo')::boolean, true) desc, p.created_at desc, p.id desc limit 1)),
    (select string_agg(l.id || '/loja' || l.filial_id || '/' || (select count(*) from public.lead_mensagens lm where lm.lead_id = l.id) || 'msgs', ' ' order by l.id)
       from public.leads l where l.id in (3548, 3598))
$$;

-- quem testar
create temp table zz_quem as
select 'vendedor Mogi' quem, (select usuario_id from public.empresa_usuarios where empresa_id = 1 and ativo and role = 'vendedor' and filial_id = 3 order by id limit 1) u, null::bigint loja
union all select 'vendedor Jaguariuna', (select usuario_id from public.empresa_usuarios where empresa_id = 1 and ativo and role = 'vendedor' and filial_id = 6 order by id limit 1), null
union all select 'dono em Mogi', (select usuario_id from public.empresa_usuarios where empresa_id = 1 and ativo and role = 'owner' limit 1), 3
union all select 'dono em Jaguariuna', (select usuario_id from public.empresa_usuarios where empresa_id = 1 and ativo and role = 'owner' limit 1), 6
union all select 'dono na rede', (select usuario_id from public.empresa_usuarios where empresa_id = 1 and ativo and role = 'owner' limit 1), null;
grant select on zz_quem to authenticated;

\echo '== vendedor Mogi'
begin; select pg_temp.como((select u from zz_quem where quem = 'vendedor Mogi')); set local role authenticated; select * from pg_temp.medir('vendedor Mogi'); rollback;
\echo '== vendedor Jaguariuna'
begin; select pg_temp.como((select u from zz_quem where quem = 'vendedor Jaguariuna')); set local role authenticated; select * from pg_temp.medir('vendedor Jaguariuna'); rollback;
\echo '== dono em Mogi'
begin; update public.usuarios set filial_atual_id = 3 where id = (select u from zz_quem where quem = 'dono em Mogi'); select pg_temp.como((select u from zz_quem where quem = 'dono em Mogi')); set local role authenticated; select * from pg_temp.medir('dono em Mogi'); rollback;
\echo '== dono em Jaguariuna'
begin; update public.usuarios set filial_atual_id = 6 where id = (select u from zz_quem where quem = 'dono em Jaguariuna'); select pg_temp.como((select u from zz_quem where quem = 'dono em Jaguariuna')); set local role authenticated; select * from pg_temp.medir('dono em Jaguariuna'); rollback;
\echo '== dono na rede'
begin; update public.usuarios set filial_atual_id = null where id = (select u from zz_quem where quem = 'dono na rede'); select pg_temp.como((select u from zz_quem where quem = 'dono na rede')); set local role authenticated; select * from pg_temp.medir('dono na rede'); rollback;
