-- Volta da 20261124000800_posvenda_chamado_com_negocio_aberto: devolve core_negocio_do_canal EXATAMENTE como a C5 (0700) a deixou (md5 sem CR 154dbf33...).
create or replace function public.core_negocio_do_canal(
  p_empresa bigint, p_contato bigint, p_filial bigint, p_primeira_msg text default null,
  p_so_existente boolean default false, p_origem text default null, p_origem_id text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_dias int; n record;
  v_janela int; v_hoje date; v_pv record;  -- pós-venda (C5)
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

  -- 1b. PÓS-VENDA (C5, 24/11/2026): só com o módulo ligado e só mensagem DO CLIENTE (a da loja não muda nada).
  --     Fica no pós-venda, sem abrir negócio, quando o contato (nesta loja) tem um CHAMADO ABERTO ou um
  --     ACOMPANHAMENTO PENDENTE vencido ou de hoje dentro de `posvenda.janela_acompanhamento_dias` (padrão 3).
  --     Passo FUTURO não segura: o cliente que escreve querendo comprar segue as regras abaixo e ganha negócio novo.
  if not coalesce(p_so_existente, false) and public.core_modulo_ligado(p_empresa, 'posvenda') then
    v_janela := greatest(coalesce(nullif(public.config_valor_emp(p_empresa, 'posvenda', 'janela_acompanhamento_dias', p_filial) #>> '{}', '')::int, 3), 0);
    v_hoje := public.posvenda_dia_local(p_empresa, now());

    select c.id, c.negocio_id into v_pv from public.posvenda_chamados c
      join public.posvenda_chamado_status s on s.id = c.status_id
     where c.empresa_id = p_empresa and c.contato_id = p_contato
       and (p_filial is null or c.filial_id is not distinct from p_filial)
       and c.resolvido_em is null and s.tipo <> 'resolvido'
     order by c.aberto_em desc, c.id desc limit 1;
    if v_pv.id is not null then
      v_negocio := coalesce(v_pv.negocio_id, (select n2.id from negocios n2 where n2.empresa_id = p_empresa and n2.contato_id = p_contato
                                               and (p_filial is null or n2.filial_id is not distinct from p_filial)
                                             order by n2.created_at desc, n2.id desc limit 1));
      if v_negocio is not null then
        -- mensagens seguidas viram um evento só
        if (select e.tipo from public.posvenda_chamado_eventos e where e.chamado_id = v_pv.id order by e.em desc, e.id desc limit 1)
           is distinct from 'cliente_respondeu' then
          insert into public.posvenda_chamado_eventos (empresa_id, chamado_id, tipo, texto)
          values (p_empresa, v_pv.id, 'cliente_respondeu', left(p_primeira_msg, 500));
        end if;
        return v_negocio;
      end if;
    end if;

    select a.id, a.negocio_id into v_pv from public.posvenda_acompanhamentos a
     where a.empresa_id = p_empresa and a.contato_id = p_contato
       and (p_filial is null or a.filial_id is not distinct from p_filial)
       and a.status = 'pendente'
       and public.posvenda_dia_local(p_empresa, a.previsto_para) between v_hoje - v_janela and v_hoje
     order by a.previsto_para desc, a.id desc limit 1;
    if v_pv.id is not null and v_pv.negocio_id is not null then
      update public.posvenda_acompanhamentos set cliente_respondeu_em = coalesce(cliente_respondeu_em, now()) where id = v_pv.id;
      return v_pv.negocio_id;
    end if;
  end if;

  -- 2. ganho recente (pós-venda) — arquivado ou não (23/11/2026, M1b)
  select coalesce((select (c.valor ->> 'pos_venda_dias')::int from configuracoes_sistema c
                    where c.empresa_id = p_empresa and c.chave = 'retorno_cliente'
                      and (c.valor ->> 'pos_venda_dias') ~ '^\d{1,3}$'), 30) into v_dias;
  select n2.id into v_negocio from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
     and n2.status = 'ganho' and n2.ganho_em >= now() - make_interval(days => v_dias)
   order by n2.ganho_em desc, n2.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  -- 3. o mais recente da loja
  select n2.* into n from negocios n2
   where n2.empresa_id = p_empresa and n2.contato_id = p_contato
     and (p_filial is null or n2.filial_id is not distinct from p_filial)
   order by n2.created_at desc, n2.id desc limit 1;
  if p_so_existente then return n.id; end if;

  -- 4. sem negócio na loja (ou o mais recente é uma VENDA FECHADA): cria um novo.
  --    O ganho fica como está — é a compra do cliente, não um card para reabrir.
  if n.id is null or n.status = 'ganho' then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg,
                                                                              'origem', p_origem, 'origem_id', p_origem_id))))
    returning id into v_negocio;
    if n.id is not null then
      insert into negocio_historico (empresa_id, negocio_id, para_etapa_id, acao, detalhe)
      values (p_empresa, v_negocio, v_etapa, 'novo_apos_ganho',
              jsonb_build_object('ganho_anterior', n.id, 'ganho_em', n.ganho_em));
    end if;
    return v_negocio;
  end if;

  -- 3. perdido ou arquivado: reabre o MESMO — primeiro o histórico com o fechamento, depois limpa
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
