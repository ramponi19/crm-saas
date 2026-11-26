-- Valores padrão de configuração (1.1i). Gerado a partir de lib/config.ts.
-- >>> config_padroes (gerado por scripts/gerar-config-padroes.mts; não editar à mão)
create or replace function public.config_padroes()
 returns table (modulo text, chave text, valor jsonb, modulo_requerido text)
 language sql immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select * from (values
    ('core', 'condicao_venda', '"exigida"'::jsonb, null),
    ('core', 'horario', '{"semana":{"0":[],"1":[{"abre":"09:00","fecha":"18:00"}],"2":[{"abre":"09:00","fecha":"18:00"}],"3":[{"abre":"09:00","fecha":"18:00"}],"4":[{"abre":"09:00","fecha":"18:00"}],"5":[{"abre":"09:00","fecha":"18:00"}],"6":[]}}'::jsonb, null),
    ('core', 'sem_ofertas', '{"botoes":["Não quero receber ofertas"],"confirmacao":"Pronto, {{nome}}: você não vai mais receber ofertas da nossa loja. Os avisos sobre a sua compra continuam chegando."}'::jsonb, null),
    ('distribuicao', 'sem_dono', '"esteira"'::jsonb, null),
    ('distribuicao', 'liberacao_diaria', '{"ativo":false}'::jsonb, null),
    ('posvenda', 'teto_diario', '30'::jsonb, 'posvenda'),
    ('posvenda', 'sla_horas', '"loja_aberta"'::jsonb, 'posvenda'),
    ('posvenda', 'nps_limite_chamado', '6'::jsonb, 'posvenda'),
    ('posvenda', 'janela_acompanhamento_dias', '3'::jsonb, 'posvenda'),
    ('posvenda', 'categorias_modelo', '["UTILITY"]'::jsonb, 'posvenda'),
    ('posvenda', 'categorias_fonte', '"estoque"'::jsonb, 'posvenda'),
    ('posvenda', 'sla_pausa_terceiro', 'false'::jsonb, 'posvenda')
  ) as p(modulo, chave, valor, modulo_requerido)
$function$;
-- <<< config_padroes
