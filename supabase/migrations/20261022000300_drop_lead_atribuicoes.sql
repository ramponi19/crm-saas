-- 1.3 (DROP, roda DEPOIS do deploy): lead_atribuicoes sai. A posse do lead fica só no
-- negocio_historico (gatilho + negocio_atribuir), e nenhum leitor sobrou (painel do responsável,
-- zapintel_conversa_calc e fundir_clientes mudaram na 20261021003500). Antes do drop, a mesma
-- conversão da sincronização roda de novo para o que o app antigo gravou entre ela e o deploy.
update public.negocio_historico h
   set acao = la.acao, por_usuario = coalesce(h.por_usuario, la.por_usuario)
  from public.lead_atribuicoes la
 where h.id = (select h2.id from public.negocio_historico h2
                where h2.negocio_id = la.lead_id and h2.acao = 'atribuicao'
                  and h2.para_responsavel is not distinct from la.para_responsavel
                  and abs(extract(epoch from h2.em - la.created_at)) < 5
                order by abs(extract(epoch from h2.em - la.created_at)) limit 1)
   and not exists (select 1 from public.negocio_historico h3
                    where h3.negocio_id = la.lead_id and h3.acao = la.acao
                      and h3.para_responsavel is not distinct from la.para_responsavel
                      and abs(extract(epoch from h3.em - la.created_at)) < 5);

insert into public.negocio_historico (empresa_id, negocio_id, de_responsavel, para_responsavel, acao, por_usuario, em)
select la.empresa_id, la.lead_id, la.de_responsavel, la.para_responsavel, la.acao, la.por_usuario, la.created_at
  from public.lead_atribuicoes la
 where exists (select 1 from public.negocios n where n.id = la.lead_id)
   and not exists (select 1 from public.negocio_historico h
                    where h.negocio_id = la.lead_id and h.acao = la.acao
                      and h.para_responsavel is not distinct from la.para_responsavel
                      and abs(extract(epoch from h.em - la.created_at)) < 5);

drop table if exists public.lead_atribuicoes;
