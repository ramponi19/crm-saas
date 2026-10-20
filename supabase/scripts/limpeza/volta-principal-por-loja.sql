-- VOLTA da migração 20261021002800_principal_por_loja (20/10/2026 noite).
-- Devolve as views leads e lead_mensagens, core_negocio_do_canal (3 argumentos), mensagem_registrar,
-- compat_leads_iud e o gatilho de filial EXATAMENTE como estavam em produção antes dela (gerado da
-- cópia crm_1042, com md5 conferido contra produção; as views batem byte a byte, as funções só
-- diferem no fim de linha — CRLF do original virou LF), e a loja antiga das conversas/mensagens
-- corrigidas (guardada em ops.volta_filial_20261020). Rodar com psql, numa transação só.
-- Ensaiada em 20/10 na cópia: devolve views, funções, gatilhos, assinatura de 3 argumentos e
-- grants (anon 0 / authenticated 22).
\set ON_ERROR_STOP 1
begin;
create or replace view public.leads as
 SELECT n.id,
    c.nome,
    c.telefone,
    c.instagram,
    c.origem,
    COALESCE(e.slug, (n.dados -> '_lead'::text) ->> 'kanban_status'::text) AS kanban_status,
    n.responsavel_id,
    ((n.dados -> '_lead'::text) ->> 'convertido_em'::text)::bigint AS convertido_em,
    c.observacoes,
    n.created_at,
    c.origem_id,
    COALESCE(((n.dados -> '_lead'::text) ->> 'ativo'::text)::boolean, true) AS ativo,
    (n.dados -> '_lead'::text) ->> 'primeira_msg'::text AS primeira_msg,
    COALESCE(cv.nao_lidas, 0::bigint)::integer AS msgs_nao_lidas,
    ((n.dados -> '_lead'::text) ->> 'ultima_tratativa'::text)::timestamp with time zone AS ultima_tratativa,
    n.entrou_etapa_em AS data_transferencia_funil,
    cv.ultima_mensagem_at,
    n.dados ->> 'produto_interessado'::text AS produto_interessado,
    n.ordem AS kanban_ordem,
    n.empresa_id,
    n.valor_estimado,
    n.motivo_perda_id,
    n.perdido_em,
    n.funil_id,
    n.dados -> '_interesse'::text AS interesse,
    c.foto_url,
    ((n.dados -> '_lead'::text) ->> 'responsavel_desde'::text)::timestamp with time zone AS responsavel_desde,
    n.devolvido_em,
    n.devolucoes,
    cv.ultima_recebida_at,
    cv.ultima_enviada_at,
    n.dados -> '_anuncio'::text AS anuncio,
    n.filial_id
   FROM negocios n
     JOIN contatos c ON c.id = n.contato_id
     LEFT JOIN funil_etapas e ON e.id = n.etapa_id
     LEFT JOIN LATERAL ( SELECT sum(x.nao_lidas) AS nao_lidas,
            max(x.ultima_mensagem_at) AS ultima_mensagem_at,
            max(x.ultima_recebida_at) AS ultima_recebida_at,
            max(x.ultima_enviada_at) AS ultima_enviada_at
           FROM conversas x
          WHERE x.contato_id = n.contato_id AND n.id = (( SELECT p.id
                   FROM negocios p
                  WHERE p.contato_id = n.contato_id
                  ORDER BY (COALESCE(((p.dados -> '_lead'::text) ->> 'ativo'::text)::boolean, true)) DESC, p.created_at DESC, p.id DESC
                 LIMIT 1))) cv ON true;

create or replace view public.lead_mensagens as
 SELECT m.id,
    n.id AS lead_id,
    m.direcao,
    m.conteudo,
    m.origem,
    m.lida,
    m.created_at,
    m.empresa_id,
    m.external_id,
    m.tipo,
    m.midia_url,
    m.status_entrega,
    m.erro_envio,
    m.status_em,
    m.usuario_id,
    m.filial_id,
    m.canal_id,
    m.transcricao,
    m.midia_retida_em
   FROM negocios n
     JOIN mensagens m ON m.contato_id = n.contato_id
  WHERE n.id = (( SELECT p.id
           FROM negocios p
          WHERE p.contato_id = n.contato_id
          ORDER BY (COALESCE(((p.dados -> '_lead'::text) ->> 'ativo'::text)::boolean, true)) DESC, p.created_at DESC, p.id DESC
         LIMIT 1))
UNION ALL
 SELECT m.id,
    NULL::bigint AS lead_id,
    m.direcao,
    m.conteudo,
    m.origem,
    m.lida,
    m.created_at,
    m.empresa_id,
    m.external_id,
    m.tipo,
    m.midia_url,
    m.status_entrega,
    m.erro_envio,
    m.status_em,
    m.usuario_id,
    m.filial_id,
    m.canal_id,
    m.transcricao,
    m.midia_retida_em
   FROM mensagens m
  WHERE m.contato_id IS NULL OR NOT (EXISTS ( SELECT 1
           FROM negocios p
          WHERE p.contato_id = m.contato_id));

drop function if exists public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean);
CREATE OR REPLACE FUNCTION public.core_negocio_do_canal(p_empresa bigint, p_contato bigint, p_filial bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_etapa_antes bigint;
begin
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
  if v_negocio is null then return null; end if;

  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = v_negocio;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao)
  values (p_empresa, v_negocio, v_etapa_antes, coalesce(v_etapa, v_etapa_antes), 'reaberto_por_mensagem');
  return v_negocio;
end $function$
;

CREATE OR REPLACE FUNCTION public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d           jsonb := coalesce(p_dados, '{}'::jsonb);
  v_negocio   bigint := nullif(d ->> 'lead_id', '')::bigint;
  v_filial    bigint := nullif(d ->> 'filial_id', '')::bigint;
  v_ident     text := nullif(d ->> 'identidade', '');
  v_canal_tipo   text;
  v_canal_filial bigint;
  v_tipo      text;
  v_contato   bigint;
  v_resp      uuid;
  v_conversa  bigint;
  v_e164      text;
  v_id        bigint;
  v_funil       bigint;
  v_etapa       bigint;
begin
  if p_external_id is not null and exists (select 1 from mensagens where external_id = p_external_id) then
    return null;
  end if;
  if p_canal_id is not null then
    select tipo, filial_id into v_canal_tipo, v_canal_filial from canais where id = p_canal_id and empresa_id = p_empresa;
    if not found then
      raise exception 'mensagem_registrar: canal % não é da empresa %', p_canal_id, p_empresa using errcode = '42501';
    end if;
  end if;
  v_tipo := coalesce(nullif(d ->> 'origem', ''), v_canal_tipo);

  if v_negocio is not null then
    select n.contato_id, coalesce(v_filial, n.filial_id), n.responsavel_id into v_contato, v_filial, v_resp
      from negocios n where n.id = v_negocio and n.empresa_id = p_empresa;
    if v_contato is null then
      raise exception 'mensagem_registrar: lead % não é da empresa %', v_negocio, p_empresa using errcode = '42501';
    end if;
  else
    if v_ident is null or v_tipo is null then
      raise exception 'mensagem_registrar: informe lead_id, ou identidade com origem/canal' using errcode = '23502';
    end if;
    select contato_id into v_contato from contato_identidades
     where empresa_id = p_empresa and canal_tipo = v_tipo and external_id = v_ident;
    if v_contato is null then
      v_e164 := case when v_tipo = 'whatsapp' then core_telefone_e164(v_ident) end;
      if v_e164 is not null then
        select id into v_contato from contatos where empresa_id = p_empresa and telefone_e164 = v_e164;
      end if;
      if v_contato is null then
        insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, origem, origem_id)
        values (p_empresa, coalesce(v_filial, v_canal_filial), coalesce(nullif(d ->> 'nome', ''), v_ident),
                case when v_tipo = 'whatsapp' then v_ident end, v_e164, nullif(d ->> 'instagram', ''), v_tipo, v_ident)
        returning id into v_contato;
      end if;
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (p_empresa, v_contato, v_tipo, v_ident, p_canal_id) on conflict do nothing;
    end if;

    -- O negócio do contato sem duplicar: usa o aberto ou reabre o mais recente DA LOJA do canal
    -- (core_negocio_do_canal); só sem nenhum cria um, no funil do canal, etapa inicial.
    v_negocio := core_negocio_do_canal(p_empresa, v_contato, coalesce(v_filial, v_canal_filial));
    if v_negocio is null then
      select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;
      select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
      insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
      values (p_empresa, coalesce(v_filial, v_canal_filial), v_contato, v_funil, v_etapa, 'aberto',
              jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', d ->> 'conteudo'))))
      returning id into v_negocio;
    end if;
    select coalesce(v_filial, n.filial_id), n.responsavel_id into v_filial, v_resp from negocios n where n.id = v_negocio;
  end if;

  select id into v_conversa from conversas
   where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
  if v_conversa is null then
    insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
    values (p_empresa, coalesce(v_filial, v_canal_filial), v_contato, p_canal_id, v_resp)
    on conflict on constraint conversas_contato_canal_key do nothing
    returning id into v_conversa;
    if v_conversa is null then
      select id into v_conversa from conversas
       where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
    end if;
  end if;

  insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id,
                         midia_url, midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id,
                         canal_id, created_at)
  values (p_empresa, nullif(d ->> 'filial_id', '')::bigint, v_conversa, v_contato, d ->> 'direcao',
          coalesce(d ->> 'conteudo', ''), coalesce(nullif(d ->> 'tipo', ''), 'texto'), v_tipo, p_external_id,
          d ->> 'midia_url', (d ->> 'midia_retida_em')::timestamptz, d ->> 'transcricao', d ->> 'status_entrega',
          (d ->> 'status_em')::timestamptz, d ->> 'erro_envio', coalesce((d ->> 'lida')::boolean, false),
          (d ->> 'usuario_id')::uuid, p_canal_id, coalesce((d ->> 'created_at')::timestamptz, now()))
  on conflict (external_id) where external_id is not null do nothing
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.compat_leads_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contato bigint; v_negocio bigint; v_e164 text; e record; v_status text; v_dados jsonb;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    select contato_id into v_contato from negocios where id = old.id;
    delete from negocios where id = old.id;
    if v_contato is not null and not exists (select 1 from negocios where contato_id = v_contato) then
      if exists (select 1 from contatos where id = v_contato and dados ? '_cliente') then
        delete from conversas where contato_id = v_contato;
      else
        delete from contatos where id = v_contato;
      end if;
    end if;
    return old;
  end if;

  perform compat_guarda(new.empresa_id);
  v_e164 := core_telefone_e164(new.telefone);
  select * into e from compat_etapa(new.empresa_id, new.funil_id, coalesce(new.kanban_status, 'novo'));
  v_status := case when e.tipo = 'ganho' then 'ganho' when e.tipo = 'perdido' then 'perdido'
                   when e.etapa_id is null and new.perdido_em is not null then 'perdido' else 'aberto' end;
  v_dados := jsonb_strip_nulls(jsonb_build_object('produto_interessado', nullif(new.produto_interessado, ''),
               '_interesse', new.interesse, '_anuncio', new.anuncio));

  if tg_op = 'INSERT' then
    if v_e164 is not null then
      select id into v_contato from contatos where empresa_id = new.empresa_id and telefone_e164 = v_e164;
    end if;
    if v_contato is null and new.origem is not null and new.origem_id is not null then
      select contato_id into v_contato from contato_identidades
       where empresa_id = new.empresa_id and canal_tipo = new.origem and external_id = new.origem_id;
    end if;
    if v_contato is null then
      insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, foto_url, origem, origem_id,
                            responsavel_id, responsavel_desde, ativo, observacoes)
      values (new.empresa_id, new.filial_id, new.nome, new.telefone, v_e164, new.instagram, new.foto_url, new.origem, new.origem_id,
              new.responsavel_id, new.responsavel_desde, true, new.observacoes)
      returning id into v_contato;
    end if;
    if new.origem is not null and new.origem_id is not null then
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id)
      values (new.empresa_id, v_contato, new.origem, new.origem_id) on conflict do nothing;
    end if;
    -- Lead que vem de CANAL (o webhook não achou lead ativo e insere um): usa o negócio aberto
    -- ou reabre o do contato nesta loja, em vez de abrir outro (core_negocio_do_canal). Lead
    -- criado à mão (outra origem) continua criando negócio novo: é decisão de quem cadastrou.
    if new.origem in ('whatsapp', 'instagram', 'messenger') and new.origem_id is not null then
      v_negocio := core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id);
      if v_negocio is not null then
        if new.anuncio is not null then
          update negocios set dados = dados || jsonb_build_object('_anuncio', new.anuncio) where id = v_negocio;
        end if;
        select l.* into new from public.leads l where l.id = v_negocio;
        return new;
      end if;
    end if;
    insert into negocios (id, empresa_id, filial_id, contato_id, funil_id, etapa_id, ordem, valor_estimado, responsavel_id, status,
                          motivo_perda_id, perdido_em, entrou_etapa_em, devolucoes, devolvido_em, dados, created_at)
    values (coalesce(new.id, nextval(pg_get_serial_sequence('public.negocios', 'id'))), new.empresa_id, new.filial_id, v_contato,
            e.funil_id, e.etapa_id, coalesce(new.kanban_ordem, 0), new.valor_estimado, new.responsavel_id, v_status,
            new.motivo_perda_id, new.perdido_em, coalesce(new.data_transferencia_funil, now()), coalesce(new.devolucoes, 0),
            new.devolvido_em,
            v_dados || jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object(
              'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
              'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
              'kanban_status', case when e.etapa_id is null then coalesce(new.kanban_status, 'novo') end))),
            coalesce(new.created_at, now()))
    returning id into v_negocio;
  else
    v_negocio := old.id;
    select contato_id into v_contato from negocios where id = old.id;
    update contatos set nome = new.nome, telefone = new.telefone,
           telefone_e164 = case when v_e164 is null or not exists (select 1 from contatos x where x.empresa_id = new.empresa_id
                                                                     and x.telefone_e164 = v_e164 and x.id <> v_contato)
                                then v_e164 else telefone_e164 end,
           instagram = new.instagram, foto_url = new.foto_url, origem = new.origem, origem_id = new.origem_id,
           observacoes = new.observacoes
     where id = v_contato
       and (nome, telefone, instagram, foto_url, origem, origem_id, observacoes)
           is distinct from (new.nome, new.telefone, new.instagram, new.foto_url, new.origem, new.origem_id, new.observacoes);
    update negocios n set
      funil_id = e.funil_id, etapa_id = e.etapa_id, ordem = coalesce(new.kanban_ordem, 0), valor_estimado = new.valor_estimado,
      responsavel_id = new.responsavel_id, status = v_status, motivo_perda_id = new.motivo_perda_id, perdido_em = new.perdido_em,
      entrou_etapa_em = case when new.data_transferencia_funil is distinct from old.data_transferencia_funil
                             then new.data_transferencia_funil else n.entrou_etapa_em end,
      devolucoes = coalesce(new.devolucoes, 0), devolvido_em = new.devolvido_em, filial_id = new.filial_id,
      dados = (n.dados - 'produto_interessado' - '_interesse' - '_anuncio') || v_dados
              || jsonb_build_object('_lead', coalesce(n.dados -> '_lead', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                   'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
                   'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
                   'kanban_status', case when e.etapa_id is null then new.kanban_status end)))
     where n.id = old.id;
  end if;
  select l.* into new from public.leads l where l.id = v_negocio;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.core_filial_do_contato()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.filial_id is null and new.contato_id is not null then
    select c.filial_id into new.filial_id from contatos c where c.id = new.contato_id;
  end if;
  if new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $function$
;

revoke execute on function public.core_negocio_do_canal(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.core_negocio_do_canal(bigint, bigint, bigint) to service_role;

drop trigger if exists mensagens_filial_do_canal on public.mensagens;
drop trigger if exists conversas_filial_do_canal on public.conversas;
create trigger mensagens_filial_do_contato before insert on public.mensagens for each row execute function public.core_filial_do_contato();
create trigger conversas_filial_do_contato before insert on public.conversas for each row execute function public.core_filial_do_contato();
drop function if exists public.core_filial_do_canal();

-- a loja antiga das linhas corrigidas
update public.conversas c set filial_id = v.filial_antes from ops.volta_filial_20261020 v where v.tabela = 'conversas' and v.id = c.id;
update public.mensagens m set filial_id = v.filial_antes from ops.volta_filial_20261020 v where v.tabela = 'mensagens' and v.id = m.id;
commit;
