-- A VENDA É OBRIGATÓRIA NO BANCO (Lucas, 24/11/2026; proposta do §8.7 da Entrega C).
--
-- Até aqui a exigência de `dados.venda` (data, categoria, condição, valor) ao entrar no ganho estava só na rota
-- /api/leads/mover (lib/venda-ganho.ts). Um vendedor com a sessão dele conseguia, pela API direta do Supabase,
-- marcar ganho sem venda ou editar a venda já gravada. Agora o gatilho `negocios_venda_exigida` decide:
--
-- 1. ENTRAR NO GANHO (insert já ganho, ou status que passa a ganho) exige `dados.venda` (objeto).
--    - Sessão de usuário (papel authenticated/anon): sempre. Não há exceção para sessão.
--    - Fora de sessão, passa sem venda só com a MARCA EXPLÍCITA DE EXCEÇÃO, como na reabertura:
--        * SQL (scripts, RPCs, testes):  select set_config('nexus.venda_excecao', '<motivo>', true);
--        * servidor com a chave de serviço (PostgREST): cabeçalho `x-nexus-venda-excecao: <motivo>`
--          (lido de request.headers, e SÓ quando o papel é service_role — a sessão que mandar o cabeçalho
--          continua barrada). É assim que o desfazer da junção (lib/juntar-negocios.ts) devolve um ganho
--          antigo sem venda.
--    - Sem venda e sem marca: VENDA_OBRIGATORIA.
-- 2. DEPOIS DE GRAVADA, a sessão não muda `dados.venda` direto (nem cria, nem altera, nem apaga) fora da
--    entrada no ganho: VENDA_SO_POR_RPC. As RPCs (corrigir_data_venda, reabrir_negocio e as futuras) são
--    SECURITY DEFINER, rodam como o dono das funções e passam. Servidor e scripts continuam podendo
--    classificar a venda (ex.: categoria dos ganhos antigos).
--
-- Não muda nada em quem já grava certo: a rota manda a venda ao entrar no ganho; corrigir data e reabrir são
-- RPCs; as demais escritas de `dados` (ficha, marcarNoLead, reservas) leem e regravam o JSON atual, com a venda.
-- Os ganhos antigos sem venda continuam como estão: a regra só vale na ENTRADA no ganho.
--
-- Volta: supabase/scripts/volta/volta-venda-exigida.sql
-- Teste: supabase/scripts/testes/teste-venda-exigida.sql + tests/integracao/venda-local.test.ts (PostgREST de verdade)

create or replace function public.core_negocio_venda_exigida()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sessao boolean := current_user in ('authenticated', 'anon');
  v_entra  boolean := new.status = 'ganho' and (tg_op = 'INSERT' or old.status is distinct from 'ganho');
  v_marca  text;
begin
  -- 1. Entrar no ganho exige a venda (ou, fora de sessão, a marca explícita de exceção).
  if v_entra and jsonb_typeof(new.dados -> 'venda') is distinct from 'object' then
    if not v_sessao then
      v_marca := nullif(btrim(coalesce(current_setting('nexus.venda_excecao', true), '')), '');
      if v_marca is null and current_user = 'service_role' then
        begin
          v_marca := nullif(btrim(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-nexus-venda-excecao', '')), '');
        exception when others then v_marca := null;  -- cabeçalhos ilegíveis: sem marca
        end;
      end if;
    end if;
    if v_marca is null then
      raise exception using
        errcode = 'P0001',
        message = 'VENDA_OBRIGATORIA: para marcar o negócio ' || coalesce(new.id::text, 'novo')
                  || ' como venda fechada, informe data, categoria, condição e valor da venda.',
        hint = 'Use a tela (rota /api/leads/mover com a venda). Fora de sessão: marca nexus.venda_excecao ou cabeçalho x-nexus-venda-excecao.';
    end if;
  end if;

  -- 2. Depois de gravada, a sessão não mexe na venda direto: só pelas RPCs.
  if v_sessao and not v_entra
     and (new.dados -> 'venda') is distinct from (case when tg_op = 'UPDATE' then old.dados -> 'venda' end) then
    raise exception using
      errcode = '42501',
      message = 'VENDA_SO_POR_RPC: os dados da venda do negócio ' || coalesce(new.id::text, 'novo')
                || ' só mudam pela correção da venda (dono ou administrador).',
      hint = 'Data: corrigir_data_venda(negocio, data, motivo). Desfazer: reabrir_negocio(negocio, motivo).';
  end if;
  return new;
end $function$;

revoke all on function public.core_negocio_venda_exigida() from public, anon, authenticated;

drop trigger if exists negocios_venda_exigida on public.negocios;
create trigger negocios_venda_exigida
  before insert or update of status, dados on public.negocios
  for each row execute function public.core_negocio_venda_exigida();

comment on function public.core_negocio_venda_exigida() is
  'Entrar no ganho exige dados.venda (sessão sempre; fora de sessão, a marca nexus.venda_excecao ou o cabeçalho x-nexus-venda-excecao do service_role). Sessão não muda dados.venda fora da entrada no ganho: só RPC (24/11/2026).';
