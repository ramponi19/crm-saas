-- ATRIBUIÇÃO MANUAL FICA FORA DA DEVOLUÇÃO AUTOMÁTICA (Lucas, 24/11/2026). Universal.
--
-- A devolução automática à esteira (lib/esteira.ts) devolve o lead com cliente esperando quando o responsável não
-- responde no prazo. Isso vale para quem PEGOU o lead e para o que a ROLETA distribuiu. Não vale mais para a posse
-- decidida por alguém: 'atribuir' ou 'transferir' (feitas por dono ou administrador na tela, ou por script com motivo).
-- Para isso, negocio_atribuir guarda no negócio a posse atual: dados._lead.posse = {acao, para, em} (tirada ao
-- soltar). A esteira pula o negócio quando posse.para é o responsável atual e a ação é 'atribuir'/'transferir'.
-- core_marcar_posse_manual() preenche a marca das atribuições manuais já feitas (pelo histórico) — roda aqui uma vez.
--
-- Volta: supabase/scripts/volta/volta-atribuicao-manual.sql
-- Teste: supabase/scripts/testes/teste-atribuicao-manual.sql + tests/esteira-posse.test.ts

do $$
begin
  if coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = 'public.negocio_atribuir(bigint,uuid,text,uuid)'::regprocedure), '-')
     not in ('75b91dfdf06141ef080e4a0ae2772789', '75b91dfdf06141ef080e4a0ae2772789') then  -- produção / arquivo de 09/11
    raise exception 'negocio_atribuir mudou desde a conferência de 24/11/2026; revise antes de aplicar';
  end if;
end $$;

create or replace function public.negocio_atribuir(p_negocio bigint, p_responsavel uuid, p_acao text, p_por uuid default null)
returns void language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if p_acao not in ('pegar', 'devolver', 'transferir', 'atribuir', 'distribuir') then
    raise exception 'negocio_atribuir: ação inválida %', p_acao using errcode = '22023';
  end if;
  perform set_config('nexus.acao_atribuicao', p_acao, true);
  perform set_config('nexus.atribuicao_por', coalesce(p_por::text, ''), true);
  -- responsavel_desde é o marco do prazo de devolução à esteira e mora em dados._lead.
  -- Sem responsável, o marco antigo fica (era assim pela view: jsonb_strip_nulls).
  -- posse (24/11/2026): como o responsável atual chegou ao negócio; 'atribuir'/'transferir' ficam fora da devolução.
  update public.negocios
     set responsavel_id = p_responsavel,
         dados = case when p_responsavel is null
                      then jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) - 'posse')
                      else jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb)
                                     || jsonb_build_object('responsavel_desde', now(),
                                                           'posse', jsonb_build_object('acao', p_acao, 'para', p_responsavel, 'em', now()))) end
   where id = p_negocio
     and (p_acao <> 'distribuir' or responsavel_id is null);
  perform set_config('nexus.acao_atribuicao', '', true);
  perform set_config('nexus.atribuicao_por', '', true);
end $function$;

-- As atribuições manuais já feitas: a última entrada do histórico que levou o negócio ao responsável atual.
create or replace function public.core_marcar_posse_manual()
returns int language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v int;
begin
  with ult as (
    select distinct on (h.negocio_id) h.negocio_id, h.acao, h.para_responsavel, h.em
      from public.negocio_historico h
      join public.negocios x on x.id = h.negocio_id
     where x.status = 'aberto' and x.ativo and x.responsavel_id is not null and h.para_responsavel = x.responsavel_id
     order by h.negocio_id, h.id desc)
  update public.negocios n
     set dados = jsonb_set(n.dados, '{_lead}', coalesce(n.dados -> '_lead', '{}'::jsonb)
                 || jsonb_build_object('posse', jsonb_build_object('acao', u.acao, 'para', u.para_responsavel, 'em', u.em)))
    from ult u
   where n.id = u.negocio_id and u.acao in ('atribuir', 'transferir')
     and not (coalesce(n.dados -> '_lead', '{}'::jsonb) ? 'posse');
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.negocio_atribuir(bigint, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.negocio_atribuir(bigint, uuid, text, uuid) to service_role;
revoke all on function public.core_marcar_posse_manual() from public, anon, authenticated;
grant execute on function public.core_marcar_posse_manual() to service_role;

select public.core_marcar_posse_manual();
