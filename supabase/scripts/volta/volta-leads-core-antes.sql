-- Volta de 20261105001200_leads_core_antes.sql (último lote, passo 1): devolve as funções e a
-- storage_orfaos ao corpo de antes (lendo as views leads/lead_mensagens) e tira negocios.ativo.
-- Só faz sentido com as views de pé (antes do passo 2, ou depois de volta-views-ultimo-lote.sql)
-- e com o app de antes (Instant Rollback): o app novo filtra por negocios.ativo.

create or replace view public.storage_orfaos with (security_invoker = true) as
select o.name, o.created_at, ((o.metadata ->> 'size'))::bigint as bytes
  from storage.objects o
 where o.bucket_id = 'chat-midia'
   and not exists (select 1 from public.lead_mensagens m
                    where m.midia_url like '%/chat-midia/%'
                      and split_part(m.midia_url, '/chat-midia/', 2) = o.name)
   and not exists (select 1 from public.leads l
                    where l.foto_url like '%/chat-midia/%'
                      and split_part(l.foto_url, '/chat-midia/', 2) = o.name);

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
  -- Pela view leads, como as rotas sempre gravaram: responsavel_desde é o marco do prazo de
  -- devolução à esteira e mora em negocios.dados._lead (o gatilho da view cuida).
  update public.leads
     set responsavel_id = p_responsavel,
         responsavel_desde = case when p_responsavel is null then null else now() end
   where id = p_negocio;
  perform set_config('nexus.acao_atribuicao', '', true);
  perform set_config('nexus.atribuicao_por', '', true);
end $function$;

create or replace function public.preencher_filial_do_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.lead_id is not null then
    select l.filial_id into new.filial_id from leads l where l.id = new.lead_id;
  elsif new.filial_id is null then
    new.filial_id := filial_gravacao(new.empresa_id);
  end if;
  return new;
end $function$;

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
  select l.id, l.nome::text, l.telefone::text, l.produto_interessado::text,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome)::text,
         not (l.filial_id is null or l.filial_id = any (v_vis))
  from leads l
  left join filiais f on f.id = l.filial_id
  where l.id = p_id and l.empresa_id = v_emp and l.ativo
    and (coalesce(v_super, false) or v_papel in ('owner', 'admin')
         or l.filial_id is null or l.filial_id = any (v_vis));
end $function$;

create or replace function public.assistente_status_conversas(p_empresa bigint)
returns table(lead_id bigint, ultima_recebida timestamp with time zone, ultima_enviada timestamp with time zone, mensagens integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select m.lead_id,
         max(m.created_at) filter (where m.direcao = 'recebida'),
         max(m.created_at) filter (where m.direcao = 'enviada'),
         count(*)::int
  from public.lead_mensagens m
  where m.empresa_id = p_empresa
  group by m.lead_id
$function$;

alter table public.negocios drop column ativo;

-- Exportação LGPD: o job sai; o bucket fica (apagar só vazio, pelo painel do Storage).
select cron.unschedule('lgpd-exportacoes-limpar');
