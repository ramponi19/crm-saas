-- Foto das ENTRADAS do menu pela fonte antiga (segmentos_config + colunas de empresas).
-- Rodar ANTES da migração 20261021003200: psql -X -A -t -f menu_foto_legado.sql -o menu-legado.json
select json_agg(json_build_object(
  'id', e.id, 'segmento', e.segmento, 'plano', e.plano, 'permissoes', e.permissoes,
  'menu_override', e.menu_override, 'menu_config', e.menu_config, 'modulos_override', e.modulos_override,
  'lojas', (select coalesce(json_agg(f.id order by f.id), '[]'::json) from public.filiais f where f.empresa_id = e.id),
  'seg', (select row_to_json(s) from (select hidden_hrefs, label_overrides, modulos_extra, modulos_habilitados, menu_layout
                                        from public.segmentos_config where chave = coalesce(e.segmento, 'varejo') and ativo) s)
) order by e.id)
from public.empresas e;
