-- 5a, semente (26/11/2026): cada vínculo ATIVO, sem a rede, de empresa com 2+ lojas ativas ganha a lista igual ao que vê
-- hoje: [coalesce(filial_id, matriz)]. Quem vê a rede (dono, admin, cargo de sistema ou `lojas.ver_rede`) fica sem lista.
-- Idempotente (on conflict do nothing). Prova: matriz de acesso dos vínculos da JM igual antes e depois
-- (supabase/scripts/testes/teste-lojas-que-enxerga.sql e conferência de leitura na produção).
-- Volta: apagar as linhas com criado_por nulo criadas por esta semente (scripts/volta/volta-lojas-que-enxerga.sql).

set local lock_timeout = '5s';

insert into public.empresa_usuario_lojas (empresa_id, usuario_id, filial_id, criado_por)
select eu.empresa_id, eu.usuario_id,
       coalesce(eu.filial_id, (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.matriz and f.ativo limit 1)),
       null
  from public.empresa_usuarios eu
  left join public.empresa_cargos c on c.id = eu.cargo_id
 where eu.ativo
   and (select count(*) from public.filiais f where f.empresa_id = eu.empresa_id and f.ativo) >= 2
   and eu.role not in ('owner', 'admin')
   and not coalesce(c.sistema, false)
   and not exists (select 1 from public.empresa_cargo_permissoes cp where cp.cargo_id = eu.cargo_id and cp.permissao = 'lojas.ver_rede')
   and not exists (select 1 from public.usuarios u where u.id = eu.usuario_id and u.is_super_admin)
   and coalesce(eu.filial_id, (select f.id from public.filiais f where f.empresa_id = eu.empresa_id and f.matriz and f.ativo limit 1)) is not null
on conflict do nothing;
