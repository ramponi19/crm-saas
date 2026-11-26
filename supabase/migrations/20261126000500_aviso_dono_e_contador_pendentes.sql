-- ETAPA 1.1 (26/11/2026; docs/etapa-1.1-plano.md §5.2, item 1) — duas correções pequenas, compatíveis com o app no ar.
--
-- 1. AVISO AO DONO AFETADO (P2): quando um Dono muda o cargo de outro Dono (só o Dono pode: SO_DONO), o afetado recebe um
--    aviso no sistema, além da linha na Auditoria que já existia. Os avisos moram em `usuario_avisos` (núcleo): cada pessoa
--    lê só os seus e só marca como lido; quem cria é sempre função do servidor (SECURITY DEFINER).
-- 2. CONTADOR DA ABA "CUSTO PENDENTE": `estoque_custos_pendentes_resumo().total` contava LOJAS (count(*) sobre o
--    agrupamento por loja); passa a contar UNIDADES (soma dos grupos). Achado no smoke da 1.1f (§4.5.3).
-- Sem DDL em tabela do app: tabela nova + troca de corpo de duas funções (mesmas assinaturas). lock_timeout (lição de 25/11).
-- Volta: supabase/scripts/volta/volta-aviso-dono-e-contador-pendentes.sql

set local lock_timeout = '5s';

-- ── 1. avisos por pessoa ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.usuario_avisos (
  id          bigint generated always as identity primary key,
  empresa_id  bigint not null references public.empresas(id) on delete cascade,
  usuario_id  uuid   not null references public.usuarios(id) on delete cascade,
  tipo        text   not null,
  titulo      text   not null,
  texto       text,
  dados       jsonb  not null default '{}'::jsonb,
  criado_em   timestamptz not null default now(),
  lido_em     timestamptz
);
create index if not exists usuario_avisos_pessoa on public.usuario_avisos (usuario_id, criado_em desc);
create index if not exists usuario_avisos_nao_lidos on public.usuario_avisos (usuario_id) where lido_em is null;
comment on table public.usuario_avisos is 'Avisos do sistema para UMA pessoa (P2 da 1.1: cargo de Dono trocado por outro Dono). Cada um lê os seus e só marca lido_em; criação só por função do servidor.';

alter table public.usuario_avisos enable row level security;
revoke all on table public.usuario_avisos from public, anon, authenticated;
grant select on table public.usuario_avisos to authenticated;
grant update (lido_em) on table public.usuario_avisos to authenticated;
grant select, insert, update, delete on table public.usuario_avisos to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuario_avisos' and policyname = 'usuario_avisos_ler') then
    create policy usuario_avisos_ler on public.usuario_avisos for select to authenticated
      using (usuario_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuario_avisos' and policyname = 'usuario_avisos_marcar_lido') then
    create policy usuario_avisos_marcar_lido on public.usuario_avisos for update to authenticated
      using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'zz_plataforma_auditar' and tgrelid = 'public.usuario_avisos'::regclass) then
    create trigger zz_plataforma_auditar after insert or update or delete on public.usuario_avisos
      for each row execute function public.plataforma_auditar_escrita();
  end if;
end $$;

-- ── 2. usuario_cargo_trocar: igual, + aviso ao Dono afetado ─────────────────────────────────────────────────
create or replace function public.usuario_cargo_trocar(p_usuario uuid, p_cargo bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint := public.get_empresa_id(); v_antes bigint; v_novo record; v_ruins text[];
        v_era_dono boolean; v_autor text; v_cargo_novo text;
begin
  if v_emp is null then raise exception 'SEM_EMPRESA' using errcode = 'P0001'; end if;
  if not public.sessao_pode_escrever() then raise exception 'SOMENTE_LEITURA' using errcode = 'P0001'; end if;
  if not public.tem_permissao('equipe.cargos') then raise exception 'SEM_PERMISSAO: trocar cargo' using errcode = 'P0001'; end if;
  select id, sistema, nome into v_novo from public.empresa_cargos where id = p_cargo and empresa_id = v_emp;
  if v_novo.id is null then raise exception 'CARGO_INVALIDO' using errcode = 'P0001'; end if;
  if p_usuario = auth.uid() then
    raise exception 'PROPRIO_CARGO: ninguém troca o próprio cargo' using errcode = 'P0001';
  end if;
  select cargo_id into v_antes from public.empresa_usuarios where usuario_id = p_usuario and empresa_id = v_emp;
  if not found then raise exception 'SEM_VINCULO' using errcode = 'P0001'; end if;
  if not public.sessao_e_dono() then
    if v_novo.sistema or exists (select 1 from public.empresa_cargos where id = v_antes and sistema) then
      raise exception 'SO_DONO: só o Dono põe ou tira alguém do cargo Dono' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.empresa_cargo_permissoes where cargo_id in (v_antes, p_cargo) and permissao = 'equipe.cargos') then
      raise exception 'SO_DONO: só o Dono muda o cargo de quem edita cargos' using errcode = 'P0001';
    end if;
    select array_agg(permissao) into v_ruins from public.empresa_cargo_permissoes
     where cargo_id = p_cargo and not public.tem_permissao(permissao);
    if v_ruins is not null then
      raise exception 'SEM_PERMISSAO: o cargo tem o que você não tem (%)', array_to_string(v_ruins, ', ') using errcode = 'P0001';
    end if;
  end if;
  update public.empresa_usuarios set cargo_id = p_cargo where usuario_id = p_usuario and empresa_id = v_emp;
  perform public.auditar_emp(v_emp, 'usuario', p_usuario::text, 'trocar_cargo',
    jsonb_build_object('cargo', v_antes), jsonb_build_object('cargo', p_cargo), null, 'usuario_cargo_trocar');

  -- P2: o afetado era Dono e o cargo mudou (só um Dono chega aqui nesse caso) → aviso para ele
  select coalesce(sistema, false) into v_era_dono from public.empresa_cargos where id = v_antes;
  if coalesce(v_era_dono, false) and v_antes is distinct from p_cargo then
    select coalesce(nullif(nome, ''), email, 'Outro Dono') into v_autor from public.usuarios where id = auth.uid();
    v_cargo_novo := coalesce(v_novo.nome, 'outro cargo');
    insert into public.usuario_avisos (empresa_id, usuario_id, tipo, titulo, texto, dados)
    values (v_emp, p_usuario, 'cargo_dono_trocado', 'Seu cargo foi alterado',
            format('%s mudou o seu cargo de Dono para %s.', coalesce(v_autor, 'Outro Dono'), v_cargo_novo),
            jsonb_build_object('cargo_antes', v_antes, 'cargo_novo', p_cargo, 'por', auth.uid()));
  end if;
end $function$;

-- ── 3. contador da aba "Custo pendente": unidades, não lojas ────────────────────────────────────────────────
create or replace function public.estoque_custos_pendentes_resumo()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_emp bigint := public.custo_exigir_permissao();
begin
  return (select jsonb_build_object('total', coalesce(sum(n), 0), 'por_loja', coalesce(jsonb_object_agg(f, n) filter (where f is not null), '{}'::jsonb))
            from (select coalesce(filial_id, 0)::text f, count(*) n from public.estoque_custos_pendentes(null) group by 1) x);
end $function$;
