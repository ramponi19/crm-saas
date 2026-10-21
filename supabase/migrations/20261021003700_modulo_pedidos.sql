-- ETAPA 0, 2.5 — pedido de ativação de módulo (21/10/2026).
--
-- Módulo desligado deixou de ser redirect: Agenda, Executivo e Gestão de Leads
-- mostram uma vitrine com o botão "Ativar". Quem ativa é o superadmin; o dono,
-- ao clicar, deixa um PEDIDO aqui, que aparece na tela da empresa no superadmin.
--
-- Não destrutiva: tabela nova, vazia. Roda antes do deploy, junto das 003xxx.
-- O índice de "um pedido aberto por módulo" vem na 20261021003710, CONCURRENTLY.

create table if not exists public.modulo_pedidos (
  id           bigint generated always as identity primary key,
  empresa_id   bigint not null references public.empresas(id) on delete cascade,
  -- O href do módulo, como o menu e a trava o conhecem: '/agenda', '/executivo'…
  modulo       text not null,
  pedido_por   uuid references public.usuarios(id) on delete set null,
  pedido_em    timestamptz not null default now(),
  atendido_em  timestamptz,
  atendido_por uuid references public.usuarios(id) on delete set null
);

-- Só as rotas tocam esta tabela, com a chave de serviço e DEPOIS de conferir o
-- papel (dono/admin pede; superadmin atende). RLS ligada e nenhuma política: o
-- navegador não lê nem grava, nem por engano.
alter table public.modulo_pedidos enable row level security;
revoke all on public.modulo_pedidos from anon, authenticated;
-- Explícito, sem depender do privilégio padrão de quem roda a migração.
grant select, insert, update on public.modulo_pedidos to service_role;
