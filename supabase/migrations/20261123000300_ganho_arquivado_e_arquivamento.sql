-- M1b — GANHO ARQUIVADO CONTA NA JANELA DE PÓS-VENDA + ARQUIVAR VAI PARA O HISTÓRICO (23/11/2026).
--
-- 1. core_negocio_do_canal (passo 2, "ganho recente"): deixa de exigir `n2.ativo`. O negócio 581
--    foi convertido arquivado às 11h31 e a mensagem das 11h51 pulou o pós-venda (a regra antiga o
--    reabriu e apagou a venda; depois da M1 ele já não seria apagado, mas nasceria um negócio novo
--    em "Novo" para quem comprou 20 minutos antes). Agora o ganho dentro da janela recebe a mensagem
--    esteja ou não arquivado — arquivar tira o card do quadro, não muda que a pessoa comprou.
--    O resto da função é a M1 (20261123000200), sem mudança.
--
-- 2. negocios_arquivamento: arquivar e desarquivar (dados._lead.ativo, de onde sai a coluna gerada
--    `ativo`) passam a gravar 'arquivado' / 'desarquivado' em negocio_historico, com o usuário
--    (auth.uid(); nulo = sistema, ex.: a reabertura por mensagem ou a junção de negócios) e a data.
--    Até aqui arquivar não deixava rastro: não dava para saber quem arquivou o 581.
--
-- Volta: supabase/scripts/volta/volta-ganho-arquivado-e-arquivamento.sql.

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

-- ─── Arquivar / desarquivar no histórico ─────────────────────────────────────────────────────────
create or replace function public.core_negocio_arquivamento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.ativo is distinct from new.ativo then
    insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao, por_usuario, detalhe)
    values (new.empresa_id, new.id, new.etapa_id, new.etapa_id,
            case when new.ativo then 'desarquivado' else 'arquivado' end,
            auth.uid(),
            jsonb_build_object('status', new.status));
  end if;
  return null;
end $function$;

revoke all on function public.core_negocio_arquivamento() from public, anon, authenticated;

drop trigger if exists negocios_arquivamento on public.negocios;
create trigger negocios_arquivamento
  after update of dados on public.negocios
  for each row execute function public.core_negocio_arquivamento();
