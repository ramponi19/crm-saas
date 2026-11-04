-- contatos_update passa a enxergar o que o contatos_select enxerga (04/11/2026, manhã).
--
-- O DEFEITO (nasceu em 682444f, o deploy do card do lead, 03/11): o contato pertence
-- a UMA loja (contatos.filial_id), mas pode ter negócio ou conversa na outra. O SELECT
-- já deixava ver o contato por esse negócio/conversa; o UPDATE só pela loja do
-- próprio contato. Quando o card e o /api/leads/mover deixaram a view `leads` (cujo
-- gatilho SECURITY DEFINER passava por cima da RLS) e passaram a gravar em `contatos`
-- direto, a edição feita da outra loja virou UPDATE de 0 linhas, sem erro — a tela
-- dizia "ok" e a justificativa da perda (e nome, telefone, observações, campos do
-- contato) sumia. Em 04/11, 74 negócios abertos estavam em loja diferente da do contato.
--
-- O conserto: quem VÊ o contato pode editá-lo, exatamente como era pela view. O
-- WITH CHECK continua só na empresa (ninguém move contato para outra empresa).
-- Volta: dumps/2026-11-04-manha/volta-contatos_update.sql (texto lido da produção).

drop policy if exists contatos_update on public.contatos;

create policy contatos_update on public.contatos for update to authenticated
  using (
    (empresa_id = (select get_empresa_id()))
    and (
      (select filiais_visiveis()) @> array[coalesce(filial_id, 0::bigint)]
      or exists (
        select 1 from public.negocios n
         where n.contato_id = contatos.id
           and (select filiais_visiveis()) @> array[coalesce(n.filial_id, 0::bigint)]
      )
      or exists (
        select 1 from public.conversas c
         where c.contato_id = contatos.id
           and (select filiais_visiveis()) @> array[coalesce(c.filial_id, 0::bigint)]
      )
    )
  )
  with check (empresa_id = (select get_empresa_id()));
