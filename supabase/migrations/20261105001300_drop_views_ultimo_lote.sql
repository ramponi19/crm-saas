-- Último lote das views (05/11/2026), passo 2 de 2: caem `leads` e `lead_mensagens` (as duas
-- últimas views de compatibilidade do corte para o core v1) e as três que não eram de
-- compatibilidade: `v_leads_nao_lidas` (lia o core, mas ninguém mais a lê — a quadro_base conta
-- as não lidas sozinha), `core_v_planos` e `v_empresas_plano` (nenhum leitor no código, em
-- funções, jobs ou views; 0 chamadas no pg_stat_statements). Só com o app novo e a Edge v72 no
-- ar: nenhum leitor das views no app, na Edge nem nos scripts (lib/leads.ts lê e grava o core).
--
--   1. gatilhos INSTEAD OF e funções compat_* (compat_leads_iud, compat_lead_mensagens_iud,
--      compat_etapa, compat_guarda). core_negocio_do_canal FICA: é dela a regra de não duplicar
--      o negócio de quem volta pelo canal, e a mensagem_registrar e a Edge a chamam;
--   2. funções mortas que liam as views, sem gatilho nem chamador: enforce_lead_limit (o limite é
--      o gatilho negocios_limite), sincronizar_nao_lidas e tg_lead_marcos_conversa (os marcos
--      vêm de conversas, gatilho mensagens_sincroniza), incrementar_msgs_nao_lidas (no-op desde
--      setembro; a Edge não chama mais);
--   3. as cinco views.
--
-- O passo 1 (20261105001200) já tirou as views de dentro de storage_orfaos, negocio_atribuir,
-- preencher_filial_do_lead, buscar_lead_por_numero e assistente_status_conversas.
-- Volta: supabase/scripts/volta/volta-views-ultimo-lote.sql, junto com o Instant Rollback do app.

do $$
declare v text;
begin
  -- Nenhuma outra view depende delas.
  select string_agg(distinct r.ev_class::regclass::text, ', ') into v
    from pg_depend d join pg_rewrite r on r.oid = d.objid
   where d.refobjid in ('public.leads'::regclass, 'public.lead_mensagens'::regclass, 'public.v_leads_nao_lidas'::regclass,
                        'public.core_v_planos'::regclass, 'public.v_empresas_plano'::regclass)
     and r.ev_class not in ('public.leads'::regclass, 'public.lead_mensagens'::regclass, 'public.v_leads_nao_lidas'::regclass,
                            'public.core_v_planos'::regclass, 'public.v_empresas_plano'::regclass);
  if v is not null then raise exception 'views dependem das que caem: %', v; end if;

  -- Nenhum corpo de função (de qualquer schema) lê as views, fora as que caem aqui. O corpo não
  -- entra no pg_depend: o drop passaria e a função quebraria só na hora de rodar.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog', 'information_schema')
     and p.prosrc ~* '(from|join|update|into)\s+(public\.)?(leads|lead_mensagens|v_leads_nao_lidas|core_v_planos|v_empresas_plano)\M'
     and not (n.nspname = 'public' and p.proname in ('compat_leads_iud', 'compat_lead_mensagens_iud', 'enforce_lead_limit',
                                                     'sincronizar_nao_lidas', 'tg_lead_marcos_conversa'));
  if v is not null then raise exception 'funções ainda leem as views: %', v; end if;

  -- Nem os jobs.
  if exists (select 1 from cron.job where command ~* '\m(leads|lead_mensagens|v_leads_nao_lidas|core_v_planos|v_empresas_plano)\M') then
    raise exception 'job do pg_cron cita as views';
  end if;
end $$;

-- 1 e 3: as views levam junto os gatilhos INSTEAD OF.
drop view public.leads;
drop view public.lead_mensagens;
drop view public.v_leads_nao_lidas;
drop view public.core_v_planos;
drop view public.v_empresas_plano;

drop function public.compat_leads_iud();
drop function public.compat_lead_mensagens_iud();
drop function public.compat_etapa(bigint, bigint, text);
drop function public.compat_guarda(bigint);

-- 2
drop function public.enforce_lead_limit();
drop function public.sincronizar_nao_lidas();
drop function public.tg_lead_marcos_conversa();
drop function public.incrementar_msgs_nao_lidas(bigint);
