-- Foto das ENTRADAS do menu pela fonte nova (presets_onboarding + empresa_menu + empresa_modulos).
-- Rodar DEPOIS da migração 20261021003200: psql -X -A -t -f menu_foto_core.sql -o menu-core.json
select json_agg(json_build_object(
  'id', e.id, 'preset', e.preset_onboarding, 'plano', e.plano, 'permissoes', e.permissoes,
  'itens', (select m.itens from public.empresa_menu m where m.empresa_id = e.id),
  'modulos', (select coalesce(json_agg(json_build_object('modulo', x.modulo, 'ativo', x.ativo, 'config', x.config)), '[]'::json)
                from public.empresa_modulos x where x.empresa_id = e.id),
  'lojas', (select coalesce(json_agg(f.id order by f.id), '[]'::json) from public.filiais f where f.empresa_id = e.id),
  'preset_row', (select row_to_json(p) from (select chave, rotulos from public.presets_onboarding
                                               where chave = coalesce(e.preset_onboarding, 'varejo') and ativo) p)
) order by e.id)
from public.empresas e;
