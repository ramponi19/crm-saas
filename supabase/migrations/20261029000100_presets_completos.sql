-- ZERO-SEGMENTO, fim do molde por vertical (29/10/2026). Só DADOS; nenhuma tabela muda.
--
-- 1) Cada linha de presets_onboarding passa a ter TUDO com que a empresa nasce, e é
--    lida só no /register (e no preview do superadmin):
--      rotulos            rótulos do menu por href (como antes)
--      rotulos._menu      habilitados, extras e ordem JÁ MESCLADOS com o molde estático
--                         de lib/segmentos.ts (o que camadaBase montava a cada leitura),
--                         ocultos, ordem do preset e a tela inicial (saúde: /agenda)
--      rotulos._vocabulario  como a empresa chama as coisas: interesse do lead, equipe
--                         (Corretor), contato (Paciente) e os textos da Agenda da clínica
--      etapas             o funil de partida (imobiliária: o dela; os outros: o padrão)
--      campos             campos personalizados de partida (veículos: placa do item)
--      motivos_perda      já estavam iguais aos do código; não mudam
--      nome               o rótulo que o cadastro mostra ("Varejo / Loja"), que vinha do código
--
-- 2) As empresas que já existem recebem em empresa_menu.itens.base a base do preset
--    com que nasceram — a mesma conta que o app fazia em cada request. Depois disto o
--    app não lê mais presets_onboarding para empresa nenhuma: muda-se o preset, muda o
--    cadastro de quem vier, não o menu de quem já está.
--
-- Volta: supabase/scripts/volta/volta-presets-completos.sql.

update public.presets_onboarding set
  rotulos = $j${"_menu":{"hidden_hrefs":[],"modulos_habilitados":["/aparencia","/assistencia","/cadencias","/canais","/catalogo","/chat","/check-imei","/clientes","/compras","/configuracoes","/dashboard","/distribuicao","/empresa","/estoque","/fila","/financeiro","/funil","/garantia","/historico","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/pdv","/permissoes","/planos","/produtos","/propostas","/ranking","/relatorios","/scoring","/simular-parcela","/tarefas"],"modulos_extra":[],"menu_layout":{},"ordem":0},"_vocabulario":{"interesse":"Produto interessado"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'varejo';

update public.presets_onboarding set
  rotulos = $j${"_menu":{"hidden_hrefs":[],"modulos_habilitados":["/aparencia","/assistencia","/cadencias","/canais","/catalogo","/chat","/check-imei","/clientes","/compras","/configuracoes","/dashboard","/distribuicao","/empresa","/estoque","/fila","/financeiro","/funil","/garantia","/historico","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/pdv","/permissoes","/planos","/produtos","/propostas","/ranking","/relatorios","/scoring","/simular-parcela","/tarefas"],"modulos_extra":[],"menu_layout":{},"ordem":1},"_vocabulario":{"interesse":"Aparelho / equipamento"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'assistencia';

update public.presets_onboarding set
  rotulos = $j${"/catalogo":"Catálogo de serviços","/produtos":"Serviços","_menu":{"hidden_hrefs":[],"modulos_habilitados":["/aparencia","/cadencias","/canais","/catalogo","/chat","/clientes","/configuracoes","/dashboard","/distribuicao","/empresa","/fila","/financeiro","/funil","/historico","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/pdv","/permissoes","/planos","/produtos","/propostas","/ranking","/relatorios","/scoring","/tarefas"],"modulos_extra":[],"menu_layout":{},"ordem":2},"_vocabulario":{"interesse":"Serviço de interesse"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'servicos';

update public.presets_onboarding set
  rotulos = $j${"/leads":"Pipeline","/ranking":"Metas e Ranking","/executivo":"Dashboard Executivo","_menu":{"hidden_hrefs":[],"modulos_habilitados":["/agenda","/aparencia","/cadencias","/canais","/chat","/clientes","/configuracoes","/dashboard","/distribuicao","/empresa","/executivo","/financeiro","/funil","/gestao-leads","/historico","/imoveis","/leads","/marketing","/meu-menu","/modelos","/permissoes","/planos","/ranking","/relatorios","/scoring","/simular-financiamento"],"modulos_extra":[{"href":"/imoveis","label":"Imóveis","icon":"Home"},{"href":"/simular-financiamento","label":"Financiamento","icon":"Calculator"},{"href":"/ranking","label":"Metas e Ranking","icon":"Trophy","grupo":"Gestão"}],"menu_layout":{"Hoje":["/dashboard","/leads","/agenda","/tarefas","/chat"]},"ordem":3},"_vocabulario":{"interesse":"Imóvel interessado","equipe":"Corretor"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Lead novo","color":"#7FB0E8"},{"id":"contato","label":"Atendimento","color":"#C6A86A"},{"id":"credito","label":"Em Análise","color":"#FB923C"},{"id":"aprovado","label":"Aprovados","color":"#22D3EE"},{"id":"visita_agendada","label":"Em Visita","color":"#A78BFA"},{"id":"proposta","label":"Em Proposta","color":"#F4B740","tipo":"negociacao"},{"id":"contrato","label":"Contratos","color":"#6366F1"},{"id":"vistoria","label":"Vistoria","color":"#2DD4BF"},{"id":"entrega_chaves","label":"Entrega de chaves","color":"#A3E635"},{"id":"fechamento","label":"Finalizado","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'imobiliaria';

update public.presets_onboarding set
  rotulos = $j${"/clientes":"Pacientes","_menu":{"hidden_hrefs":[],"modulos_habilitados":["/agenda","/aparencia","/cadencias","/canais","/chat","/clientes","/configuracoes","/dashboard","/distribuicao","/empresa","/fila","/financeiro","/funil","/historico","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/permissoes","/planos","/propostas","/ranking","/relatorios","/scoring","/tarefas"],"modulos_extra":[],"menu_layout":{},"ordem":4,"tela_inicial":"/agenda"},"_vocabulario":{"interesse":"Procedimento / especialidade","contato":"Paciente","agenda":{"evento":"consulta","novo":"Nova consulta","pessoa":"Paciente (lead)","profissional":"Profissional","subtitulo":"Gerencie suas consultas e retornos","vazio":"Nenhuma consulta neste dia","agendado":"Consulta agendada","exemplo":"Ex: Consulta de retorno","tipos":[{"v":"visita","l":"Consulta"},{"v":"retorno","l":"Retorno"},{"v":"apresentacao","l":"Exame"},{"v":"reuniao","l":"Reunião"},{"v":"particular","l":"Particular"},{"v":"outros","l":"Outros"}]}}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'saude';

update public.presets_onboarding set
  rotulos = $j${"_menu":{"hidden_hrefs":[],"modulos_habilitados":["/aparencia","/cadencias","/canais","/cardapio","/catalogo","/chat","/clientes","/compras","/configuracoes","/dashboard","/distribuicao","/empresa","/estoque","/fila","/financeiro","/funil","/historico","/kds","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/pdv","/permissoes","/planos","/produtos","/propostas","/ranking","/relatorios","/scoring","/tarefas"],"modulos_extra":[{"href":"/cardapio","label":"Cardápio","icon":"UtensilsCrossed"}],"menu_layout":{},"ordem":5},"_vocabulario":{"interesse":"Item do cardápio"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[]$j$::jsonb,
  updated_at = now()
where chave = 'food';

update public.presets_onboarding set
  rotulos = $j${"/produtos":"Veículos","/assistencia":"Oficina","_menu":{"hidden_hrefs":["/pdv","/compras","/simular-parcela"],"modulos_habilitados":["/aparencia","/assistencia","/avaliacoes","/cadencias","/canais","/catalogo","/chat","/clientes","/compras","/configuracoes","/consulta-fipe","/dashboard","/distribuicao","/empresa","/estoque","/fila","/financeiro","/funil","/garantia","/historico","/leads","/marketing","/meu-menu","/modelos","/orcamentos","/pdv","/permissoes","/planos","/produtos","/propostas","/ranking","/relatorios","/scoring","/simular-financiamento","/tarefas"],"modulos_extra":[{"href":"/avaliacoes","icon":"ClipboardCheck","label":"Avaliações"},{"href":"/consulta-fipe","icon":"Car","label":"Consulta FIPE"},{"href":"/simular-financiamento","icon":"Calculator","label":"Financiamento"}],"menu_layout":{},"ordem":6},"_vocabulario":{"interesse":"Veículo interessado"}}$j$::jsonb,
  etapas = $j$[{"id":"novo","label":"Novo","color":"#7FB0E8"},{"id":"em_contato","label":"Em contato","color":"#C6A86A"},{"id":"negociando","label":"Negociando","color":"#F4B740","tipo":"negociacao"},{"id":"convertido","label":"Convertido","color":"#34D399","tipo":"ganho"},{"id":"perdido","label":"Perdido","color":"#DC2626","tipo":"perdido"}]$j$::jsonb,
  campos = $j$[{"entidade":"item","chave":"placa","rotulo":"Placa","tipo":"texto","modulo_dono":"estoque"}]$j$::jsonb,
  updated_at = now()
where chave = 'concessionaria';

-- O nome do preset é o rótulo que o cadastro mostra (era o do molde no código).
update public.presets_onboarding set nome = case chave
    when 'varejo' then 'Varejo / Loja'
    when 'assistencia' then 'Assistência técnica'
    when 'servicos' then 'Serviços / Prestadores'
    when 'imobiliaria' then 'Imobiliária'
    when 'saude' then 'Saúde / Clínica'
    when 'food' then 'Food / Restaurante'
    when 'concessionaria' then 'Loja de veículos'
  end
where chave in ('varejo', 'assistencia', 'servicos', 'imobiliaria', 'saude', 'food', 'concessionaria');

insert into public.empresa_menu (empresa_id, itens)
select e.id,
       jsonb_build_object('base', jsonb_build_object(
         'habilitados',  p.rotulos->'_menu'->'modulos_habilitados',
         'labels',       p.rotulos - '_menu' - '_vocabulario',
         'extras',       coalesce(p.rotulos->'_menu'->'modulos_extra', '[]'::jsonb),
         'layout',       coalesce(p.rotulos->'_menu'->'menu_layout', '{}'::jsonb),
         'tela_inicial', p.rotulos->'_menu'->'tela_inicial',
         'vocabulario',  coalesce(p.rotulos->'_vocabulario', '{}'::jsonb)))
  from public.empresas e
  join public.presets_onboarding p
    on p.chave = case when e.preset_onboarding in (select chave from public.presets_onboarding)
                      then e.preset_onboarding else 'varejo' end
on conflict (empresa_id) do update
   set itens = coalesce(public.empresa_menu.itens, '{}'::jsonb) || excluded.itens,
       updated_at = now();
