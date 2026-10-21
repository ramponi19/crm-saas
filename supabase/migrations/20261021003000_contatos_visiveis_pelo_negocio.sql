-- =====================================================================================
-- O CONTATO É VISTO POR QUEM VÊ A LOJA DELE — OU A LOJA DE UM NEGÓCIO OU CONVERSA DELE.
--
-- Depois da 20261021002800 (principal por loja), o Lucas tem um card em Mogi (3598) e um em
-- Jaguariúna (3548), mas o contato é UM, com a loja de Mogi. A view leads junta contatos e roda
-- com a RLS de quem consulta: em Jaguariúna o contato some, e com ele o card 3548 inteiro — as 12
-- mensagens do negócio aparecem, o card não. Vale para todo contato com negócio nas duas lojas
-- (61 na JM em 20/10/2026), desde o corte.
--
-- Regra (decisão do Lucas): o contato fica visível para quem enxerga a loja do contato OU tem
-- negócio ou conversa numa loja que a pessoa enxerga. Só a leitura muda; editar o contato pela
-- tela passa pelo gatilho da view (security definer), e as demais políticas ficam como estão.
-- Volta: recriar contatos_select com o texto antigo (abaixo, comentado).
--
--   create policy contatos_select on public.contatos for select to authenticated
--     using ((empresa_id = (select get_empresa_id())) and ((select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]));
-- =====================================================================================

drop policy if exists contatos_select on public.contatos;
create policy contatos_select on public.contatos for select to authenticated
  using (
    empresa_id = (select get_empresa_id())
    and (
      (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]
      or exists (select 1 from public.negocios n
                  where n.contato_id = contatos.id
                    and (select filiais_visiveis()) @> array[coalesce(n.filial_id, 0::bigint)])
      or exists (select 1 from public.conversas c
                  where c.contato_id = contatos.id
                    and (select filiais_visiveis()) @> array[coalesce(c.filial_id, 0::bigint)])
    )
  );
