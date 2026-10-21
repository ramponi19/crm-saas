-- =====================================================================================
-- 1.3 (sincronização, roda ANTES do deploy): o histórico de posse do lead passa a ser só o
-- negocio_historico do core. Até aqui havia dois: o gatilho core_negocio_historico gravava
-- 'atribuicao' a cada troca de responsável, e as rotas gravavam a ação detalhada (pegar,
-- devolver, transferir, atribuir, distribuir) em lead_atribuicoes. O corte copiou as 191 linhas
-- antigas; as de depois do corte estão em dobro (a do gatilho ~0,2 s antes).
--
--   1. a ação e o autor viajam na transação: negocio_atribuir() marca `nexus.acao_atribuicao` e
--      `nexus.atribuicao_por`, e o gatilho os usa (sem marca, grava 'atribuicao' como antes);
--   2. as linhas de lead_atribuicoes de depois do corte viram a ação detalhada na linha do gatilho
--      (ou entram, se o gatilho não tiver gravado);
--   3. zapintel_conversa_calc e fundir_clientes deixam de ler lead_atribuicoes.
-- Não apaga nada. O DROP vem em 20261022000300, depois do deploy.
-- =====================================================================================

-- 1. O gatilho usa a ação e o autor marcados na transação.
create or replace function public.core_negocio_historico()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if new.etapa_id is distinct from old.etapa_id then
    insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, por_usuario)
    values (new.empresa_id, new.id, old.etapa_id, new.etapa_id, 'etapa', auth.uid());
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into negocio_historico (empresa_id, negocio_id, de_responsavel, para_responsavel, acao, por_usuario)
    values (new.empresa_id, new.id, old.responsavel_id, new.responsavel_id,
            coalesce(nullif(current_setting('nexus.acao_atribuicao', true), ''), 'atribuicao'),
            coalesce(auth.uid(), nullif(current_setting('nexus.atribuicao_por', true), '')::uuid));
  end if;
  return new;
end $$;

-- A troca de responsável com a ação detalhada. Só o servidor chama (as rotas já conferiram o
-- papel de quem pediu): execute só para service_role, e o autor vem em p_por.
create or replace function public.negocio_atribuir(p_negocio bigint, p_responsavel uuid, p_acao text, p_por uuid default null)
  returns void
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
begin
  if p_acao not in ('pegar', 'devolver', 'transferir', 'atribuir', 'distribuir') then
    raise exception 'negocio_atribuir: ação inválida %', p_acao using errcode = '22023';
  end if;
  perform set_config('nexus.acao_atribuicao', p_acao, true);
  perform set_config('nexus.atribuicao_por', coalesce(p_por::text, ''), true);
  -- Pela view leads, como as rotas sempre gravaram: responsavel_desde é o marco do prazo de
  -- devolução à esteira e mora em negocios.dados._lead (o gatilho da view cuida).
  update public.leads
     set responsavel_id = p_responsavel,
         responsavel_desde = case when p_responsavel is null then null else now() end
   where id = p_negocio;
  perform set_config('nexus.acao_atribuicao', '', true);
  perform set_config('nexus.atribuicao_por', '', true);
end $$;
revoke execute on function public.negocio_atribuir(bigint, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.negocio_atribuir(bigint, uuid, text, uuid) to service_role;

-- 2. O que lead_atribuicoes tem e o negocio_historico não tem com a ação detalhada.
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

-- 3. Os leitores em SQL. Troca exata de um trecho em cada função (falha se não achar UM).
do $$
declare
  v_def text; v_de text; v_para text;
begin
  -- Quem era o dono do lead em cada momento (atribui mensagens ao vendedor no ZapIntel):
  -- as linhas de posse com a ação detalhada, exatamente as que lead_atribuicoes tinha. A troca
  -- genérica do gatilho ('atribuicao', feita por outras telas) fica de fora, como ficava: incluí-la
  -- muda os números do Atendimento e é decisão à parte (ver o commit do 1.3).
  v_def := pg_get_functiondef('public.zapintel_conversa_calc(bigint, bigint[], integer)'::regprocedure);
  v_de := 'select a.lead_id, a.created_at em, a.para_responsavel dono
    from lead_atribuicoes a join L on L.id = a.lead_id where a.empresa_id = v_emp';
  v_para := 'select a.negocio_id lead_id, a.em, a.para_responsavel dono
    from negocio_historico a join L on L.id = a.negocio_id where a.empresa_id = v_emp
     and a.acao in (''pegar'', ''devolver'', ''transferir'', ''atribuir'', ''distribuir'')';
  v_def := replace(v_def, E'\r\n', E'\n');
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'zapintel_conversa_calc: esperava 1 leitura de lead_atribuicoes';
  end if;
  execute replace(v_def, v_de, v_para);

  -- Fusão de clientes: a linha que remapeava lead_atribuicoes sai (o negocio_historico segue o
  -- negócio, que a fusão já move).
  v_def := pg_get_functiondef('public.fundir_clientes(bigint, bigint, bigint)'::regprocedure);
  v_def := replace(v_def, E'\r\n', E'\n');
  v_de := E'    update lead_atribuicoes      set lead_id = v_lead_principal where lead_id = v_lead_secundario;\n';
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'fundir_clientes: esperava 1 linha de lead_atribuicoes';
  end if;
  execute replace(v_def, v_de, '');
end $$;
