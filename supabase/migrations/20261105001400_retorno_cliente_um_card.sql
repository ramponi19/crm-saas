-- O cliente que volta: UM card por contato por loja, nunca outro (decisão do Matheus, 05/11/2026).
--
-- core_negocio_do_canal (chamada pela mensagem_registrar por identidade, pela Edge e pelo
-- criarLead de canal), com a mesma trava por contato+loja contra entregas simultâneas:
--   1. negócio ABERTO e ativo em qualquer funil (inclusive um funil interno, como o Time JM):
--      recebe, sem mover. O do funil padrão primeiro, depois o mais novo;
--   2. GANHO e ativo há até N dias: recebe, sem mover (pós-venda). N = configuracoes_sistema
--      `retorno_cliente.pos_venda_dias` da empresa (tela Configurações › SLA), padrão 30;
--   3. senão, o negócio MAIS RECENTE da loja (ganho mais antigo, perdido ou zerado do funil) é
--      o MESMO que volta: para a primeira etapa do SEU funil, ativo, sem os campos de
--      fechamento. ANTES, o negocio_historico ('reaberto_por_mensagem') guarda em `detalhe`
--      o status anterior, ganho_em, perdido_em, motivo_perda_id e valor_estimado — é por ele
--      (mais `vendas`) que os relatórios de ganhos, perdas e conversão contam (lib/fechamentos.ts);
--   4. sem negócio na loja: cria na primeira etapa do funil padrão.
--   Mensagem ENVIADA (p_so_existente: echo, envio) nunca reabre nem cria: usa 1, 2 ou o mais recente.
--
-- Volta: supabase/scripts/volta/volta-retorno-cliente.sql.

alter table public.negocio_historico add column if not exists detalhe jsonb;
comment on column public.negocio_historico.detalhe is
  'Estado do negócio antes da ação. Em reaberto_por_mensagem: status, ganho_em, perdido_em, motivo_perda_id, valor_estimado, ativo.';

create or replace function public.core_negocio_do_canal(p_empresa bigint, p_contato bigint, p_filial bigint,
  p_primeira_msg text default null, p_so_existente boolean default false, p_origem text default null, p_origem_id text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_dias int; n record;
begin
  -- Duas mensagens do mesmo contato na mesma loja chegando juntas: a segunda espera a
  -- primeira e encontra o negócio que ela abriu ou reabriu.
  perform pg_advisory_xact_lock(hashtext('negocio:' || p_empresa || ':' || p_contato || ':' || coalesce(p_filial, -1)));

  select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;

  -- 1. aberto e ativo, em qualquer funil
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'aberto' and n2.ativo
   order by (n2.funil_id is not distinct from v_funil) desc, n2.created_at desc, n2.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  -- 2. ganho recente (pós-venda)
  select coalesce((select (c.valor ->> 'pos_venda_dias')::int from configuracoes_sistema c
                    where c.empresa_id = p_empresa and c.chave = 'retorno_cliente'
                      and (c.valor ->> 'pos_venda_dias') ~ '^\d{1,3}$'), 30) into v_dias;
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'ganho' and n2.ativo and n2.ganho_em >= now() - make_interval(days => v_dias)
   order by n2.ganho_em desc, n2.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  -- 3. o mais recente da loja
  select n2.* into n from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
   order by n2.created_at desc, n2.id desc limit 1;
  if p_so_existente then return n.id; end if;

  -- 4. sem negócio na loja: cria
  if n.id is null then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg,
                                                                              'origem', p_origem, 'origem_id', p_origem_id))))
    returning id into v_negocio;
    return v_negocio;
  end if;

  -- 3. reabre o MESMO: primeiro o histórico com o fechamento, depois limpa
  v_funil_neg := coalesce(n.funil_id, v_funil);
  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, detalhe)
  values (p_empresa, n.id, n.etapa_id, coalesce(v_etapa, n.etapa_id), 'reaberto_por_mensagem',
          jsonb_strip_nulls(jsonb_build_object('status', n.status, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                                               'motivo_perda_id', n.motivo_perda_id, 'valor_estimado', n.valor_estimado,
                                               'ativo', n.ativo)));
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = n.id;
  return n.id;
end $function$;
