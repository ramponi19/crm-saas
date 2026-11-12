-- VOLTA de 20261111000600_publicos. Voltar o APP antes (o app novo chama publicos_* e grava
-- automacoes/transmissoes.publico_id). Apaga os públicos e as automações "entrou no público" (com
-- as execuções delas, pela cascata de automacao_execucoes); as transmissões ficam, com o filtro
-- que usaram. A linha 'publicos' em empresa_modulos, se houver, fica órfã e inofensiva (a Central
-- lê o manifesto do app).
-- Corpo de volta: transmissao_publico (20261111000500_etiquetas), que volta a NÃO descartar
-- negócio inativo.

begin;

drop function if exists public.publicos_rodada();
drop function if exists public.transmissao_remontar(bigint);
drop function if exists public.publicos_previa(bigint, jsonb);
drop function if exists public.publicos_recalcular(bigint, boolean);

create or replace function public.transmissao_publico(p_empresa bigint, p_filial bigint, p_filtro jsonb, p_modelo bigint)
returns table (contato_id bigint, negocio_id bigint, nome text, telefone text, fora text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  f         jsonb := coalesce(p_filtro, '{}'::jsonb);
  v_funil   bigint := nullif(f ->> 'funil_id', '')::bigint;
  v_etapas  bigint[] := case when jsonb_typeof(f -> 'etapa_ids') = 'array' and jsonb_array_length(f -> 'etapa_ids') > 0
                         then array(select jsonb_array_elements_text(f -> 'etapa_ids')::bigint) end;
  v_sit     text[] := case when jsonb_typeof(f -> 'situacoes') = 'array' and jsonb_array_length(f -> 'situacoes') > 0
                         then array(select jsonb_array_elements_text(f -> 'situacoes')) end;
  v_orig    text[] := case when jsonb_typeof(f -> 'origens') = 'array' and jsonb_array_length(f -> 'origens') > 0
                         then array(select lower(jsonb_array_elements_text(f -> 'origens'))) end;
  v_etq_com bigint[] := case when jsonb_typeof(f -> 'etiquetas_com') = 'array' and jsonb_array_length(f -> 'etiquetas_com') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_com')::bigint) end;
  v_etq_sem bigint[] := case when jsonb_typeof(f -> 'etiquetas_sem') = 'array' and jsonb_array_length(f -> 'etiquetas_sem') > 0
                         then array(select jsonb_array_elements_text(f -> 'etiquetas_sem')::bigint) end;
  v_sem     int := nullif(f ->> 'sem_mensagem_ha_dias', '')::int;
  v_com     int := nullif(f ->> 'com_mensagem_nos_dias', '')::int;
begin
  return query
  with negs as (
    select distinct on (n.contato_id) n.contato_id, n.id as negocio_id
      from negocios n
      join contatos c on c.id = n.contato_id
     where n.empresa_id = p_empresa
       and (p_filial is null or n.filial_id = p_filial)
       and (v_funil is null or n.funil_id = v_funil)
       and (v_etapas is null or n.etapa_id = any (v_etapas))
       and (v_sit is null or n.status = any (v_sit))
       and (v_orig is null or lower(coalesce(c.origem, '')) = any (v_orig))
       and (v_etq_com is null or c.etiqueta_ids && v_etq_com)
       and (v_etq_sem is null or not (c.etiqueta_ids && v_etq_sem))
     order by n.contato_id, n.created_at desc, n.id desc
  ), com_msg as (
    select x.*, (select max(cv.ultima_mensagem_at) from conversas cv
                  where cv.empresa_id = p_empresa and cv.contato_id = x.contato_id
                    and (p_filial is null or cv.filial_id = p_filial or cv.filial_id is null)) as ultima
      from negs x
  )
  select m.contato_id, m.negocio_id, c.nome,
         nullif(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g'), ''),
         case
           when c.opt_out_em is not null then 'opt_out'
           when c.ativo = false then 'bloqueado'
           when length(regexp_replace(coalesce(nullif(c.telefone_e164, ''), c.telefone, ''), '\D', '', 'g')) < 10 then 'sem_telefone'
           when p_modelo is not null and (
                  exists (select 1 from transmissao_envios e
                           where e.contato_id = m.contato_id and e.modelo_id = p_modelo and e.status = 'enviada'
                             and e.enviada_em > now() - interval '7 days')
               or exists (select 1 from automacao_execucoes a
                           where a.contato_id = m.contato_id and a.modelo_id = p_modelo and a.acao = 'enviar_modelo'
                             and a.status = 'executada' and a.executada_em > now() - interval '7 days'))
             then 'modelo_7_dias'
         end
    from com_msg m
    join contatos c on c.id = m.contato_id
   where (v_sem is null or m.ultima is null or m.ultima < now() - make_interval(days => v_sem))
     and (v_com is null or (m.ultima is not null and m.ultima >= now() - make_interval(days => v_com)));
end $$;
revoke all on function public.transmissao_publico(bigint, bigint, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.transmissao_publico(bigint, bigint, jsonb, bigint) to service_role;

drop function if exists public.publicos_resolver(bigint, bigint, jsonb);

delete from public.automacoes where gatilho = 'entrou_no_publico';
alter table public.automacoes drop constraint if exists automacoes_publico_check;
drop index if exists public.automacoes_publico_idx;
alter table public.automacoes drop column if exists publico_id;
alter table public.automacoes drop constraint if exists automacoes_gatilho_check;
alter table public.automacoes add constraint automacoes_gatilho_check
  check (gatilho = any (array['entrou_na_etapa', 'parado_x_horas', 'recebeu_etiqueta']));

drop index if exists public.transmissoes_publico_idx;
alter table public.transmissoes drop column if exists publico_id;

drop table if exists public.publicos_membros;
drop table if exists public.publicos;

commit;
