-- Distribuição só atribui negócio AINDA sem dono (porte do 58d7d3f, auditoria de 16/10).
--
-- lib/distribuicao.ts lê responsavel_id, escolhe alguém e chama negocio_atribuir(...,
-- 'distribuir'). Entre a leitura e a escrita, outra distribuição (a esteira do admin
-- rodando junto com a do cadastro) ou alguém pegando o lead à mão pode já tê-lo
-- atribuído; o update incondicional trocava o dono e gravava duas atribuições no
-- histórico. Agora 'distribuir' só grava se responsavel_id é nulo (claim atômico); as
-- outras ações (pegar, devolver, transferir, atribuir) seguem como estavam.
-- Quem chama relê o negócio e devolve o dono real quando perdeu a corrida.
-- Volta: supabase/scripts/volta/volta-distribuir-so-sem-dono.sql
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
