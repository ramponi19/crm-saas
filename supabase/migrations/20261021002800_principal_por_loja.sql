-- =====================================================================================
-- O NEGÓCIO PRINCIPAL É POR CONTATO E LOJA.
--
-- O QUE O LUCAS VIU (20/10/2026, 20:14): mandou "Teste" para o WhatsApp de Mogi e para o de
-- Jaguariúna; as duas mensagens caíram no mesmo card, o de Mogi (negócio 3598). O card de
-- Jaguariúna (3548) ficou sem a conversa dele.
--
-- AS TRÊS PEÇAS:
--   1. leads e lead_mensagens escolhiam UM principal por contato (ativo mais recente, sem olhar a
--      loja). Contato com negócio nas duas lojas tinha as conversas das duas num card só.
--   2. O gatilho core_filial_do_contato completava a loja de mensagem/conversa pela loja do
--      CONTATO. A Edge não manda filial_id, então a mensagem do canal de Jaguariúna nascia "de
--      Mogi" (274137). Em produção: 24 conversas e 107 mensagens com loja diferente da do canal.
--   3. core_negocio_do_canal devolvia null quando o contato não tinha negócio na loja do canal.
--
-- A REGRA (decisão do Lucas): mensagem de conversa cujo canal é da loja X vai para o negócio ativo
-- mais recente do contato na loja X; sem negócio naquela loja, core_negocio_do_canal cria. Badge e
-- última mensagem seguem a mesma regra. A loja da mensagem é a do canal; mensagem sem canal (o
-- histórico de antes dos canais) fica com a loja do lead de onde veio.
--
-- Volta: supabase/scripts/limpeza/volta-principal-por-loja.sql (a loja antiga das linhas
-- corrigidas fica em ops.volta_filial_20261020).
-- =====================================================================================

-- 1. A loja antiga das linhas que esta migração corrige (para a volta).
create table if not exists ops.volta_filial_20261020 (
  tabela       text   not null,
  id           bigint not null,
  filial_antes bigint,
  primary key (tabela, id)
);
revoke all on ops.volta_filial_20261020 from public, anon, authenticated;

insert into ops.volta_filial_20261020 (tabela, id, filial_antes)
select 'conversas', cv.id, cv.filial_id
  from public.conversas cv join public.canais ca on ca.id = cv.canal_id
 where ca.filial_id is not null and cv.filial_id is distinct from ca.filial_id
on conflict do nothing;

insert into ops.volta_filial_20261020 (tabela, id, filial_antes)
select 'mensagens', m.id, m.filial_id
  from public.mensagens m join public.canais ca on ca.id = m.canal_id
 where ca.filial_id is not null and m.filial_id is distinct from ca.filial_id
on conflict do nothing;

-- 2. Mensagem e conversa de canal têm a loja do canal. Contato e filial_gravacao só completam o
--    que o canal não diz (canal da rede, sem loja, ou linha sem canal).
create or replace function public.core_filial_do_canal()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_loja bigint;
begin
  if new.canal_id is not null then
    select c.filial_id into v_loja from canais c where c.id = new.canal_id;
    if v_loja is not null then
      new.filial_id := v_loja;
    end if;
  end if;
  if new.filial_id is null and new.contato_id is not null then
    select c.filial_id into new.filial_id from contatos c where c.id = new.contato_id;
  end if;
  if new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $$;
revoke execute on function public.core_filial_do_canal() from public, anon, authenticated;
grant execute on function public.core_filial_do_canal() to service_role;

drop trigger if exists mensagens_filial_do_contato on public.mensagens;
drop trigger if exists conversas_filial_do_contato on public.conversas;
drop trigger if exists mensagens_filial_do_canal on public.mensagens;
drop trigger if exists conversas_filial_do_canal on public.conversas;
create trigger mensagens_filial_do_canal before insert or update of canal_id on public.mensagens
  for each row execute function public.core_filial_do_canal();
create trigger conversas_filial_do_canal before insert or update of canal_id on public.conversas
  for each row execute function public.core_filial_do_canal();

-- 3. Corrige as linhas que nasceram com a loja do contato.
update public.conversas cv set filial_id = ca.filial_id
  from public.canais ca
 where ca.id = cv.canal_id and ca.filial_id is not null and cv.filial_id is distinct from ca.filial_id;

update public.mensagens m set filial_id = ca.filial_id
  from public.canais ca
 where ca.id = m.canal_id and ca.filial_id is not null and m.filial_id is distinct from ca.filial_id;

-- 4. core_negocio_do_canal: o aberto da loja; senão reabre o mais recente da loja; senão CRIA, no
--    funil padrão, etapa inicial. p_so_existente = true (mensagem ENVIADA pela loja) não reabre nem
--    cria: um recibo do PDV não pode reabrir o lead de quem acabou de comprar, nem abrir card novo.
drop function if exists public.core_negocio_do_canal(bigint, bigint, bigint);
create or replace function public.core_negocio_do_canal(
  p_empresa bigint, p_contato bigint, p_filial bigint,
  p_primeira_msg text default null, p_so_existente boolean default false)
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
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
  if p_so_existente then return v_negocio; end if;

  if v_negocio is null then
    select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
    insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
    values (p_empresa, p_filial, p_contato, v_funil, v_etapa, 'aberto',
            jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', p_primeira_msg))))
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
end $$;
revoke execute on function public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.core_negocio_do_canal(bigint, bigint, bigint, text, boolean) to service_role;

-- 5. compat_leads_iud (o webhook inserindo pela view leads): o negócio que core_negocio_do_canal
--    cria agora leva a primeira mensagem. Troca exatamente uma chamada.
do $$
declare
  v_def text := pg_get_functiondef('public.compat_leads_iud()'::regprocedure);
  v_de  text := 'core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id)';
  v_para text := 'core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id, new.primeira_msg)';
begin
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'compat_leads_iud: esperava 1 chamada de core_negocio_do_canal';
  end if;
  execute replace(v_def, v_de, v_para);
end $$;

-- 6. mensagem_registrar: a loja é a do canal, e o contato sempre tem negócio na loja do canal.
create or replace function public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
  returns bigint
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  d           jsonb := coalesce(p_dados, '{}'::jsonb);
  v_negocio   bigint := nullif(d ->> 'lead_id', '')::bigint;
  v_filial    bigint := nullif(d ->> 'filial_id', '')::bigint;
  v_ident     text := nullif(d ->> 'identidade', '');
  v_enviada   boolean := coalesce(d ->> 'direcao', '') <> 'recebida';
  v_canal_tipo   text;
  v_canal_filial bigint;
  v_tipo      text;
  v_contato   bigint;
  v_resp      uuid;
  v_conversa  bigint;
  v_e164      text;
  v_id        bigint;
  v_lead_filial bigint;
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
  -- A loja da mensagem é a do canal; filial_id do chamador só vale para canal sem loja.
  v_filial := coalesce(v_canal_filial, v_filial);

  if v_negocio is not null then
    select n.contato_id, n.filial_id, n.responsavel_id into v_contato, v_lead_filial, v_resp
      from negocios n where n.id = v_negocio and n.empresa_id = p_empresa;
    if v_contato is null then
      raise exception 'mensagem_registrar: lead % não é da empresa %', v_negocio, p_empresa using errcode = '42501';
    end if;
    v_filial := coalesce(v_filial, v_lead_filial);
    -- Lead de outra loja que o canal: a mensagem é da loja do canal, e o contato tem de ter
    -- negócio nela, senão a conversa não aparece em card nenhum (lead_mensagens é por loja).
    if v_canal_filial is not null and v_lead_filial is distinct from v_canal_filial then
      perform core_negocio_do_canal(p_empresa, v_contato, v_canal_filial, d ->> 'conteudo', v_enviada);
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
        values (p_empresa, v_filial, coalesce(nullif(d ->> 'nome', ''), v_ident),
                case when v_tipo = 'whatsapp' then v_ident end, v_e164, nullif(d ->> 'instagram', ''), v_tipo, v_ident)
        returning id into v_contato;
      end if;
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (p_empresa, v_contato, v_tipo, v_ident, p_canal_id) on conflict do nothing;
    end if;

    -- O negócio do contato NA LOJA DO CANAL: o aberto, ou reabre o mais recente, ou cria
    -- (core_negocio_do_canal). Mensagem enviada pela loja só usa o que existe.
    v_negocio := core_negocio_do_canal(p_empresa, v_contato, v_filial, d ->> 'conteudo', v_enviada);
    if v_negocio is not null then
      select coalesce(v_filial, n.filial_id), n.responsavel_id into v_filial, v_resp from negocios n where n.id = v_negocio;
    end if;
  end if;

  select id into v_conversa from conversas
   where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
  if v_conversa is null then
    insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
    values (p_empresa, v_filial, v_contato, p_canal_id, v_resp)
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
  values (p_empresa, v_filial, v_conversa, v_contato, d ->> 'direcao',
          coalesce(d ->> 'conteudo', ''), coalesce(nullif(d ->> 'tipo', ''), 'texto'), v_tipo, p_external_id,
          d ->> 'midia_url', (d ->> 'midia_retida_em')::timestamptz, d ->> 'transcricao', d ->> 'status_entrega',
          (d ->> 'status_em')::timestamptz, d ->> 'erro_envio', coalesce((d ->> 'lida')::boolean, false),
          (d ->> 'usuario_id')::uuid, p_canal_id, coalesce((d ->> 'created_at')::timestamptz, now()))
  on conflict (external_id) where external_id is not null do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.mensagem_registrar(bigint, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.mensagem_registrar(bigint, bigint, text, jsonb) to service_role;

-- 7. As views: principal, badge, última mensagem e mensagens por CONTATO E LOJA.
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
          WHERE x.contato_id = n.contato_id AND x.filial_id IS NOT DISTINCT FROM n.filial_id
            AND n.id = (( SELECT p.id
                   FROM negocios p
                  WHERE p.contato_id = n.contato_id AND p.filial_id IS NOT DISTINCT FROM n.filial_id
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
     JOIN mensagens m ON m.contato_id = n.contato_id AND m.filial_id IS NOT DISTINCT FROM n.filial_id
  WHERE n.id = (( SELECT p.id
           FROM negocios p
          WHERE p.contato_id = n.contato_id AND p.filial_id IS NOT DISTINCT FROM n.filial_id
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
          WHERE p.contato_id = m.contato_id AND p.filial_id IS NOT DISTINCT FROM m.filial_id));
