-- Canal não troca de empresa (porte do 58d7d3f, auditoria de 16/10; confirmado aberto em 09/11).
--
-- As rotas app/api/canais/whatsapp e meta gravam com o cliente de SERVIÇO (sem RLS) por
-- upsert onConflict (tipo, external_id), a única chave única de canais. Se o número ou a
-- Página já é de OUTRA empresa, o upsert vira UPDATE e troca empresa_id e token: as
-- mensagens dos clientes dela passam a cair no tenant que conectou. As rotas agora
-- recusam com 409 antes de gravar; este gatilho é a segunda trava, para qualquer caminho
-- (rota nova, script, service role) que esqueça a conferência.
--
-- Nenhum caminho legítimo muda empresa_id de um canal: desconectar APAGA a linha
-- (app/api/canais/[id] DELETE), e o número vai para outra empresa conectando de novo lá.
-- A mensagem contém "outra empresa": as rotas a reconhecem e devolvem 409.
-- Volta: supabase/scripts/volta/volta-canais-empresa-fixa.sql
create or replace function public.canais_empresa_fixa()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Este canal já está conectado em outra empresa.'
      using errcode = 'P0001',
            detail = format('canal %s (%s %s): empresa %s -> %s', old.id, old.tipo, old.external_id,
                            old.empresa_id, new.empresa_id);
  end if;
  return new;
end;
$$;

revoke all on function public.canais_empresa_fixa() from public, anon, authenticated;

drop trigger if exists canais_empresa_fixa on public.canais;
create trigger canais_empresa_fixa before update of empresa_id on public.canais
  for each row execute function public.canais_empresa_fixa();
