-- =====================================================================================
-- 1.1 (sincronização, roda ANTES do deploy): o menu passa a ler o core.
--
-- O corte (20/10) copiou segmentos_config e as colunas de menu de empresas para o core uma
-- vez só, e ninguém leu nem gravou nelas depois. Esta migração copia de novo, no formato que o
-- app novo lê (lib/empresa-config.ts), e não apaga nada: o app de hoje segue funcionando até o
-- deploy. O DROP de segmentos_config vem em 20261022000100, depois do deploy.
--
--   presets_onboarding.rotulos  = label_overrides do segmento + _menu {hidden_hrefs,
--                                 modulos_habilitados, modulos_extra, menu_layout, ordem}
--   empresa_menu.itens          = { superadmin: menu_override, dono: menu_config }  (sem fundir:
--                                 o corte fundia as camadas e perdia a precedência)
--   empresa_modulos.config      = { forcado: true|false } para cada chave de modulos_override
-- =====================================================================================

insert into public.presets_onboarding (chave, nome, descricao, rotulos, ativo)
select s.chave, s.label, s.descricao,
       coalesce(s.label_overrides, '{}'::jsonb) || jsonb_build_object('_menu', jsonb_strip_nulls(jsonb_build_object(
         'hidden_hrefs', s.hidden_hrefs, 'menu_layout', s.menu_layout,
         'modulos_habilitados', s.modulos_habilitados, 'modulos_extra', s.modulos_extra, 'ordem', s.ordem))),
       s.ativo
  from public.segmentos_config s
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, rotulos = excluded.rotulos,
      ativo = excluded.ativo, updated_at = now();

update public.empresas e set preset_onboarding = e.segmento
 where e.segmento is not null and e.preset_onboarding is distinct from e.segmento
   and exists (select 1 from public.presets_onboarding p where p.chave = e.segmento);

insert into public.empresa_menu (empresa_id, itens)
select e.id, jsonb_strip_nulls(jsonb_build_object('superadmin', e.menu_override, 'dono', e.menu_config))
  from public.empresas e
on conflict (empresa_id) do update set itens = excluded.itens, updated_at = now();

insert into public.empresa_modulos (empresa_id, modulo, origem, config, ativo)
select e.id, k.key, 'addon', jsonb_build_object('forcado', k.value), true
  from public.empresas e cross join lateral jsonb_each(coalesce(e.modulos_override, '{}'::jsonb)) k
 where jsonb_typeof(k.value) = 'boolean' and k.key ~ '^[a-z][a-z0-9_]*$'
on conflict (empresa_id, modulo) do update
  set config = public.empresa_modulos.config || jsonb_build_object('forcado', excluded.config -> 'forcado'), updated_at = now();
