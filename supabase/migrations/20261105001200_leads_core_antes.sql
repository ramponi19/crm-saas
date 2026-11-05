-- Último lote das views (05/11/2026), passo 1 de 2: o banco deixa de depender de `leads` e
-- `lead_mensagens` ANTES do app novo. Tudo aqui funciona com as views de pé (o app de hoje
-- segue igual); o passo 2 (20261105001300) derruba as views com o app novo no ar.
--
--   1. negocios.ativo: coluna GERADA de dados._lead.ativo (o "zerar do funil"). O app filtra
--      `.eq('ativo', true)` direto no negócio, como fazia na view. Quem grava continua gravando
--      em dados._lead.ativo (a Edge, core_negocio_do_canal, o funil); a coluna acompanha.
--   2. storage_orfaos: a mídia referenciada sai de mensagens.midia_url e contatos.foto_url (a
--      view lead_mensagens era todas as mensagens; leads.foto_url era contatos.foto_url).
--   3. negocio_atribuir: grava em negocios (responsavel_id e dados._lead.responsavel_desde),
--      como o gatilho da view fazia. O gatilho negocios_historico continua registrando a ação.
--   4. preencher_filial_do_lead (gatilho de imoveis_perfis_busca e cadencia_inscricoes): a loja
--      vem de negocios.
--   5. buscar_lead_por_numero (⌘K por número): negocios + contatos.
--   6. assistente_status_conversas: mensagens agrupadas pelo negócio principal do contato na
--      loja — a mesma regra que a view lead_mensagens usava para o lead_id.
--   7. exportação LGPD: bucket privado lgpd-exportacoes e o job de hora em hora que apaga
--      os ZIPs com mais de 24 h.
--
-- Volta: supabase/scripts/volta/volta-leads-core-antes.sql.

-- 1 ────────────────────────────────────────────────────────────────────────────────────
alter table public.negocios
  add column ativo boolean not null
  generated always as (coalesce((dados -> '_lead' ->> 'ativo') <> 'false', true)) stored;

comment on column public.negocios.ativo is
  'Gerada de dados._lead.ativo (o "zerar do funil"; ausente = ativo). Gravar em dados._lead.ativo.';

-- 2 ────────────────────────────────────────────────────────────────────────────────────
create or replace view public.storage_orfaos with (security_invoker = true) as
select o.name, o.created_at, ((o.metadata ->> 'size'))::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'chat-midia'
   and not exists (select 1 from public.mensagens m
                    where m.midia_url like '%/chat-midia/%'
                      and split_part(m.midia_url, '/chat-midia/', 2) = o.name)
   and not exists (select 1 from public.contatos c
                    where c.foto_url like '%/chat-midia/%'
                      and split_part(c.foto_url, '/chat-midia/', 2) = o.name);

-- 3 ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.negocio_atribuir(p_negocio bigint, p_responsavel uuid, p_acao text, p_por uuid default null)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_acao not in ('pegar', 'devolver', 'transferir', 'atribuir', 'distribuir') then
    raise exception 'negocio_atribuir: ação inválida %', p_acao using errcode = '22023';
  end if;
  perform set_config('nexus.acao_atribuicao', p_acao, true);
  perform set_config('nexus.atribuicao_por', coalesce(p_por::text, ''), true);
  -- responsavel_desde é o marco do prazo de devolução à esteira e mora em dados._lead.
  -- Sem responsável, o marco antigo fica (era assim pela view: jsonb_strip_nulls).
  update public.negocios
     set responsavel_id = p_responsavel,
         dados = case when p_responsavel is null then dados
                      else jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb)
                                     || jsonb_build_object('responsavel_desde', now())) end
   where id = p_negocio;
  perform set_config('nexus.acao_atribuicao', '', true);
  perform set_config('nexus.atribuicao_por', '', true);
end $function$;

-- 4 ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.preencher_filial_do_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.lead_id is not null then
    select n.filial_id into new.filial_id from negocios n where n.id = new.lead_id;
  elsif new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $function$;

-- 5 ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.buscar_lead_por_numero(p_id bigint)
returns table(id bigint, nome text, telefone text, produto_interessado text, loja text, outra_loja boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_emp   bigint := get_empresa_id();
  v_papel text;
  v_super boolean;
  v_vis   bigint[] := filiais_visiveis();
begin
  if v_emp is null or auth.uid() is null then return; end if;
  select eu.role into v_papel from empresa_usuarios eu
   where eu.usuario_id = auth.uid() and eu.empresa_id = v_emp and eu.ativo limit 1;
  select coalesce(u.is_super_admin, false) into v_super from usuarios u where u.id = auth.uid();
  if v_papel is null and not coalesce(v_super, false) then return; end if;

  return query
  select n.id, c.nome::text, c.telefone::text, (n.dados ->> 'produto_interessado')::text,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome)::text,
         not (n.filial_id is null or n.filial_id = any (v_vis))
  from negocios n
  join contatos c on c.id = n.contato_id
  left join filiais f on f.id = n.filial_id
  where n.id = p_id and n.empresa_id = v_emp and n.ativo
    and (coalesce(v_super, false) or v_papel in ('owner', 'admin')
         or n.filial_id is null or n.filial_id = any (v_vis));
end $function$;

-- 6 ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.assistente_status_conversas(p_empresa bigint)
returns table(lead_id bigint, ultima_recebida timestamp with time zone, ultima_enviada timestamp with time zone, mensagens integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with principal as (
    select distinct on (n.contato_id, coalesce(n.filial_id, -1)) n.id, n.contato_id, n.filial_id
      from public.negocios n
     where n.empresa_id = p_empresa
     order by n.contato_id, coalesce(n.filial_id, -1), n.ativo desc, n.created_at desc, n.id desc
  )
  select p.id,
         max(m.created_at) filter (where m.direcao = 'recebida'),
         max(m.created_at) filter (where m.direcao = 'enviada'),
         count(*)::int
    from public.mensagens m
    join principal p on p.contato_id = m.contato_id and coalesce(p.filial_id, -1) = coalesce(m.filial_id, -1)
   where m.empresa_id = p_empresa
   group by p.id
$function$;

-- 7 ────────────────────────────────────────────────────────────────────────────────────
-- Exportação LGPD (lib/lgpd/exportacao.ts): o ZIP vai para um bucket PRIVADO e sai por
-- link assinado de 10 minutos; o job apaga, de hora em hora, o que tem mais de 24 h
-- (/api/cron/lgpd-limpar, com o segredo lido do Vault na hora, como o automacoes-hora).
-- 50 MB = teto de arquivo do plano free.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lgpd-exportacoes', 'lgpd-exportacoes', false, 52428800, array['application/zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

select cron.schedule('lgpd-exportacoes-limpar', '43 * * * *', $cron$
  select net.http_get(
    url := 'https://crm-saas-beta.vercel.app/api/cron/lgpd-limpar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  );
$cron$);

-- Conferência: nenhum corpo de função de `public` lê mais as views fora dos compat_* e das
-- funções mortas que o passo 2 derruba.
do $$
declare v text;
begin
  select string_agg(p.proname, ', ') into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosrc ~* '(from|join|update|into)\s+(public\.)?(leads|lead_mensagens|v_leads_nao_lidas)\M'
     and p.proname not in ('compat_leads_iud', 'compat_lead_mensagens_iud', 'enforce_lead_limit',
                           'sincronizar_nao_lidas', 'tg_lead_marcos_conversa');
  if v is not null then raise exception 'ainda leem as views: %', v; end if;
end $$;
