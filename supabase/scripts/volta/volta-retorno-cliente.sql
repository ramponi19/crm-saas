-- Volta de 20261105001400_retorno_cliente_um_card.sql: devolve a core_negocio_do_canal de antes
-- (aberto ativo → senão reabre o mais recente → senão cria; sem pós-venda e sem `detalhe`).
-- A coluna negocio_historico.detalhe FICA: guarda o fechamento dos negócios já reabertos e é
-- lida pelos relatórios (lib/fechamentos.ts). Junto com a Edge de antes (volta-edge-v74 = v72).

create or replace function public.core_negocio_do_canal(p_empresa bigint, p_contato bigint, p_filial bigint,
  p_primeira_msg text default null, p_so_existente boolean default false, p_origem text default null, p_origem_id text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_etapa_antes bigint;
begin
  -- Duas mensagens do mesmo contato na mesma loja, sem negócio aberto, chegando juntas:
  -- a segunda espera a primeira e encontra o negócio que ela abriu.
  perform pg_advisory_xact_lock(hashtext('negocio:' || p_empresa || ':' || p_contato || ':' || coalesce(p_filial, -1)));

  select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;
  select n.id into v_negocio from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
     and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
   order by (n.funil_id is not distinct from v_funil) desc, n.created_at desc, n.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  select n.id, coalesce(n.funil_id, v_funil), n.etapa_id into v_negocio, v_funil_neg, v_etapa_antes
    from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
   order by n.created_at desc, n.id desc limit 1;
  if p_so_existente then return v_negocio; end if;

  if v_negocio is null then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg,
                                                                              'origem', p_origem, 'origem_id', p_origem_id))))
    returning id into v_negocio;
    return v_negocio;
  end if;

  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = v_negocio;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao)
  values (p_empresa, v_negocio, v_etapa_antes, coalesce(v_etapa, v_etapa_antes), 'reaberto_por_mensagem');
  return v_negocio;
end $function$;
