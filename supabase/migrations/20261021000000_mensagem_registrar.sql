-- =====================================================================================
-- mensagem_registrar — VERSÃO A (antes do corte para o core v1). Aplicável em produção.
--
-- POR QUE EXISTE: a Edge webhook-leads gravava o histórico da coexistência com
-- upsert(onConflict: "external_id") direto em lead_mensagens. No core v1 lead_mensagens
-- vira view com INSTEAD OF, e Postgres não aceita ON CONFLICT em view assim: o
-- histórico pararia de entrar no minuto do corte. Com a gravação atrás desta função,
-- a Edge não muda no corte — só o corpo da função muda (versão B, passo 8 de
-- supabase/scripts/migrar_jm_para_core.sql), na mesma transação que renomeia as tabelas.
--
-- Contrato (igual nas versões A e B):
--   p_empresa      empresa dona da mensagem; o lead (e o canal, se vier) têm de ser dela.
--   p_canal_id     canal por onde a mensagem passou (null = sem canal, ex.: portal).
--   p_external_id  id da mensagem na Meta. Se já existir, NADA é gravado — mesma
--                  semântica do upsert com ignoreDuplicates (ON CONFLICT DO NOTHING).
--   p_dados        o resto da linha, com os nomes de coluna de lead_mensagens:
--                  lead_id (obrigatório na versão A), direcao, conteudo, origem, lida,
--                  tipo, midia_url, status_entrega, status_em, erro_envio, usuario_id,
--                  filial_id, transcricao, midia_retida_em, created_at. Chave ausente =
--                  default da coluna (lida false, tipo 'texto', created_at now()).
--   retorno        id da mensagem criada; NULL quando o external_id já existia.
--
-- Só service_role executa (a Edge chama com a chave de serviço). Os gatilhos de
-- lead_mensagens (filial do lead, não lidas, marcos da conversa, ZapIntel ao vivo)
-- disparam como num insert comum.
-- =====================================================================================
create or replace function public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
  returns bigint
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  r  public.lead_mensagens;
  v_id bigint;
begin
  r := jsonb_populate_record(null::public.lead_mensagens, coalesce(p_dados, '{}'::jsonb));
  if r.lead_id is null then
    raise exception 'mensagem_registrar: lead_id obrigatório' using errcode = '23502';
  end if;
  if not exists (select 1 from public.leads l where l.id = r.lead_id and l.empresa_id = p_empresa) then
    raise exception 'mensagem_registrar: lead % não é da empresa %', r.lead_id, p_empresa using errcode = '42501';
  end if;
  if p_canal_id is not null
     and not exists (select 1 from public.canais_conectados c where c.id = p_canal_id and c.empresa_id = p_empresa) then
    raise exception 'mensagem_registrar: canal % não é da empresa %', p_canal_id, p_empresa using errcode = '42501';
  end if;

  insert into public.lead_mensagens (lead_id, direcao, conteudo, origem, lida, created_at, empresa_id, external_id, tipo,
                                     midia_url, status_entrega, erro_envio, status_em, usuario_id, filial_id, canal_id,
                                     transcricao, midia_retida_em)
  values (r.lead_id, r.direcao, coalesce(r.conteudo, ''), r.origem, coalesce(r.lida, false), coalesce(r.created_at, now()),
          p_empresa, p_external_id, coalesce(r.tipo, 'texto'), r.midia_url, r.status_entrega, r.erro_envio, r.status_em,
          r.usuario_id, r.filial_id, p_canal_id, r.transcricao, r.midia_retida_em)
  on conflict (external_id) do nothing
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.mensagem_registrar(bigint, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.mensagem_registrar(bigint, bigint, text, jsonb) to service_role;
