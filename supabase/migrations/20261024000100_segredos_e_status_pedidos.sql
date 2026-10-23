-- =====================================================================================
-- PRIMEIRA MIGRAÇÃO DA VIAGEM (preparada em 23/10/2026; aplicar só com o ok do Lucas).
--
-- 1. empresa_segredos: segredo por empresa, CIFRADO (AES-256-GCM de lib/payments/crypto.ts,
--    chave PAYMENT_ENCRYPTION_KEY, que nunca toca o banco). Primeiro uso: o token de portal e
--    do site (`portal_leads`), gerado quando o módulo Imóveis é instalado. Até 22/10 esse token
--    ficava em texto em configuracoes_sistema e era criado a cada visita a Integrações, para
--    qualquer empresa (linhas apagadas em 22/10; ver o 06, seção 13).
--    RLS ligada e SEM política: anon e authenticated não têm grant nem política; só a
--    service_role (servidor) lê e grava. O valor em claro só existe no servidor.
--
-- 2. modulo_pedidos.status (pendente / atendido / recusado): o "Recusar" do superadmin deixa
--    de apagar o pedido (até aqui apagava e registrava em superadmin_logs — decisão do Lucas
--    de 22/10). A coerência fica no banco: atendido ⇔ atendido_em, recusado ⇔ recusado_em.
--    O índice "um pedido aberto por módulo" passa a valer para status = 'pendente' — ele vai
--    no arquivo seguinte (20261024000110), com CONCURRENTLY, fora de transação.
-- =====================================================================================

create table public.empresa_segredos (
  empresa_id     bigint not null references public.empresas(id) on delete cascade,
  chave          text not null check (chave ~ '^[a-z][a-z0-9_]*$'),
  valor_cifrado  text not null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  primary key (empresa_id, chave)
);
comment on table public.empresa_segredos is
  'Segredos por empresa, cifrados no servidor (AES-256-GCM, PAYMENT_ENCRYPTION_KEY). RLS sem política: só service_role. Ver lib/segredos.ts.';
alter table public.empresa_segredos enable row level security;
revoke all on public.empresa_segredos from public, anon, authenticated;
grant select, insert, update, delete on public.empresa_segredos to service_role;

alter table public.modulo_pedidos
  add column status       text not null default 'pendente',
  add column recusado_em  timestamptz,
  add column recusado_por uuid references public.usuarios(id) on delete set null;

update public.modulo_pedidos set status = 'atendido' where atendido_em is not null;

alter table public.modulo_pedidos
  add constraint modulo_pedidos_status_check check (status in ('pendente', 'atendido', 'recusado')),
  add constraint modulo_pedidos_status_coerente check (
    (status = 'atendido') = (atendido_em is not null) and (status = 'recusado') = (recusado_em is not null)
  );
