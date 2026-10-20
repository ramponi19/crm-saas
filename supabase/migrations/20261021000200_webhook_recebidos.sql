-- =====================================================================================
-- Reenvio da Meta: o mesmo webhook respondido em milissegundos, sem processar de novo.
--
-- POR QUE EXISTE (observação de 20/10/2026, docs/reconstrucao-nexus/06): desde a conexão
-- do WhatsApp de Jaguariúna (13/10) a Meta reentregou o MESMO pacote de sincronização 418
-- vezes (smb_app_state_sync) e 252 vezes (history). Pacote > 10 KB leva mediana de 63 s na
-- Edge; a Meta não recebe o 200 a tempo e manda de novo — e cada reentrega reprocessa tudo.
--
-- ops.webhook_recebidos guarda o SHA-256 do corpo bruto por 24 h. A Edge pergunta a
-- webhook_reenvio antes de processar: já visto → 200 imediato.
--   · pacote grande (> 10 KB): a Edge pede para gravar JÁ na pergunta (p_gravar = true),
--     antes de começar — é a reentrega dele que precisa parar enquanto o primeiro processa;
--   · pacote pequeno: a pergunta não grava; a Edge grava DEPOIS de processar, para que uma
--     falha no meio ainda deixe a Meta reenviar e a mensagem não se perca.
-- A retenção de 24 h é feita pela própria função (apaga o vencido a cada chamada, pelo índice).
-- Só service_role executa. Sem FK para canais: é registro operacional de 24 h, e canal_id
-- é só para leitura humana ("de qual conta veio a enxurrada").
-- =====================================================================================
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.webhook_recebidos (
  hash         text primary key,
  canal_id     bigint,
  recebido_em  timestamptz not null default now(),
  tamanho      integer not null
);
create index if not exists webhook_recebidos_recebido_em_idx on ops.webhook_recebidos (recebido_em);
alter table ops.webhook_recebidos enable row level security;
revoke all on ops.webhook_recebidos from public, anon, authenticated;

-- Devolve TRUE quando o corpo já foi recebido nas últimas 24 h (é reenvio: não processar).
create or replace function public.webhook_reenvio(p_hash text, p_tamanho integer, p_conta text, p_gravar boolean)
  returns boolean
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_canal bigint;
  v_novo  boolean;
begin
  delete from ops.webhook_recebidos where recebido_em < now() - interval '24 hours';
  if exists (select 1 from ops.webhook_recebidos where hash = p_hash) then
    return true;
  end if;
  if not p_gravar then
    return false;
  end if;
  select c.id into v_canal from public.canais c where c.external_id = p_conta order by c.id limit 1;
  insert into ops.webhook_recebidos (hash, canal_id, tamanho) values (p_hash, v_canal, p_tamanho)
  on conflict (hash) do nothing
  returning true into v_novo;
  -- Dois reenvios idênticos chegando juntos: só um grava; o outro é tratado como reenvio.
  return coalesce(not v_novo, true);
end $$;

revoke execute on function public.webhook_reenvio(text, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.webhook_reenvio(text, integer, text, boolean) to service_role;

-- Esquecer um hash: o pacote grande grava o hash ANTES de processar; se o
-- processamento cair por erro de banco, a Edge responde 500 para a Meta reenviar
-- e precisa apagar o hash — senão o reenvio seria tomado por repetição e descartado.
create or replace function public.webhook_reenvio_esquecer(p_hash text)
  returns void
  language sql security definer
  set search_path to 'public', 'pg_temp'
as $$
  delete from ops.webhook_recebidos where hash = p_hash;
$$;

revoke execute on function public.webhook_reenvio_esquecer(text) from public, anon, authenticated;
grant execute on function public.webhook_reenvio_esquecer(text) to service_role;
