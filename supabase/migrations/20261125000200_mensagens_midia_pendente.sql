-- MÍDIA PENDENTE EM VEZ DE TEXTO (25/11/2026, aprovado pelo Lucas; plano em docs/midia-resgate-plano.md).
--
-- Em 25/11 o Storage devolveu 520 ao gravar um áudio do WhatsApp (mensagem 363153). A Edge não tentou de novo
-- e gravou o texto "[audio]" sem arquivo. A Meta deixa baixar a mídia recebida por webhook por 7 dias; o
-- pedido ficou no cofre, mas ninguém o lia. A correção tem três partes; esta é a do banco, SÓ ADITIVA:
--
-- 1. mensagens ganha o estado da mídia: `midia_status` (nulo = normal; 'pendente' = o arquivo ainda vai ser
--    buscado; 'indisponivel' = o prazo acabou ou a Meta não tem mais), `midia_ref` (id da mídia na Meta),
--    `midia_expira_em` (até quando a Meta deixa baixar) e `midia_tentativas`.
--    Nenhuma linha nasce pendente até a Edge nova subir (depois do app que sabe mostrar a bolha).
-- 2. Índice parcial só das pendentes (a rotina e a guarda do cron não varrem a tabela).
-- 3. pg_cron `resgatar-midias` a cada 15 min: só chama /api/cron/resgatar-midias quando há pendente
--    (a Vercel não é acordada à toa). O segredo vem do Vault na hora, como o `entrada-parada`.
--
-- Não muda `mensagem_registrar`: a Edge grava a mensagem como sempre e marca o estado logo depois, por id.
-- Volta: supabase/scripts/volta/volta-mensagens-midia-pendente.sql

alter table public.mensagens
  add column if not exists midia_status text,
  add column if not exists midia_ref text,
  add column if not exists midia_expira_em timestamptz,
  add column if not exists midia_tentativas smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensagens_midia_status_chk') then
    alter table public.mensagens
      add constraint mensagens_midia_status_chk check (midia_status in ('pendente', 'indisponivel')) not valid;
  end if;
end $$;
alter table public.mensagens validate constraint mensagens_midia_status_chk;

comment on column public.mensagens.midia_status is
  'Estado do arquivo da mídia: nulo = normal; pendente = a rotina resgatar-midias ainda vai buscar na Meta; indisponivel = o prazo de 7 dias da Meta acabou ou ela não tem mais o arquivo. 25/11/2026.';
comment on column public.mensagens.midia_ref is
  'Id da mídia na Meta (WhatsApp), para a rotina de resgate buscar de novo. Só preenchido enquanto a mídia está pendente ou indisponível.';
comment on column public.mensagens.midia_expira_em is
  'Até quando a Meta deixa baixar a mídia (data da mensagem + 7 dias, prazo das mídias recebidas por webhook).';
comment on column public.mensagens.midia_tentativas is
  'Quantas vezes a rotina de resgate já tentou buscar o arquivo.';

create index if not exists mensagens_midia_pendente_idx
  on public.mensagens (midia_expira_em) where midia_status = 'pendente';

-- pg_cron: a cada 15 min, só com pendente. Idempotente (reagendar troca o comando).
select cron.schedule('resgatar-midias', '*/15 * * * *', $cron$
  select net.http_get(
    url := 'https://crm-saas-beta.vercel.app/api/cron/resgatar-midias',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
    ),
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.mensagens where midia_status = 'pendente');
$cron$);
