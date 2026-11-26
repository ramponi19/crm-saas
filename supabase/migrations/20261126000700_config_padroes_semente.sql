-- ETAPA 1.1i (26/11/2026; docs/etapa-1.1-plano.md §5.2, item 4) — GERADOR DE VALORES PADRÃO: a empresa nova nasce com a
-- configuração completa gravada em `empresa_config`, e cada módulo grava a sua ao ser instalado.
--   - `config_padroes()`: a lista de padrões, GERADA de lib/config.ts (scripts/gerar-config-padroes.mts; o bloco abaixo é
--     idêntico a supabase/funcoes/config_padroes.sql e o `npm run check` confere). Mesmos valores que as funções e as
--     telas aplicam hoje quando a empresa não gravou nada (teste-config-padroes compara com core_horario,
--     core_sem_ofertas_*, core_sem_dono_modo, core_liberar_lote_esteira e os coalesce do pós-venda).
--   - `config_semear(empresa, modulo)`: grava os padrões que faltam (nunca sobrescreve); sem módulo = os do núcleo.
--   - gatilho AFTER INSERT em `empresas` (cadastro, preview do superadmin) e AFTER INSERT/UPDATE OF ativo em
--     `empresa_modulos` (preset, Central, pedido, forçados, addon): cobre todos os caminhos de uma vez.
-- Empresas que já existem (JM, Aletrini, Demonstração) NÃO mudam: nada é gravado nelas por esta migração.
-- Só cria funções e gatilhos novos (sem DDL nas tabelas do app além de create trigger). Volta:
-- supabase/scripts/volta/volta-config-padroes-semente.sql

set local lock_timeout = '5s';

-- >>> config_padroes (gerado por scripts/gerar-config-padroes.mts; não editar à mão)
create or replace function public.config_padroes()
 returns table (modulo text, chave text, valor jsonb, modulo_requerido text)
 language sql immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select * from (values
    ('core', 'condicao_venda', '"exigida"'::jsonb, null),
    ('core', 'horario', '{"semana":{"0":[],"1":[{"abre":"09:00","fecha":"18:00"}],"2":[{"abre":"09:00","fecha":"18:00"}],"3":[{"abre":"09:00","fecha":"18:00"}],"4":[{"abre":"09:00","fecha":"18:00"}],"5":[{"abre":"09:00","fecha":"18:00"}],"6":[]}}'::jsonb, null),
    ('core', 'sem_ofertas', '{"botoes":["Não quero receber ofertas"],"confirmacao":"Pronto, {{nome}}: você não vai mais receber ofertas da nossa loja. Os avisos sobre a sua compra continuam chegando."}'::jsonb, null),
    ('distribuicao', 'sem_dono', '"esteira"'::jsonb, null),
    ('distribuicao', 'liberacao_diaria', '{"ativo":false}'::jsonb, null),
    ('posvenda', 'teto_diario', '30'::jsonb, 'posvenda'),
    ('posvenda', 'sla_horas', '"loja_aberta"'::jsonb, 'posvenda'),
    ('posvenda', 'nps_limite_chamado', '6'::jsonb, 'posvenda'),
    ('posvenda', 'janela_acompanhamento_dias', '3'::jsonb, 'posvenda'),
    ('posvenda', 'categorias_modelo', '["UTILITY"]'::jsonb, 'posvenda'),
    ('posvenda', 'categorias_fonte', '"estoque"'::jsonb, 'posvenda'),
    ('posvenda', 'sla_pausa_terceiro', 'false'::jsonb, 'posvenda')
  ) as p(modulo, chave, valor, modulo_requerido)
$function$;
-- <<< config_padroes
revoke all on function public.config_padroes() from public, anon;
grant execute on function public.config_padroes() to authenticated, service_role;

create or replace function public.config_semear(p_empresa bigint, p_modulo text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n integer;
begin
  -- a semente do banco LOCAL (scripts/teste-local.sh) recria empresas ANTIGAS (anteriores à 1.1i, como as da produção):
  -- ela marca a sessão e nada é semeado. Na produção ninguém liga esta marca.
  if coalesce(current_setting('nexus.semente_legado', true), '') = '1' then return 0; end if;
  insert into public.empresa_config (empresa_id, filial_id, modulo, chave, valor)
  select p_empresa, null, d.modulo, d.chave, d.valor
    from public.config_padroes() d
   where (p_modulo is null and d.modulo_requerido is null) or (p_modulo is not null and d.modulo_requerido = p_modulo)
  on conflict (empresa_id, coalesce(filial_id, 0::bigint), modulo, chave) do nothing;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public.config_semear(bigint, text) from public, anon, authenticated;

create or replace function public.config_semear_empresa_nova()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.config_semear(new.id, null);
  return null;
end $function$;
revoke all on function public.config_semear_empresa_nova() from public, anon, authenticated;

create or replace function public.config_semear_modulo_instalado()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(new.ativo, true) then perform public.config_semear(new.empresa_id, new.modulo); end if;
  return null;
end $function$;
revoke all on function public.config_semear_modulo_instalado() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'empresas_semear_config' and tgrelid = 'public.empresas'::regclass) then
    create trigger empresas_semear_config after insert on public.empresas
      for each row execute function public.config_semear_empresa_nova();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'empresa_modulos_semear_config' and tgrelid = 'public.empresa_modulos'::regclass) then
    create trigger empresa_modulos_semear_config after insert or update of ativo on public.empresa_modulos
      for each row execute function public.config_semear_modulo_instalado();
  end if;
end $$;
