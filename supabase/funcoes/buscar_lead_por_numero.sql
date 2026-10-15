-- BUSCAR LEAD PELO NÚMERO — "#5836" na busca do topo (Ctrl+K).
--
-- Aplicada no banco em 15/10/2026. Pedido do Lucas: *"nao consigo
-- consultar/pesquisar por lead no crm"* → *"#5836 faz assim e eu ja procuro"*.
-- A busca só olhava nome e telefone, e o número do lead (o que relatórios e
-- fichas citam) não achava nada.
--
-- POR QUE UMA FUNÇÃO, E NÃO `from('leads').eq('id', n)`: para dono e admin a
-- RLS de `leads` segue a loja SELECIONADA no topo. Com Jaguariúna selecionada,
-- o lead de Mogi simplesmente não existe para a consulta — e quem procura pelo
-- número quer achar o lead, não descobrir qual loja está marcada. Aqui o dono e
-- o admin acham em qualquer loja da empresa, com `outraLoja` dizendo que ele
-- está fora da seleção (a tela de leads oferece "Abrir na Rede"); o vendedor
-- só acha nas lojas dele, como na RLS.
create or replace function public.buscar_lead_por_numero(p_id bigint)
returns table (id bigint, nome text, telefone text, produto_interessado text, loja text, outra_loja boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp   bigint := get_empresa_id();
  v_papel text;
  v_super boolean;
  v_vis   bigint[] := filiais_visiveis();
begin
  if v_emp is null or auth.uid() is null then return; end if;
  select eu.role into v_papel from empresa_usuarios eu
   where eu.usuario_id = auth.uid() and eu.empresa_id = v_emp and eu.ativo limit 1;
  select coalesce(u.is_super_admin, false) into v_super from usuarios u where u.id = auth.uid();
  if v_papel is null and not coalesce(v_super, false) then return; end if;

  return query
  select l.id, l.nome::text, l.telefone::text, l.produto_interessado::text,
         coalesce(nullif(trim(f.cidade), ''), nullif(trim(split_part(f.nome, '·', 2)), ''), f.nome)::text,
         not (l.filial_id is null or l.filial_id = any (v_vis))
  from leads l
  left join filiais f on f.id = l.filial_id
  where l.id = p_id and l.empresa_id = v_emp and l.ativo
    and (coalesce(v_super, false) or v_papel in ('owner', 'admin')
         or l.filial_id is null or l.filial_id = any (v_vis));
end $$;

revoke all on function public.buscar_lead_por_numero(bigint) from public, anon;
grant execute on function public.buscar_lead_por_numero(bigint) to authenticated;
