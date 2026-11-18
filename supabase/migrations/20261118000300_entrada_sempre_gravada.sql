-- MENSAGEM RECEBIDA NUNCA É DESCARTADA (18/11/2026, pedido do Lucas depois do incidente do 06 s.54).
--
-- Regra permanente (05): "mensagem recebida nunca é descartada; webhook só responde 200 depois de gravar".
-- Em 18/11 o plano base com limite de leads 0 fez o gatilho do limite derrubar a transação INTEIRA da
-- mensagem_registrar — contato, conversa e mensagem junto com o negócio — e a Edge respondeu 200: ~60
-- mensagens de 10 clientes novos sumiram sem reenvio.
--
-- 1. core_limite_negocios: na entrada pelo canal (mensagem_registrar marca a transação com
--    `nexus.entrada_canal = on`), passar do limite NÃO barra o negócio: ele nasce (ou reabre) com o aviso
--    `_lead.aviso_limite` {limite, abertos, em}, que o card mostra ao dono. Cadastro à mão, importação e API
--    continuam barrados (LEAD_LIMIT_REACHED), como antes.
-- 2. mensagem_registrar: na mensagem recebida, o negócio é tentado num sub-bloco; se uma regra o recusar
--    (qualquer erro), a mensagem e o contato entram assim mesmo, sem negócio, e fica um alerta
--    `negocio_nao_criado` para o superadmin. A situação da empresa (teste vencido, só leitura, suspensa)
--    nunca entrou aqui e continua sem entrar. Mensagem recebida gravada (ou já gravada antes: reenvio)
--    limpa `canais.entrada_pendente_desde`.
-- 3. canais.entrada_pendente_desde: a Edge marca quando chega mensagem de cliente pela Meta; a gravação
--    limpa. Pendente há mais de 30 min em horário de atendimento = entrada parada (alerta).
-- 4. alertas_entrada: o registro dos alertas (entrada parada e negócio não criado), lido no superadmin.
-- 5. pg_cron `entrada-parada` (a cada 5 min): só chama /api/cron/entrada-parada quando há canal pendente
--    há 30 min, alerta aberto ou alerta sem aviso — a rota confere o horário, registra e avisa o Lucas.
--
-- Volta: supabase/scripts/volta/volta-entrada-sempre-gravada.sql

-- ── 3. Canal: entrada pendente ────────────────────────────────────────────────
alter table public.canais add column if not exists entrada_pendente_desde timestamptz;
comment on column public.canais.entrada_pendente_desde is
  'Primeira mensagem de cliente que chegou da Meta e ainda não foi gravada (a Edge marca, a mensagem_registrar limpa). 18/11/2026.';

-- ── 4. Alertas ────────────────────────────────────────────────────────────────
create table if not exists public.alertas_entrada (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  canal_id bigint references public.canais(id) on delete cascade,
  tipo text not null check (tipo in ('entrada_parada', 'negocio_nao_criado')),
  desde timestamptz not null default now(),
  detalhe text check (detalhe is null or length(detalhe) <= 500),
  notificado_em timestamptz,
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.alertas_entrada is
  'Alertas de recebimento (18/11/2026): canal que recebe da Meta e não grava há 30 min em horário de atendimento, e negócio que uma regra recusou numa mensagem recebida. Só o superadmin lê.';
create index if not exists alertas_entrada_abertos_idx on public.alertas_entrada (canal_id) where resolvido_em is null;
create index if not exists alertas_entrada_empresa_idx on public.alertas_entrada (empresa_id, created_at desc);
alter table public.alertas_entrada enable row level security;
create policy alertas_entrada_superadmin on public.alertas_entrada for select to authenticated
  using ((select public.is_super_admin()));
revoke all on public.alertas_entrada from anon;
grant select on public.alertas_entrada to authenticated;

-- ── 1. Limite de leads: a entrada pelo canal passa, com aviso ─────────────────
create or replace function public.core_limite_negocios()
returns trigger
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite int;
  v_abertos int;
begin
  if new.status <> 'aberto' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'aberto' then return new; end if;
  select coalesce(nullif(greatest(e.limite_leads, 0), 0), pc.limite_leads) into v_limite
    from empresas e left join planos_config pc on pc.id = e.plano
   where e.id = new.empresa_id;
  if v_limite is null then return new; end if;
  select count(*) into v_abertos from negocios where empresa_id = new.empresa_id and status = 'aberto';
  if v_abertos >= v_limite then
    -- Cliente que escreveu pelo canal: o negócio nasce, com o aviso para o dono (regra de 18/11/2026).
    if current_setting('nexus.entrada_canal', true) = 'on' then
      new.dados := jsonb_set(coalesce(new.dados, '{}'::jsonb), '{_lead}',
        coalesce(new.dados -> '_lead', '{}'::jsonb)
        || jsonb_build_object('aviso_limite', jsonb_build_object('limite', v_limite, 'abertos', v_abertos, 'em', now())));
      return new;
    end if;
    raise exception 'LEAD_LIMIT_REACHED' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── 2. mensagem_registrar: a recebida sempre entra ────────────────────────────
create or replace function public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
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
  v_criado    boolean := false;
  v_dono      bigint;
  v_erro      text;
begin
  if p_external_id is not null and exists (select 1 from mensagens where external_id = p_external_id) then
    -- Reenvio da Meta de uma recebida que já está gravada: a entrada do canal está em dia.
    if not v_enviada and p_canal_id is not null then
      update canais set entrada_pendente_desde = null where id = p_canal_id and entrada_pendente_desde is not null;
    end if;
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
  -- Mensagem do cliente: o limite de leads não barra o negócio (ele nasce com aviso) — core_limite_negocios.
  if not v_enviada then perform set_config('nexus.entrada_canal', 'on', true); end if;

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
      perform core_negocio_do_canal(p_empresa, v_contato, v_canal_filial, d ->> 'conteudo', v_enviada, v_tipo, null);
    end if;
  else
    if v_ident is null or v_tipo is null then
      raise exception 'mensagem_registrar: informe lead_id, ou identidade com origem/canal' using errcode = '23502';
    end if;
    -- A mesma identidade em duas entregas simultâneas: a segunda espera a primeira terminar.
    perform pg_advisory_xact_lock(hashtext(p_empresa || ':' || v_tipo || ':' || v_ident));
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
        v_criado := true;
      end if;
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (p_empresa, v_contato, v_tipo, v_ident, p_canal_id) on conflict do nothing
      returning contato_id into v_dono;
      -- Conflitou: a identidade já tem dono; o contato recém-criado sai e segue o do dono.
      if v_dono is null then
        select contato_id into v_dono from contato_identidades
         where empresa_id = p_empresa and canal_tipo = v_tipo and external_id = v_ident;
        if v_criado and v_dono is distinct from v_contato then
          delete from contatos where id = v_contato;
          v_contato := v_dono;
        end if;
      end if;
    end if;

    -- O negócio do contato NA LOJA DO CANAL: o aberto, ou reabre o mais recente, ou cria
    -- (core_negocio_do_canal). Mensagem enviada pela loja só usa o que existe.
    if v_enviada then
      v_negocio := core_negocio_do_canal(p_empresa, v_contato, v_filial, d ->> 'conteudo', v_enviada, v_tipo, v_ident);
    else
      -- Mensagem do cliente: uma regra que recuse o negócio não leva a mensagem junto (18/11/2026).
      begin
        v_negocio := core_negocio_do_canal(p_empresa, v_contato, v_filial, d ->> 'conteudo', v_enviada, v_tipo, v_ident);
      exception when others then
        get stacked diagnostics v_erro = message_text;
        v_negocio := null;
        insert into alertas_entrada (empresa_id, canal_id, tipo, detalhe)
        values (p_empresa, p_canal_id, 'negocio_nao_criado',
                left('contato ' || v_contato || ': ' || coalesce(v_erro, 'erro sem mensagem'), 500));
      end;
    end if;
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

  if not v_enviada then
    perform set_config('nexus.entrada_canal', 'off', true);
    if p_canal_id is not null then
      update canais set entrada_pendente_desde = null where id = p_canal_id and entrada_pendente_desde is not null;
    end if;
  end if;
  return v_id;
end $function$;

-- ── 5. pg_cron: entrada parada ────────────────────────────────────────────────
-- Só chama a rota quando há o que fazer (a Vercel não é acordada a cada 5 min à toa). O segredo é lido do
-- Vault na hora, como o automacoes-hora e o lgpd-exportacoes-limpar.
select cron.schedule('entrada-parada', '*/5 * * * *', $cron$
  select net.http_get(
    url := 'https://crm-saas-beta.vercel.app/api/cron/entrada-parada',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.canais where status = 'ativo' and entrada_pendente_desde < now() - interval '30 minutes')
     or exists (select 1 from public.alertas_entrada where resolvido_em is null and tipo = 'entrada_parada')
     or exists (select 1 from public.alertas_entrada where notificado_em is null and created_at > now() - interval '1 day');
$cron$);
