-- ENTREGA C, ETAPA C1 — ESQUEMA DO MÓDULO PÓS-VENDA (docs/design-pos-venda.md §8.1 e §8.8; 24/11/2026).
--
-- Só estrutura: nada é ligado, nenhuma empresa recebe régua, nenhum gatilho em tabela do core.
-- Módulo `posvenda` (core/modulos.ts): toda tabela nasce com o prefixo `posvenda_`.
--
-- Leitura (RLS): empresa da sessão e loja visível (filiais_visiveis), como as outras tabelas de módulo.
--   - Acompanhamentos: o vendedor vê só os DELE; dono/admin veem todos da empresa.
--   - Chamados: o responsável e os administradores.
-- Escrita:
--   - configuração (réguas, passos, pesquisas, status, categorias, SLA): dono/admin, pela RLS;
--   - operação (jornadas, acompanhamentos, respostas, chamados, eventos, roleta): SÓ por RPC SECURITY
--     DEFINER (C2/C3/C7). A sessão não tem grant de escrita nelas.
-- `responsavel_id` é NOT NULL em acompanhamentos e chamados (D9: nada nasce sem responsável), com a ORIGEM
-- da escolha (`origem_responsavel`), que decide o caminho do teto diário e da ausência (§8.8).
--
-- Volta: supabase/scripts/volta/volta-posvenda-esquema.sql
-- Teste: supabase/scripts/testes/teste-posvenda-esquema.sql (+ esperado em supabase/scripts/teste-local/esperado)

-- ── Configuração ────────────────────────────────────────────────────────────────────────────────
create table public.posvenda_pesquisas (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null,
  tipo text not null default 'nps' check (tipo in ('nps', 'csat')),
  pergunta text not null,
  pergunta_comentario text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.posvenda_cadencias (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  prioridade int not null default 0,
  gatilho text not null default 'ganho' check (gatilho in ('ganho')),
  filtros jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object'),
  ao_recomprar text not null default 'reiniciar' check (ao_recomprar in ('reiniciar', 'manter', 'encerrar')),
  ancora_padrao text not null default 'ganho' check (ancora_padrao in ('ganho', 'entrega')),
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index posvenda_cadencias_empresa on public.posvenda_cadencias (empresa_id, ativo);

create table public.posvenda_cadencia_passos (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  cadencia_id bigint not null references public.posvenda_cadencias(id) on delete cascade,
  ordem int not null,
  ativo boolean not null default true,
  filtros jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object'),
  dia_offset int not null check (dia_offset >= 0),
  ancora text check (ancora in ('ganho', 'entrega')),
  hora_sugerida time,
  tipo_acao text not null check (tipo_acao in ('whatsapp', 'ligacao', 'pesquisa', 'tarefa_interna')),
  titulo text not null,
  roteiro text,
  modelo_id bigint,
  pesquisa_id bigint references public.posvenda_pesquisas(id) on delete set null,
  -- D9 (24/11): acompanhamento (vendedor → padrão da loja → roleta da loja → administradores) | administradores | usuario:<uuid>
  responsavel text not null default 'acompanhamento'
    check (responsavel in ('acompanhamento', 'administradores') or responsavel ~ '^usuario:[0-9a-f-]{36}$'),
  tolerancia_dias int not null default 7 check (tolerancia_dias >= 0),
  pular_se jsonb not null default '[]'::jsonb check (jsonb_typeof(pular_se) = 'array'),
  unique (cadencia_id, ordem)
);

create table public.posvenda_chamado_status (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('aberto', 'andamento', 'aguardando_cliente', 'aguardando_terceiro', 'resolvido')),
  ordem int not null default 0,
  cor text,
  ativo boolean not null default true
);

create table public.posvenda_chamado_categorias (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true
);

create table public.posvenda_chamado_sla (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  categoria_id bigint references public.posvenda_chamado_categorias(id) on delete cascade,
  prioridade text not null check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  primeira_resposta_horas int not null check (primeira_resposta_horas > 0),
  resolucao_horas int not null check (resolucao_horas > 0),
  horario_comercial boolean not null default false
);
create unique index posvenda_chamado_sla_unico on public.posvenda_chamado_sla (empresa_id, coalesce(categoria_id, 0), prioridade);

-- ── Operação ────────────────────────────────────────────────────────────────────────────────────
create table public.posvenda_jornadas (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint references public.filiais(id),
  contato_id bigint not null references public.contatos(id) on delete cascade,
  negocio_id bigint references public.negocios(id) on delete cascade,
  compra_historica_id bigint,
  cadencia_id bigint not null references public.posvenda_cadencias(id),
  ancora_em timestamptz not null,
  entrega_em timestamptz,
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'concluida', 'cancelada')),
  motivo_fim text,
  criado_em timestamptz not null default now(),
  check (negocio_id is not null or compra_historica_id is not null),
  unique (negocio_id, cadencia_id)
);
create index posvenda_jornadas_contato on public.posvenda_jornadas (empresa_id, contato_id, status);

create table public.posvenda_acompanhamentos (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint references public.filiais(id),
  jornada_id bigint not null references public.posvenda_jornadas(id) on delete cascade,
  passo_id bigint not null references public.posvenda_cadencia_passos(id),
  contato_id bigint not null references public.contatos(id) on delete cascade,
  negocio_id bigint references public.negocios(id) on delete cascade,
  responsavel_id uuid not null,
  origem_responsavel text not null check (origem_responsavel in ('vendedor', 'padrao_loja', 'roleta', 'administradores', 'dono', 'manual')),
  previsto_para timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'feito', 'sem_resposta', 'reagendado', 'pulado', 'perdido', 'cancelado')),
  resultado text,
  observacao text,
  cliente_respondeu_em timestamptz,
  feito_por uuid,
  feito_em timestamptz,
  tentativas int not null default 0,
  criado_em timestamptz not null default now()
);
create index posvenda_acompanhamentos_fila on public.posvenda_acompanhamentos (empresa_id, responsavel_id, previsto_para) where status = 'pendente';
create index posvenda_acompanhamentos_jornada on public.posvenda_acompanhamentos (jornada_id);

create table public.posvenda_respostas (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint references public.filiais(id),
  contato_id bigint not null references public.contatos(id) on delete cascade,
  negocio_id bigint references public.negocios(id) on delete cascade,
  acompanhamento_id bigint references public.posvenda_acompanhamentos(id) on delete set null,
  pesquisa_id bigint not null references public.posvenda_pesquisas(id),
  nota smallint not null check (nota between 0 and 10),
  comentario text,
  canal text,
  vendedor_id uuid,
  respondida_em timestamptz not null default now(),
  registrada_por uuid,
  unique (negocio_id, pesquisa_id)
);
create index posvenda_respostas_empresa on public.posvenda_respostas (empresa_id, respondida_em);
create index posvenda_respostas_vendedor on public.posvenda_respostas (empresa_id, vendedor_id);

create table public.posvenda_chamados (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  filial_id bigint references public.filiais(id),
  numero int not null,
  contato_id bigint not null references public.contatos(id) on delete cascade,
  negocio_id bigint references public.negocios(id) on delete set null,
  acompanhamento_id bigint references public.posvenda_acompanhamentos(id) on delete set null,
  resposta_id bigint references public.posvenda_respostas(id) on delete set null,
  categoria_id bigint references public.posvenda_chamado_categorias(id),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  status_id bigint not null references public.posvenda_chamado_status(id),
  titulo text not null,
  descricao text,
  responsavel_id uuid not null,
  origem_responsavel text not null check (origem_responsavel in ('administradores', 'dono', 'manual')),
  assistencia_garantia_id bigint,
  aberto_em timestamptz not null default now(),
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz,
  sla_resposta_vence timestamptz,
  sla_resolucao_vence timestamptz,
  sla_pausado_seg int not null default 0,
  origem text not null default 'manual' check (origem in ('manual', 'nps', 'zapintel')),
  criado_por uuid,
  unique (empresa_id, numero)
);
create index posvenda_chamados_status on public.posvenda_chamados (empresa_id, status_id);
create index posvenda_chamados_abertos on public.posvenda_chamados (empresa_id, responsavel_id) where resolvido_em is null;
create index posvenda_chamados_contato on public.posvenda_chamados (contato_id);

create table public.posvenda_chamado_eventos (
  id bigint generated always as identity primary key,
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  chamado_id bigint not null references public.posvenda_chamados(id) on delete cascade,
  tipo text not null check (tipo in ('status', 'nota', 'atribuicao', 'cliente_respondeu')),
  de text,
  para text,
  texto text,
  por uuid,
  em timestamptz not null default now()
);
create index posvenda_chamado_eventos_chamado on public.posvenda_chamado_eventos (chamado_id, em);

-- Contador da roleta do pós-venda (D9): uma linha por loja ('loja:<id>') e uma dos administradores.
-- Separado da roleta de leads (configuracoes_sistema 'roleta_leads:<loja>'), que não filtra cargo.
create table public.posvenda_roleta (
  empresa_id bigint not null references public.empresas(id) on delete cascade,
  chave text not null check (chave ~ '^(loja:[0-9]+|administradores)$'),
  ultimo_usuario_id uuid,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, chave)
);

-- ── RLS e permissões ────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  -- configuração: leitura da empresa; escrita de dono/admin (com as restritivas de somente leitura)
  foreach t in array array['posvenda_pesquisas', 'posvenda_cadencias', 'posvenda_cadencia_passos',
                           'posvenda_chamado_status', 'posvenda_chamado_categorias', 'posvenda_chamado_sla'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (empresa_id = (select get_empresa_id()))', t || '_leitura', t);
    execute format('create policy %I on public.%I for all to authenticated using (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id)) with check (empresa_id = (select get_empresa_id()) and is_empresa_admin(empresa_id))', t || '_escrita', t);
    execute format('create policy somente_leitura_insert on public.%I as restrictive for insert to authenticated with check ((select public.sessao_pode_escrever()))', t);
    execute format('create policy somente_leitura_update on public.%I as restrictive for update to authenticated using ((select public.sessao_pode_escrever())) with check ((select public.sessao_pode_escrever()))', t);
    execute format('create policy somente_leitura_delete on public.%I as restrictive for delete to authenticated using ((select public.sessao_pode_escrever()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  -- operação: só leitura pela sessão; escrita pelas RPCs do módulo
  foreach t in array array['posvenda_jornadas', 'posvenda_respostas', 'posvenda_chamado_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['posvenda_acompanhamentos', 'posvenda_chamados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  -- contador: interno, sem acesso pela sessão
  alter table public.posvenda_roleta enable row level security;
  revoke all on public.posvenda_roleta from anon, authenticated;
  grant all on public.posvenda_roleta to service_role;
end $$;

create policy posvenda_jornadas_leitura on public.posvenda_jornadas for select to authenticated
  using (empresa_id = (select get_empresa_id()) and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
create policy posvenda_respostas_leitura on public.posvenda_respostas for select to authenticated
  using (empresa_id = (select get_empresa_id()) and (filial_id is null or (select filiais_visiveis()) @> array[filial_id]));
-- O vendedor vê só os acompanhamentos dele; dono e admin veem todos da empresa (nas lojas visíveis).
create policy posvenda_acompanhamentos_leitura on public.posvenda_acompanhamentos for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and (filial_id is null or (select filiais_visiveis()) @> array[filial_id])
         and (responsavel_id = (select auth.uid()) or is_empresa_admin(empresa_id)));
-- Chamado: o responsável e os administradores.
create policy posvenda_chamados_leitura on public.posvenda_chamados for select to authenticated
  using (empresa_id = (select get_empresa_id()) and (responsavel_id = (select auth.uid()) or is_empresa_admin(empresa_id)));
create policy posvenda_chamado_eventos_leitura on public.posvenda_chamado_eventos for select to authenticated
  using (empresa_id = (select get_empresa_id())
         and exists (select 1 from public.posvenda_chamados c where c.id = chamado_id
                      and (c.responsavel_id = (select auth.uid()) or is_empresa_admin(c.empresa_id))));
