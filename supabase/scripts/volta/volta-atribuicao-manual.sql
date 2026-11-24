-- Volta da 20261124001500_atribuicao_manual: negocio_atribuir como estava (a marca _lead.posse fica, sem efeito).
create or replace function public.negocio_atribuir(p_negocio bigint, p_responsavel uuid, p_acao text, p_por uuid default null)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_acao not in ('pegar', 'devolver', 'transferir', 'atribuir', 'distribuir') then
    raise exception 'negocio_atribuir: ação inválida %', p_acao using errcode = '22023';
  end if;
  perform set_config('nexus.acao_atribuicao', p_acao, true);
  perform set_config('nexus.atribuicao_por', coalesce(p_por::text, ''), true);
  -- responsavel_desde é o marco do prazo de devolução à esteira e mora em dados._lead.
  -- Sem responsável, o marco antigo fica (era assim pela view: jsonb_strip_nulls).
  update public.negocios
     set responsavel_id = p_responsavel,
         dados = case when p_responsavel is null then dados
                      else jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb)
                                     || jsonb_build_object('responsavel_desde', now())) end
   where id = p_negocio
     and (p_acao <> 'distribuir' or responsavel_id is null);
  perform set_config('nexus.acao_atribuicao', '', true);
  perform set_config('nexus.atribuicao_por', '', true);
end $function$;
drop function if exists public.core_marcar_posse_manual();
