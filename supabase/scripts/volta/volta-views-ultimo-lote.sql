-- Volta de 20261105001300_drop_views_ultimo_lote.sql: recria as views leads, lead_mensagens,
-- v_leads_nao_lidas, core_v_planos e v_empresas_plano, os gatilhos INSTEAD OF (compat_leads,
-- compat_lead_mensagens), as funções compat_* e as quatro mortas, com os grants e os defaults
-- lidos da produção em 05/11/2026. compat_leads_iud é o corpo da PRODUÇÃO (o do Supabase local
-- difere). Junto com o Instant Rollback do app para antes do último lote; a Edge v72 grava sem
-- as views e não precisa voltar (a v71 também funciona com elas de pé).
begin;

CREATE OR REPLACE FUNCTION public.compat_etapa(p_empresa bigint, p_funil bigint, p_slug text, OUT funil_id bigint, OUT etapa_id bigint, OUT tipo text)
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with f as (select coalesce(p_funil, (select id from funis where empresa_id = p_empresa and padrao and not interno order by id limit 1)) id)
  select f.id, e.id, e.tipo from f left join funil_etapas e on e.funil_id = f.id and e.slug = p_slug $function$
;

CREATE OR REPLACE FUNCTION public.compat_guarda(p_empresa bigint)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is not null and p_empresa is distinct from get_empresa_id() then
    raise exception 'empresa fora da sessão' using errcode = '42501';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.compat_lead_mensagens_iud()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_contato bigint; v_conversa bigint; v_id bigint; n record;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    delete from mensagens where id = old.id;
    return old;
  end if;
  perform compat_guarda(new.empresa_id);
  if tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id or new.canal_id is distinct from old.canal_id then
    select * into n from negocios where id = new.lead_id;
    if not found then raise exception 'lead % não encontrado', new.lead_id using errcode = '23503'; end if;
    v_contato := n.contato_id;
    select id into v_conversa from conversas where contato_id = v_contato and canal_id is not distinct from new.canal_id;
    if v_conversa is null then
      insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
      values (new.empresa_id, coalesce(new.filial_id, n.filial_id), v_contato, new.canal_id, n.responsavel_id)
      returning id into v_conversa;
    end if;
  end if;
  if tg_op = 'INSERT' then
    insert into mensagens (id, empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id, midia_url,
                           midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id, canal_id, created_at)
    values (coalesce(new.id, nextval(pg_get_serial_sequence('public.mensagens', 'id'))), new.empresa_id, new.filial_id, v_conversa,
            v_contato, new.direcao, coalesce(new.conteudo, ''), coalesce(new.tipo, 'texto'), new.origem, new.external_id,
            new.midia_url, new.midia_retida_em, new.transcricao, new.status_entrega, new.status_em, new.erro_envio,
            coalesce(new.lida, false), new.usuario_id, new.canal_id, coalesce(new.created_at, now()))
    returning id into v_id;
  else
    v_id := old.id;
    update mensagens set conversa_id = coalesce(v_conversa, conversa_id), contato_id = coalesce(v_contato, contato_id),
           direcao = new.direcao, conteudo = coalesce(new.conteudo, ''), tipo = coalesce(new.tipo, 'texto'), origem = new.origem,
           external_id = new.external_id, midia_url = new.midia_url, midia_retida_em = new.midia_retida_em,
           transcricao = new.transcricao, status_entrega = new.status_entrega, status_em = new.status_em,
           erro_envio = new.erro_envio, lida = coalesce(new.lida, false), usuario_id = new.usuario_id, canal_id = new.canal_id
     where id = old.id;
  end if;
  new.id := v_id;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.enforce_lead_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  limite_val int;
  atual_val  int;
BEGIN
  SELECT pc.limite_leads INTO limite_val
    FROM planos_config pc
    JOIN empresas e ON e.plano = pc.id
    WHERE e.id = NEW.empresa_id;
  IF limite_val IS NOT NULL THEN
    SELECT COUNT(*) INTO atual_val FROM leads WHERE empresa_id = NEW.empresa_id;
    IF atual_val >= limite_val THEN
      RAISE EXCEPTION 'LEAD_LIMIT_REACHED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.incrementar_msgs_nao_lidas(lead_id_param bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Nao faz nada de proposito: quem mantem `leads.msgs_nao_lidas` agora e o
  -- gatilho `nao_lidas_sincroniza` em `lead_mensagens`. Ver a migracao
  -- `contador_de_nao_lidas_vira_espelho`.
  perform 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_nao_lidas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lead bigint := coalesce(new.lead_id, old.lead_id);
begin
  if v_lead is null then return coalesce(new, old); end if;

  update public.leads l
     set msgs_nao_lidas = (
           select count(*) from public.lead_mensagens m
            where m.lead_id = v_lead and m.lida = false and m.direcao = 'recebida'
         )
   where l.id = v_lead
     -- Nao escreve se ja esta certo: evita UPDATE inutil em `leads` a cada
     -- mensagem enviada pelo vendedor, que nao mexe na conta de nao lidas.
     and l.msgs_nao_lidas is distinct from (
           select count(*) from public.lead_mensagens m
            where m.lead_id = v_lead and m.lida = false and m.direcao = 'recebida'
         );

  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_lead_marcos_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.direcao = 'recebida' then
    update public.leads
       set ultima_recebida_at = greatest(coalesce(ultima_recebida_at, new.created_at), new.created_at)
     where id = new.lead_id;
  elsif new.direcao = 'enviada' then
    update public.leads
       set ultima_enviada_at = greatest(coalesce(ultima_enviada_at, new.created_at), new.created_at)
     where id = new.lead_id;
  end if;
  return new;
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
  v_criado boolean := false; v_dono bigint;
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
    -- A mesma identidade chegando em duas entregas simultâneas: a segunda espera aqui até a
    -- primeira terminar, e então acha o contato que ela criou.
    if new.origem is not null and new.origem_id is not null then
      perform pg_advisory_xact_lock(hashtext(new.empresa_id || ':' || new.origem || ':' || new.origem_id));
    end if;
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
      v_criado := true;
    end if;
    if new.origem is not null and new.origem_id is not null then
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id)
      values (new.empresa_id, v_contato, new.origem, new.origem_id) on conflict do nothing
      returning contato_id into v_dono;
      -- Conflitou (alguém gravou sem passar pela trava): a identidade já tem dono. O contato
      -- que esta chamada acabou de criar não tem nada pendurado — sai, e segue o do dono.
      if v_dono is null then
        select contato_id into v_dono from contato_identidades
         where empresa_id = new.empresa_id and canal_tipo = new.origem and external_id = new.origem_id;
        if v_criado and v_dono is distinct from v_contato then
          delete from contatos where id = v_contato;
          v_contato := v_dono;
        end if;
      end if;
    end if;
    -- Lead que vem de CANAL (o webhook não achou lead ativo e insere um): usa o negócio aberto
    -- ou reabre o do contato nesta loja, em vez de abrir outro (core_negocio_do_canal). Lead
    -- criado à mão (outra origem) continua criando negócio novo: é decisão de quem cadastrou.
    if new.origem in ('whatsapp', 'instagram', 'messenger') and new.origem_id is not null then
      v_negocio := core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id, new.primeira_msg, false,
                                         new.origem, new.origem_id);
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
              'origem', new.origem, 'origem_id', new.origem_id,
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

create view public.core_v_planos with (security_invoker = true) as
 SELECT id,
    nome,
    descricao,
    preco_centavos,
    limite_usuarios,
    limite_leads,
    features,
    destaque,
    ordem,
    cor
   FROM planos_config
  WHERE ativo;

create view public.lead_mensagens with (security_invoker = true) as
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
   FROM (negocios n
     JOIN mensagens m ON (((m.contato_id = n.contato_id) AND (NOT (m.filial_id IS DISTINCT FROM n.filial_id)))))
  WHERE (n.id = ( SELECT p.id
           FROM negocios p
          WHERE ((p.contato_id = n.contato_id) AND (NOT (p.filial_id IS DISTINCT FROM n.filial_id)))
          ORDER BY COALESCE((((p.dados -> '_lead'::text) ->> 'ativo'::text))::boolean, true) DESC, p.created_at DESC, p.id DESC
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
  WHERE ((m.contato_id IS NULL) OR (NOT (EXISTS ( SELECT 1
           FROM negocios p
          WHERE ((p.contato_id = m.contato_id) AND (NOT (p.filial_id IS DISTINCT FROM m.filial_id)))))));

create view public.leads with (security_invoker = true) as
 SELECT n.id,
    c.nome,
    c.telefone,
    c.instagram,
    c.origem,
    COALESCE(e.slug, ((n.dados -> '_lead'::text) ->> 'kanban_status'::text)) AS kanban_status,
    n.responsavel_id,
    (((n.dados -> '_lead'::text) ->> 'convertido_em'::text))::bigint AS convertido_em,
    c.observacoes,
    n.created_at,
    c.origem_id,
    COALESCE((((n.dados -> '_lead'::text) ->> 'ativo'::text))::boolean, true) AS ativo,
    ((n.dados -> '_lead'::text) ->> 'primeira_msg'::text) AS primeira_msg,
    (COALESCE(cv.nao_lidas, (0)::bigint))::integer AS msgs_nao_lidas,
    (((n.dados -> '_lead'::text) ->> 'ultima_tratativa'::text))::timestamp with time zone AS ultima_tratativa,
    n.entrou_etapa_em AS data_transferencia_funil,
    cv.ultima_mensagem_at,
    (n.dados ->> 'produto_interessado'::text) AS produto_interessado,
    n.ordem AS kanban_ordem,
    n.empresa_id,
    n.valor_estimado,
    n.motivo_perda_id,
    n.perdido_em,
    n.funil_id,
    (n.dados -> '_interesse'::text) AS interesse,
    c.foto_url,
    (((n.dados -> '_lead'::text) ->> 'responsavel_desde'::text))::timestamp with time zone AS responsavel_desde,
    n.devolvido_em,
    n.devolucoes,
    cv.ultima_recebida_at,
    cv.ultima_enviada_at,
    (n.dados -> '_anuncio'::text) AS anuncio,
    n.filial_id
   FROM (((negocios n
     JOIN contatos c ON ((c.id = n.contato_id)))
     LEFT JOIN funil_etapas e ON ((e.id = n.etapa_id)))
     LEFT JOIN LATERAL ( SELECT sum(x.nao_lidas) AS nao_lidas,
            max(x.ultima_mensagem_at) AS ultima_mensagem_at,
            max(x.ultima_recebida_at) AS ultima_recebida_at,
            max(x.ultima_enviada_at) AS ultima_enviada_at
           FROM conversas x
          WHERE ((x.contato_id = n.contato_id) AND (NOT (x.filial_id IS DISTINCT FROM n.filial_id)) AND (n.id = ( SELECT p.id
                   FROM negocios p
                  WHERE ((p.contato_id = n.contato_id) AND (NOT (p.filial_id IS DISTINCT FROM n.filial_id)))
                  ORDER BY COALESCE((((p.dados -> '_lead'::text) ->> 'ativo'::text))::boolean, true) DESC, p.created_at DESC, p.id DESC
                 LIMIT 1)))) cv ON (true));

create view public.v_empresas_plano with (security_invoker = true) as
 SELECT id,
    nome,
    plano,
    status,
    trial_ends_at,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status
   FROM empresas e
  WHERE (id = get_empresa_id());

create view public.v_leads_nao_lidas with (security_invoker = true) as
 WITH principal AS (
         SELECT DISTINCT ON (n.contato_id, COALESCE(n.filial_id, ('-1'::integer)::bigint)) n.id,
            n.contato_id,
            n.filial_id,
            COALESCE((((n.dados -> '_lead'::text) ->> 'ativo'::text))::boolean, true) AS ativo
           FROM negocios n
          ORDER BY n.contato_id, COALESCE(n.filial_id, ('-1'::integer)::bigint), COALESCE((((n.dados -> '_lead'::text) ->> 'ativo'::text))::boolean, true) DESC, n.created_at DESC, n.id DESC
        )
 SELECT m.empresa_id,
    p.id AS lead_id,
    (count(*))::integer AS nao_lidas
   FROM (mensagens m
     JOIN principal p ON (((p.contato_id = m.contato_id) AND (COALESCE(p.filial_id, ('-1'::integer)::bigint) = COALESCE(m.filial_id, ('-1'::integer)::bigint)))))
  WHERE ((m.lida = false) AND (m.direcao = 'recebida'::text) AND p.ativo)
  GROUP BY m.empresa_id, p.id;

CREATE TRIGGER compat_lead_mensagens INSTEAD OF INSERT OR DELETE OR UPDATE ON public.lead_mensagens FOR EACH ROW EXECUTE FUNCTION compat_lead_mensagens_iud();

CREATE TRIGGER compat_leads INSTEAD OF INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION compat_leads_iud();

alter view public.lead_mensagens alter column created_at set default now();

alter view public.lead_mensagens alter column lida set default false;

alter view public.lead_mensagens alter column tipo set default 'texto'::text;

alter view public.leads alter column ativo set default true;

alter view public.leads alter column created_at set default now();

alter view public.leads alter column devolucoes set default 0;

alter view public.leads alter column kanban_ordem set default 0;

alter view public.leads alter column kanban_status set default 'novo'::text;

alter view public.leads alter column msgs_nao_lidas set default 0;

revoke all on public.core_v_planos from public, anon, authenticated, service_role;
revoke all on public.lead_mensagens from public, anon, authenticated, service_role;
revoke all on public.leads from public, anon, authenticated, service_role;
revoke all on public.v_empresas_plano from public, anon, authenticated, service_role;
revoke all on public.v_leads_nao_lidas from public, anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on public.core_v_planos to authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on public.lead_mensagens to authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on public.leads to authenticated, service_role;
grant select on public.v_empresas_plano to anon;
grant select, insert, update, delete on public.v_empresas_plano to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.v_empresas_plano to service_role;
grant select, insert, update, delete, truncate, references, trigger on public.v_leads_nao_lidas to anon, authenticated, service_role;

do $$
declare f regprocedure;
begin
  foreach f in array array['public.compat_etapa(bigint,bigint,text)', 'public.compat_guarda(bigint)', 'public.compat_leads_iud()',
                           'public.compat_lead_mensagens_iud()', 'public.enforce_lead_limit()', 'public.incrementar_msgs_nao_lidas(bigint)',
                           'public.sincronizar_nao_lidas()', 'public.tg_lead_marcos_conversa()']::regprocedure[] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
