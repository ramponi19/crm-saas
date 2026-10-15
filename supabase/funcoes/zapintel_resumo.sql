-- O RESUMO DO ZAPINTEL: AS LOJAS DO MENU E OS NÚMEROS DO RODAPÉ, AO VIVO.
--
-- Aplicada no banco em 15/10/2026. Pedido do Lucas: *"como vc me fala que o
-- painel para atualizar precisa clicar em sincronizar se voce me disse que deu
-- tudo certo para o zapintel inteiro funcionar de forma online"*.
--
-- O menu "Vendo" (1.911) e o rodapé "Atualizado em…" vinham do painel antigo,
-- calculado na Vercel e congelado até alguém clicar em "Sincronizar agora" —
-- e por isso toda tela do ZapIntel baixava o painel inteiro ao abrir, mesmo as
-- que já liam o banco. Isto aqui é o que o menu precisa, e nada mais.
--
-- "Conversa" é lead ativo com ao menos uma mensagem — a mesma conta da lista
-- de leads e do dashboard.
create or replace function public.zapintel_resumo(p_empresa bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp   bigint;
  v_lojas bigint[];
  v_out   jsonb;
begin
  select e.empresa, e.filiais into v_emp, v_lojas from zapintel_escopo(null, p_empresa) e;

  with
  L as materialized (
    select l.id, l.filial_id from leads l
    where l.empresa_id = v_emp and l.ativo and not zapintel_funil_interno(l.funil_id) and coalesce(l.filial_id, 0) = any (v_lojas)
  ),
  M as materialized (
    select m.lead_id, count(*) n, max(m.created_at) um
    from lead_mensagens m join L on L.id = m.lead_id
    where m.empresa_id = v_emp group by m.lead_id
  ),
  C as (select L.id, L.filial_id, M.n, M.um from L join M on M.lead_id = L.id)
  select jsonb_build_object(
    'empresa', v_emp,
    'empresaNome', (select nome from empresas where id = v_emp),
    'segmento', (select segmento from empresas where id = v_emp),
    'conversas', (select count(*) from C),
    'semConversa', (select count(*) from L) - (select count(*) from C),
    'mensagens', (select coalesce(sum(n), 0) from C),
    'ultimaMensagem', (select max(um) from C),
    -- A primeira é sempre "toda a rede" (id null), como o menu espera.
    'lojas', (select jsonb_build_array(jsonb_build_object('id', null, 'nome', 'Toda a rede', 'leads', count(*))) from C)
             || coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome,
                                   'leads', (select count(*) from C where C.filial_id = f.id)) order by f.id)
                          from filiais f where f.empresa_id = v_emp and f.ativo and f.id = any (v_lojas)), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

revoke all on function public.zapintel_resumo(bigint) from public, anon;
grant execute on function public.zapintel_resumo(bigint) to authenticated;
