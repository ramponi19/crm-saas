-- PRONTO PARA VENDER A QUALQUER SEGMENTO (17/11/2026, Bloco 3 — docs/reconstrucao-nexus/08-MAPA-MODULOS-CORE.md).
-- Volta: supabase/scripts/volta/volta-pronto-vender.sql (app antes, se o app novo já estiver no ar).
--
--  1. Storage `imoveis`: cada empresa só grava, troca e apaga na própria pasta (a leitura segue pública:
--     as fotos vão para o site e os portais). Antes: qualquer usuário logado mexia na pasta de outra.
--  2. Planos: `unlimited` aceito; status do Stripe que faltavam; trocar de plano copia os limites do
--     plano (planos_config) para a empresa — em qualquer caminho (superadmin, webhook, cadastro).
--  3. Modo SÓ LEITURA: empresa com status diferente de 'ativo' (teste vencido, assinatura cancelada ou
--     suspensa pelo superadmin) vê tudo, mas não cria, não edita e não apaga — política RESTRITIVA em
--     toda tabela com empresa_id (soma com as de tenant). O recebimento de mensagens segue gravando
--     (a Edge usa service_role, que não passa por RLS). Fica de fora o que acontece só por ler: acesso,
--     presença, leitura de conversa/chat, preferências, uso do Assistente, caches do ZapIntel, aceite de termos.
--  4. Presets: "CRM geral" (funil genérico, nenhum módulo de segmento) é o padrão do cadastro; os presets
--     que só ligavam módulos em preparação (Imobiliária, Saúde, Food, Veículos) saem do cadastro; todo
--     preset passa a só ligar módulos e rótulos — funil, motivos de perda e campos são os genéricos.
--  5. empresa_modulos: apagadas as linhas com chave fora do manifesto (`vendas`, `avaliacao`, herança do corte).
--  6. termos_aceites: o registro de aceite dos termos de uso e da política de privacidade (versão, quem,
--     quando, de onde). O texto e a versão vigente esperam o Lucas (decisão (c)).

-- ── 1. Storage: bucket imoveis por pasta da empresa ────────────────────────────
drop policy if exists imoveis_auth_insert on storage.objects;
drop policy if exists imoveis_auth_update on storage.objects;
drop policy if exists imoveis_auth_delete on storage.objects;
create policy imoveis_upload_do_tenant on storage.objects for insert to authenticated
  with check (bucket_id = 'imoveis' and (storage.foldername(name))[1] = (select public.get_empresa_id())::text);
create policy imoveis_update_do_tenant on storage.objects for update to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = (select public.get_empresa_id())::text)
  with check (bucket_id = 'imoveis' and (storage.foldername(name))[1] = (select public.get_empresa_id())::text);
create policy imoveis_delete_do_tenant on storage.objects for delete to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = (select public.get_empresa_id())::text);

-- ── 2. Planos ────────────────────────────────────────────────────────────────
alter table public.empresas drop constraint if exists empresas_plano_check;
alter table public.empresas add constraint empresas_plano_check
  check (plano = any (array['free'::text, 'starter'::text, 'pro'::text, 'unlimited'::text]));
alter table public.empresas drop constraint if exists empresas_stripe_status_check;
alter table public.empresas add constraint empresas_stripe_status_check
  check (stripe_status = any (array['trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text,
    'incomplete'::text, 'incomplete_expired'::text, 'unpaid'::text, 'paused'::text]));

create or replace function public.empresa_limites_do_plano()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trocou de plano: os limites passam a ser os do plano novo (0 = sem limite fica para o superadmin).
  select p.limite_usuarios, p.limite_leads into new.limite_usuarios, new.limite_leads
    from public.planos_config p where p.id = new.plano;
  return new;
end $$;
revoke all on function public.empresa_limites_do_plano() from public, anon, authenticated;
drop trigger if exists empresas_limites_do_plano on public.empresas;
create trigger empresas_limites_do_plano before update of plano on public.empresas
  for each row when (old.plano is distinct from new.plano) execute function public.empresa_limites_do_plano();

-- ── 3. Modo só leitura ─────────────────────────────────────────────────────────
create or replace function public.sessao_pode_escrever()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select e.status = 'ativo' from public.empresas e where e.id = public.get_empresa_id()), true)
$$;
revoke all on function public.sessao_pode_escrever() from public, anon;
grant execute on function public.sessao_pode_escrever() to authenticated;

do $$
declare t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'empresa_id'
       and c.table_name not in (
         'acessos', 'notificacao_prefs', 'push_subscriptions', 'superadmin_logs', 'stripe_eventos', 'termos_aceites',
         'chat_leituras', 'conversas', 'assistente_uso', 'zapintel_conversa_cache', 'zapintel_lead_perfil',
         'zapintel_venda_lead', 'zapintel_midia_retida', 'diagnostico_canais', 'historico_bruto', 'rate_limit')
     order by 1
  loop
    execute format('drop policy if exists somente_leitura_insert on public.%I', t);
    execute format('drop policy if exists somente_leitura_update on public.%I', t);
    execute format('drop policy if exists somente_leitura_delete on public.%I', t);
    execute format('create policy somente_leitura_insert on public.%I as restrictive for insert to authenticated with check ((select public.sessao_pode_escrever()))', t);
    execute format('create policy somente_leitura_update on public.%I as restrictive for update to authenticated using ((select public.sessao_pode_escrever())) with check ((select public.sessao_pode_escrever()))', t);
    execute format('create policy somente_leitura_delete on public.%I as restrictive for delete to authenticated using ((select public.sessao_pode_escrever()))', t);
  end loop;
end $$;

-- ── 4. Presets: só módulos e rótulos; "CRM geral" é o padrão ───────────────────
-- Cópia para a volta (supabase/scripts/volta/volta-pronto-vender.sql).
create table if not exists ops.presets_antes_20261117 as select * from public.presets_onboarding;
-- O funil, os motivos e os campos de partida são os mesmos para todo preset (o core não muda por ramo).
update public.presets_onboarding set
  etapas = '[{"id":"novo","color":"#7FB0E8","label":"Novo"},{"id":"em_contato","color":"#C6A86A","label":"Em contato"},{"id":"negociando","tipo":"negociacao","color":"#F4B740","label":"Negociando"},{"id":"convertido","tipo":"ganho","color":"#34D399","label":"Convertido"},{"id":"perdido","tipo":"perdido","color":"#DC2626","label":"Perdido"}]'::jsonb,
  motivos_perda = '["Preço","Condição de pagamento","Escolheu um concorrente","Sumiu / não respondeu","Desistiu","Não era o momento"]'::jsonb,
  campos = '[]'::jsonb,
  updated_at = now();

insert into public.presets_onboarding (chave, nome, descricao, ativo, etapas, campos, modulos, motivos_perda, rotulos)
select 'geral', 'CRM geral', 'Funil, contatos, conversas, tarefas e automações — para qualquer empresa. Os módulos se ligam depois, na Central.', true,
  p.etapas, '[]'::jsonb, '[]'::jsonb, p.motivos_perda,
  '{"_menu":{"ordem":-1,"menu_layout":{},"modulos_extra":[],"modulos_habilitados":["/dashboard","/leads","/clientes","/comunicacao","/tarefas","/fila","/chat"]},"_vocabulario":{"interesse":"Interesse"}}'::jsonb
  from public.presets_onboarding p where p.chave = 'varejo'
on conflict (chave) do nothing;

-- Só os que ligam módulos prontos ficam no cadastro. Os outros voltam quando o módulo sair da preparação.
update public.presets_onboarding set ativo = false where chave in ('imobiliaria', 'saude', 'food', 'concessionaria');

-- Bases limpas: sem endereço que não é item de menu (os antigos do /admin, /marketing, /produtos, /ranking)
-- e sem "extras" (todo item já está no catálogo). Varejo e Serviços não ligam o módulo de celular.
update public.presets_onboarding set rotulos = jsonb_set(
    (rotulos - '/produtos'),
    '{_menu}',
    (rotulos->'_menu') || jsonb_build_object(
      'modulos_extra', '[]'::jsonb,
      'modulos_habilitados', coalesce((
        select jsonb_agg(h order by h) from jsonb_array_elements_text(rotulos->'_menu'->'modulos_habilitados') h
         where h not in ('/aparencia', '/canais', '/configuracoes', '/empresa', '/funil', '/marketing', '/meu-menu',
                         '/permissoes', '/planos', '/produtos', '/ranking')
           and not (h = '/check-imei' and presets_onboarding.chave in ('varejo', 'servicos'))
      ), '[]'::jsonb)))
 where chave <> 'geral';
-- `modulos` (lista antiga de chaves, ninguém lê desde 29/10/2026): vazia — quem diz o que liga é a base (_menu).
update public.presets_onboarding set modulos = '[]'::jsonb where chave <> 'geral';

-- ── 5. empresa_modulos sem chave do manifesto ──────────────────────────────────
create table if not exists ops.empresa_modulos_legado_20261117 as select * from public.empresa_modulos where modulo in ('vendas', 'avaliacao');
delete from public.empresa_modulos where modulo in ('vendas', 'avaliacao');

-- ── 6. Aceite de termos e privacidade ──────────────────────────────────────────
create table if not exists public.termos_aceites (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id bigint references public.empresas(id) on delete set null,
  documento text not null check (documento in ('termos', 'privacidade')),
  versao text not null,
  aceito_em timestamptz not null default now(),
  ip text,
  user_agent text,
  unique (usuario_id, documento, versao)
);
alter table public.termos_aceites enable row level security;
create policy termos_aceites_ler_proprio on public.termos_aceites for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.is_super_admin()));
create policy termos_aceites_gravar_proprio on public.termos_aceites for insert to authenticated
  with check (usuario_id = (select auth.uid()));
revoke all on public.termos_aceites from anon;
grant select, insert on public.termos_aceites to authenticated;
create index if not exists termos_aceites_empresa on public.termos_aceites (empresa_id);
