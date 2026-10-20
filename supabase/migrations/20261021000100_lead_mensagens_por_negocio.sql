-- lead_mensagens partindo do negócio: abrir uma conversa volta a usar índice.
--
-- A view do corte (20/10) achava o negócio principal mensagem por mensagem
-- (LEFT JOIN LATERAL sobre mensagens). Com isso o filtro `lead_id = X` não
-- tinha onde se apoiar: o Postgres lia as ~80 mil mensagens da empresa e
-- calculava o principal de cada contato para no fim ficar com as de um lead.
-- Em produção, como usuário logado, abrir o chat do lead 3598 levou 2,85 s, e
-- às 10:11 de 20/10 uma abertura passou dos 8 s e caiu por statement timeout.
-- Antes do corte, a mesma consulta levava 42 ms em média.
--
-- Agora a view parte do negócio: `lead_id = X` acha o negócio pela chave,
-- confere que ele é o principal do contato e lê as mensagens pelo índice de
-- contato. Mensagem de contato sem negócio continua aparecendo, com lead_id
-- nulo, no segundo ramo. O conjunto de linhas é o mesmo da view antiga
-- (conferido na cópia: 80.162 linhas, 0 diferenças nos dois sentidos).
--
-- Principal = o negócio ATIVO mais recente; sem ativo, o mais recente. É a
-- mesma regra da view leads.
--
-- CREATE OR REPLACE mantém o gatilho compat_lead_mensagens (INSTEAD OF),
-- os defaults das colunas e as permissões. As colunas não mudam.
create or replace view public.lead_mensagens with (security_invoker = true) as
  select m.id, n.id as lead_id, m.direcao, m.conteudo, m.origem, m.lida, m.created_at, m.empresa_id, m.external_id, m.tipo,
         m.midia_url, m.status_entrega, m.erro_envio, m.status_em, m.usuario_id, m.filial_id, m.canal_id, m.transcricao,
         m.midia_retida_em
    from public.negocios n
    join public.mensagens m on m.contato_id = n.contato_id
   where n.id = (select p.id from public.negocios p where p.contato_id = n.contato_id
                  order by coalesce((p.dados -> '_lead' ->> 'ativo')::boolean, true) desc, p.created_at desc, p.id desc limit 1)
  union all
  select m.id, null::bigint, m.direcao, m.conteudo, m.origem, m.lida, m.created_at, m.empresa_id, m.external_id, m.tipo,
         m.midia_url, m.status_entrega, m.erro_envio, m.status_em, m.usuario_id, m.filial_id, m.canal_id, m.transcricao,
         m.midia_retida_em
    from public.mensagens m
   where m.contato_id is null
      or not exists (select 1 from public.negocios p where p.contato_id = m.contato_id);
