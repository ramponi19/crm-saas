-- =====================================================================================
-- Migração dos dados para o core v1 (aba "Desenho do core v1", seção "Migração do JM").
-- NÃO APLICADO EM PRODUÇÃO. Roda numa cópia (Postgres local restaurado do dump ou branch).
--
-- Pré-requisito, nesta ordem: 20261019000000_baseline_producao, 20261020000000_revoke_rpc,
-- 20261020000100_configuracoes_sem_segredo, 20261020000200_core_v1 (era 20261019000100,
-- renomeada no rebase sobre o passo A) e 20261021000000_mensagem_registrar.
-- Como rodar:  psql -v ON_ERROR_STOP=1 -d <copia> -f supabase/scripts/migrar_jm_para_core.sql
--              (como o dono das tabelas: postgres)
--
-- Idempotente: cada passo grava migracao.passos e é pulado se já rodou; as checagens
-- ("Checagem ao final" da aba) rodam sempre e LEVANTAM ERRO se falharem — a transação
-- inteira volta e nada fica pela metade.
--
-- Escolhas onde o desenho deixou em aberto:
--  a. Migra as 3 empresas (as tabelas são compartilhadas); "JM" é a empresa id 1.
--  b. Preserva ids: contato nascido de cliente fica com o id do cliente (o cliente mais
--     recente do grupo); negócio = id do lead; mensagem = id da lead_mensagem; canal = id
--     do canal_conectado. Assim toda FK dos módulos continua válida depois de reapontada.
--  c. Grupo de fusão = componente conexo de: mesmo (empresa, telefone E.164) [core_telefone_e164],
--     mesma identidade de canal (origem + origem_id do lead) e o vínculo clientes.lead_id.
--     Valores: vence o registro mais recente; vazios são preenchidos pelos outros.
--  d. O que não tem coluna no core e o código antigo ainda lê vai em `dados` com chave
--     reservada "_" (_lead, _cliente, _interesse, _anuncio): não passa pela validação.
--  e. empresas NÃO perde as 18 colunas agora: o código antigo ainda as lê. Elas ganham
--     COMMENT "obsoleta" e saem junto com as old_* (14 dias depois do último deploy que as lê).
--  f. Tabelas de módulo renomeadas com prefixo e view simples com o nome antigo (aceita
--     upsert). Inteligência (zapintel_*, assistente_*) e rastreamento_* não são renomeadas:
--     ZapIntel está em quarentena e rastreamento já tem prefixo.
--  g. lead_perfil_busca vira imoveis_perfis_busca (o código de imóveis faz upsert nela) e é
--     espelhada em contatos.dados (busca_*) por gatilho.
--  h. Só viram old_* as tabelas trocadas por view: leads, clientes, lead_mensagens,
--     canais_conectados. segmentos_config, complementos_empresa, followups_gerados e
--     lead_atribuicoes continuam (o código lê) com COMMENT "obsoleta".
--  i. Módulos da empresa saem dos hrefs liberados (segmento + extras + menu_override.habilitados);
--     menu oculto não desliga módulo. Inteligência = complementos_empresa.zapintel_ativo.
--  j. lead_mensagens (view) mostra cada mensagem uma vez, no negócio principal do contato
--     (o ATIVO mais recente; sem ativo, o mais recente).
-- =====================================================================================

\set ON_ERROR_STOP on
begin;
set local search_path to public, pg_temp;

create schema if not exists migracao;
create table if not exists migracao.passos (
  passo int primary key, nome text not null, concluido_em timestamptz not null default now(), detalhes jsonb);
create table if not exists migracao.origem (chave text primary key, valor numeric);
create table if not exists migracao.checagens (
  passo int, nome text, ok boolean, detalhe text, em timestamptz default now(), primary key (passo, nome));
create table if not exists migracao.mapa_contato (
  origem text not null, old_id bigint not null, contato_id bigint not null, principal boolean not null,
  motivo text, primary key (origem, old_id));
create table if not exists migracao.leads_sem_etapa (
  lead_id bigint primary key, empresa_id bigint, funil_id bigint, kanban_status text);

create or replace function migracao.feito(p int) returns boolean language sql stable as
  $$ select exists (select 1 from migracao.passos where passo = p) $$;

create or replace function migracao.marcar(p int, n text, d jsonb default null) returns void language sql as
  $$ insert into migracao.passos (passo, nome, detalhes) values (p, n, d) $$;

create or replace function migracao.afirmar(p int, n text, ok boolean, detalhe text) returns void
  language plpgsql as $$
begin
  insert into migracao.checagens (passo, nome, ok, detalhe) values (p, n, coalesce(ok, false), detalhe)
  on conflict (passo, nome) do update set ok = excluded.ok, detalhe = excluded.detalhe, em = now();
  if not coalesce(ok, false) then
    raise exception 'CHECAGEM FALHOU [passo %] %: %', p, n, detalhe;
  end if;
  raise notice 'OK [passo %] %: %', p, n, detalhe;
end $$;

create or replace function migracao.o(k text) returns numeric language sql stable as
  $$ select valor from migracao.origem where chave = k $$;

create or replace function migracao.modulo_do_href(h text) returns text language sql immutable as $$
  select case
    when h in ('/pdv', '/propostas', '/historico', '/compras', '/simular-parcela', '/simular-financiamento', '/catalogo') then 'vendas'
    when h in ('/estoque', '/produtos') then 'estoque'
    when h in ('/orcamentos/cotacao', '/check-imei', '/consulta-fipe', '/avaliacoes') then 'avaliacao'
    when h in ('/assistencia', '/garantia', '/orcamentos') then 'assistencia'
    when h = '/financeiro' then 'financeiro'
    when h in ('/imoveis', '/chaves') then 'imoveis'
    when h in ('/cardapio', '/kds') then 'comanda'
  end $$;

create or replace function migracao.hrefs(j jsonb) returns setof text language sql immutable as $$
  select case jsonb_typeof(x) when 'string' then x #>> '{}' else x ->> 'href' end
    from jsonb_array_elements(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x $$;

-- =====================================================================================
-- Passo 0 — fotografia da origem (as checagens comparam contra ela, mesmo depois dos renames)
-- =====================================================================================
do $$
begin
  if migracao.feito(0) then raise notice 'passo 0 já rodou'; return; end if;
  insert into migracao.origem values
    ('empresas', (select count(*) from empresas)),
    ('segmentos_config', (select count(*) from segmentos_config)),
    ('leads', (select count(*) from leads)),
    ('clientes', (select count(*) from clientes)),
    ('leads_valor_estimado', (select coalesce(sum(valor_estimado), 0) from leads)),
    ('leads_msgs_nao_lidas', (select coalesce(sum(msgs_nao_lidas), 0) from leads)),
    ('lead_mensagens', (select count(*) from lead_mensagens)),
    ('lead_mensagens_max_id', (select coalesce(max(id), 0) from lead_mensagens)),
    ('lead_mensagens_nao_lidas', (select count(*) from lead_mensagens where direcao = 'recebida' and not coalesce(lida, false))),
    ('canais_conectados', (select count(*) from canais_conectados)),
    ('lead_perfil_busca', (select count(*) from lead_perfil_busca)),
    ('produtos', (select count(*) from produtos)),
    ('inventario_unidades', (select count(*) from inventario_unidades)),
    ('tarefas_com_lead', (select count(*) from tarefas where lead_id is not null)),
    ('cadencia_inscricoes', (select count(*) from cadencia_inscricoes)),
    ('lead_atribuicoes', (select count(*) from lead_atribuicoes)),
    ('superadmin_logs_com_empresa', (select count(*) from superadmin_logs where empresa_id is not null)),
    ('superadmin_logs_sem_empresa', (select count(*) from superadmin_logs where empresa_id is null));
  perform migracao.marcar(0, 'fotografia da origem');
end $$;

-- =====================================================================================
-- Passo 1 — empresas → empresa_branding + empresa_modulos + empresa_menu + empresa_dados_contrato;
--           segmentos_config → presets_onboarding
-- =====================================================================================
do $$
declare
  motivos jsonb := '{
    "varejo": ["Preço / achou caro","Condição de pagamento","Sem estoque / não tinha o modelo","Comprou com concorrente","Sumiu / não respondeu","Desistiu da compra"],
    "assistencia": ["Orçamento acima do esperado","Preferiu comprar outro aparelho","Prazo de reparo longo","Consertou em outro lugar","Sumiu / não respondeu","Desistiu do reparo"],
    "imobiliaria": ["Crédito negado","Achou o valor alto","Não gostou do imóvel","Comprou/alugou com outra imobiliária","Sumiu / não respondeu","Desistiu por agora"],
    "concessionaria": ["Financiamento negado","Achou o valor alto","Avaliação do usado abaixo do esperado","Comprou em outra loja","Sumiu / não respondeu","Desistiu da troca"],
    "food": ["Preço","Demora no atendimento","Item indisponível","Pediu em outro lugar","Não respondeu","Desistiu"],
    "servicos": ["Preço","Prazo não atendia","Fechou com outro prestador","Escopo não era o esperado","Sumiu / não respondeu","Desistiu do serviço"],
    "saude": ["Valor da consulta","Não tinha convênio","Horário não atendia","Foi para outra clínica","Não respondeu","Desistiu do tratamento"]
  }'::jsonb;
begin
  if migracao.feito(1) then raise notice 'passo 1 já rodou'; return; end if;

  insert into presets_onboarding (chave, nome, descricao, modulos, etapas, campos, motivos_perda, rotulos, ativo)
  select s.chave, s.label, s.descricao,
         coalesce((select jsonb_agg(distinct migracao.modulo_do_href(h))
                     from (select migracao.hrefs(s.modulos_habilitados) h union select migracao.hrefs(s.modulos_extra)) hs
                    where migracao.modulo_do_href(h) is not null
                      and h not in (select migracao.hrefs(s.hidden_hrefs))), '[]'::jsonb),
         '[]'::jsonb, '[]'::jsonb,
         coalesce(motivos -> s.chave, motivos -> 'varejo'),
         coalesce(s.label_overrides, '{}'::jsonb) || jsonb_build_object('_menu', jsonb_build_object(
           'hidden_hrefs', s.hidden_hrefs, 'menu_layout', s.menu_layout,
           'modulos_habilitados', s.modulos_habilitados, 'modulos_extra', s.modulos_extra)),
         s.ativo
    from segmentos_config s
  on conflict (chave) do nothing;

  alter table empresas add column if not exists preset_onboarding text references presets_onboarding(chave) on delete set null;
  create index if not exists empresas_preset_onboarding_idx on empresas (preset_onboarding);
  update empresas e set preset_onboarding = e.segmento
   where e.preset_onboarding is null and exists (select 1 from presets_onboarding p where p.chave = e.segmento);

  -- ETAPA 0 (22/10/2026): as 18 colunas de empresas lidas aqui (segmento, wl_*, representante_*,
  -- banco_*, menu_override, menu_config, modulos_override) saíram (20261022000400) — este passo só
  -- roda no corte. A checagem 'empresas' (uma linha por empresa em branding/menu/dados_contrato)
  -- segue valendo; as equivalentes hoje são scripts/comparar-empresa.mts e comparar-contrato.mts.
  insert into empresa_branding (empresa_id, cor, logo_url, slogan, whatsapp, sidebar)
  select id, wl_cor, wl_logo_url, wl_slogan, wl_whatsapp, coalesce(wl_menu, '{}'::jsonb) from empresas
  on conflict (empresa_id) do nothing;

  insert into empresa_dados_contrato (empresa_id, representante_nome, representante_cpf, representante_nacionalidade,
    representante_estado_civil, representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix)
  select id, representante_nome, representante_cpf, representante_nacionalidade, representante_estado_civil,
         representante_profissao, banco_nome, banco_agencia, banco_conta, banco_pix
    from empresas
  on conflict (empresa_id) do nothing;

  insert into empresa_menu (empresa_id, itens)
  select e.id, jsonb_strip_nulls(jsonb_build_object(
           'ordem', coalesce(e.menu_config -> 'ordem', nullif(s.menu_layout, '{}'::jsonb)),
           'ocultos', (select coalesce(jsonb_agg(distinct h), '[]'::jsonb) from (
                         select migracao.hrefs(s.hidden_hrefs) h
                         union select migracao.hrefs(e.menu_override -> 'hidden')
                         union select migracao.hrefs(e.menu_config -> 'hidden')) x where h is not null),
           'rotulos', coalesce(s.label_overrides, '{}'::jsonb) || coalesce(e.menu_override -> 'labels', '{}'::jsonb)
                      || coalesce(e.menu_config -> 'labels', '{}'::jsonb),
           'habilitados', e.menu_override -> 'habilitados',
           'extras', nullif(s.modulos_extra, '[]'::jsonb)))
    from empresas e left join segmentos_config s on s.chave = e.segmento
  on conflict (empresa_id) do nothing;

  -- módulos: hrefs do segmento (menos os que o segmento esconde) + extras + liberados por empresa
  insert into empresa_modulos (empresa_id, modulo, origem, instalado_em, config, ativo)
  select x.empresa_id, x.modulo, min(x.origem), min(x.criada), '{}'::jsonb, true
    from (
      select e.id empresa_id, migracao.modulo_do_href(h) modulo, 'plano' origem, e.created_at criada
        from empresas e join segmentos_config s on s.chave = e.segmento
        cross join lateral migracao.hrefs(s.modulos_habilitados) h
       where h not in (select migracao.hrefs(s.hidden_hrefs))
      union all
      select e.id, migracao.modulo_do_href(h), 'plano', e.created_at
        from empresas e join segmentos_config s on s.chave = e.segmento
        cross join lateral migracao.hrefs(s.modulos_extra) h
      union all
      select e.id, migracao.modulo_do_href(h), 'addon', e.created_at
        from empresas e cross join lateral migracao.hrefs(e.menu_override -> 'habilitados') h
      union all
      select e.id, migracao.modulo_do_href(h), 'addon', e.created_at
        from empresas e cross join lateral migracao.hrefs(e.modulos_override) h
    ) x
   where x.modulo is not null
   group by x.empresa_id, x.modulo
  on conflict (empresa_id, modulo) do nothing;

  -- ETAPA 0 (22/10/2026): complementos_empresa saiu (20261022000200); a 20261021003400 copiou
  -- também as empresas desligadas (ativo = false). A checagem 'modulos da JM' segue valendo.
  insert into empresa_modulos (empresa_id, modulo, origem, instalado_em, ativo)
  select c.empresa_id, 'inteligencia', 'addon', c.criado_em, true
    from complementos_empresa c where c.zapintel_ativo
  on conflict (empresa_id, modulo) do nothing;

  comment on table segmentos_config is 'obsoleta: virou presets_onboarding (core v1); sai com as old_*';
  comment on table complementos_empresa is 'obsoleta: virou empresa_modulos (modulo inteligencia, origem addon); sai com as old_*';
  comment on column empresas.segmento is 'obsoleta: virou empresas.preset_onboarding + empresa_modulos';
  comment on column empresas.wl_cor is 'obsoleta: empresa_branding.cor';
  comment on column empresas.wl_logo_url is 'obsoleta: empresa_branding.logo_url';
  comment on column empresas.wl_slogan is 'obsoleta: empresa_branding.slogan';
  comment on column empresas.wl_whatsapp is 'obsoleta: empresa_branding.whatsapp';
  comment on column empresas.wl_menu is 'obsoleta: empresa_branding.sidebar';
  comment on column empresas.modulos_override is 'obsoleta: empresa_modulos';
  comment on column empresas.menu_override is 'obsoleta: empresa_menu.itens + empresa_modulos';
  comment on column empresas.menu_config is 'obsoleta: empresa_menu.itens';
  comment on column empresas.representante_nome is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.representante_cpf is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.representante_nacionalidade is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.representante_estado_civil is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.representante_profissao is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.banco_nome is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.banco_agencia is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.banco_conta is 'obsoleta: empresa_dados_contrato';
  comment on column empresas.banco_pix is 'obsoleta: empresa_dados_contrato';

  perform migracao.marcar(1, 'empresas, presets e módulos');
end $$;

do $$
declare v_jm text; v_faltam text;
begin
  perform migracao.afirmar(1, 'empresas', (select count(*) from empresas) = migracao.o('empresas')
    and (select count(*) from empresa_branding) = migracao.o('empresas')
    and (select count(*) from empresa_menu) = migracao.o('empresas')
    and (select count(*) from empresa_dados_contrato) = migracao.o('empresas'),
    format('%s empresas; branding/menu/dados_contrato uma linha por empresa', (select count(*) from empresas)));
  -- ETAPA 0 (22/10/2026): segmentos_config saiu (20261022000100). Esta checagem só vale no corte;
  -- a equivalente hoje é scripts/comparar-menu.mts (menu idêntico lido do legado e do core).
  perform migracao.afirmar(1, 'presets', (select count(*) from presets_onboarding) = migracao.o('segmentos_config'),
    format('%s presets (segmentos_config: %s)', (select count(*) from presets_onboarding), migracao.o('segmentos_config')));
  select string_agg(modulo, ', ' order by modulo) into v_jm from empresa_modulos where empresa_id = 1 and ativo;
  select string_agg(m, ', ') into v_faltam
    from unnest(array['vendas', 'estoque', 'avaliacao', 'assistencia', 'financeiro', 'inteligencia']) m
   where not exists (select 1 from empresa_modulos where empresa_id = 1 and modulo = m and ativo);
  perform migracao.afirmar(1, 'modulos da JM', v_faltam is null,
    format('JM ligados: %s%s', v_jm, coalesce(' | FALTAM: ' || v_faltam, '')));
end $$;

-- =====================================================================================
-- Passo 2 — contatos ← leads ∪ clientes, deduplicado
-- =====================================================================================
do $$
declare
  v_mudou int;
  v_seq text := pg_get_serial_sequence('public.contatos', 'id');
begin
  if migracao.feito(2) then raise notice 'passo 2 já rodou'; return; end if;

  create temp table fonte on commit drop as
  select 'cliente'::text origem, c.id old_id, c.empresa_id, c.filial_id, coalesce(c.created_at, now()) criado,
         c.nome, c.telefone, core_telefone_e164(c.telefone) e164, c.email, c.cpf_cnpj, c.instagram,
         null::text foto_url, c.origem_cliente origem_txt, null::text origem_id, null::uuid responsavel_id,
         null::timestamptz responsavel_desde, coalesce(c.ativo, true) ativo, c.observacoes, c.lead_id liga_lead
    from clientes c
  union all
  select 'lead', l.id, l.empresa_id, l.filial_id, coalesce(l.created_at, now()),
         l.nome, l.telefone, core_telefone_e164(l.telefone), null, null, l.instagram,
         l.foto_url, l.origem, l.origem_id, l.responsavel_id, l.responsavel_desde, coalesce(l.ativo, true), l.observacoes, null
    from leads l;
  alter table fonte add column no text, add column grupo text;
  update fonte set no = origem || ':' || old_id, grupo = origem || ':' || old_id;
  create index on fonte (no);

  -- arestas: mesmo telefone, mesma identidade de canal, cliente→lead
  create temp table aresta on commit drop as
  select a.no a, b.no b, 'telefone'::text motivo from fonte a join fonte b
      on a.empresa_id = b.empresa_id and a.e164 = b.e164 and a.no < b.no
  union
  select a.no, b.no, 'identidade' from fonte a join fonte b
      on a.origem = 'lead' and b.origem = 'lead' and a.empresa_id = b.empresa_id
     and a.origem_txt = b.origem_txt and a.origem_id = b.origem_id and a.no < b.no
  union
  select c.no, l.no, 'lead_cliente' from fonte c join fonte l
      on c.origem = 'cliente' and l.origem = 'lead' and l.old_id = c.liga_lead;

  -- componente conexo por propagação do menor rótulo
  loop
    update fonte f set grupo = x.g
      from (select n, min(g) g from (
              select a.a n, f2.grupo g from aresta a join fonte f2 on f2.no = a.b
              union all select a.b, f2.grupo from aresta a join fonte f2 on f2.no = a.a) y group by n) x
     where f.no = x.n and x.g < f.grupo;
    get diagnostics v_mudou = row_count;
    exit when v_mudou = 0;
  end loop;

  -- id do contato: o cliente mais recente do grupo; grupo sem cliente ganha id novo
  perform setval(v_seq, greatest((select coalesce(max(id), 0) from clientes), (select coalesce(max(id), 0) from contatos)) + 1, false);
  create temp table grupo on commit drop as
  select g.grupo,
         coalesce((select f.old_id from fonte f where f.grupo = g.grupo and f.origem = 'cliente'
                    order by f.criado desc, f.old_id desc limit 1), nextval(v_seq)) contato_id,
         (select f.no from fonte f where f.grupo = g.grupo order by f.criado desc, f.origem, f.old_id desc limit 1) principal
    from (select distinct grupo from fonte) g;

  create temp table agg on commit drop as
  select gr.grupo, gr.contato_id, p.empresa_id, p.filial_id,
         (array_agg(f.nome order by f.criado desc) filter (where nullif(f.nome, '') is not null))[1] nome,
         (array_agg(f.telefone order by f.criado desc) filter (where nullif(f.telefone, '') is not null))[1] telefone,
         (array_agg(f.e164 order by f.criado desc) filter (where f.e164 is not null))[1] e164,
         (array_agg(f.email order by f.criado desc) filter (where nullif(f.email, '') is not null))[1] email,
         (array_agg(f.cpf_cnpj order by f.criado desc) filter (where nullif(f.cpf_cnpj, '') is not null))[1] cpf_cnpj,
         (array_agg(f.instagram order by f.criado desc) filter (where nullif(f.instagram, '') is not null))[1] instagram,
         (array_agg(f.foto_url order by f.criado desc) filter (where f.foto_url is not null))[1] foto_url,
         (array_agg(f.origem_txt order by f.criado desc) filter (where f.origem_txt is not null))[1] origem,
         (array_agg(f.origem_id order by f.criado desc) filter (where f.origem_id is not null))[1] origem_id,
         (array_agg(f.responsavel_id order by f.criado desc) filter (where f.responsavel_id is not null))[1] responsavel_id,
         (array_agg(f.responsavel_desde order by f.criado desc) filter (where f.responsavel_desde is not null))[1] responsavel_desde,
         bool_or(f.ativo) ativo,
         string_agg(distinct nullif(trim(f.observacoes), ''), E'\n---\n') observacoes,
         min(f.criado) criado
    from grupo gr
    join fonte f on f.grupo = gr.grupo
    join fonte p on p.no = gr.principal
   group by gr.grupo, gr.contato_id, p.empresa_id, p.filial_id;

  insert into contatos (id, empresa_id, filial_id, nome, telefone, telefone_e164, email, cpf_cnpj, instagram, foto_url,
                        origem, origem_id, tipo, responsavel_id, responsavel_desde, ativo, observacoes, endereco, dados, created_at)
  select a.contato_id, a.empresa_id, a.filial_id, a.nome, a.telefone, a.e164, a.email, a.cpf_cnpj, a.instagram, a.foto_url,
         a.origem, a.origem_id,
         case when length(regexp_replace(coalesce(a.cpf_cnpj, ''), '\D', '', 'g')) = 14 then 'empresa' else 'pessoa' end,
         case when exists (select 1 from usuarios u where u.id = a.responsavel_id) then a.responsavel_id end,
         a.responsavel_desde, a.ativo, a.observacoes, '{}'::jsonb,
         jsonb_strip_nulls(jsonb_build_object('_telefones_extra',
           (select jsonb_agg(distinct f2.e164) from fonte f2 where f2.grupo = a.grupo and f2.e164 <> a.e164))),
         a.criado
    from agg a;

  -- clientes: endereço e o legado que o código antigo lê (_cliente) — do cliente que deu o id
  update contatos ct set
    endereco = jsonb_strip_nulls(jsonb_build_object('logradouro', c.endereco, 'numero', c.numero, 'complemento', c.complemento,
                                                    'bairro', c.bairro, 'cidade', c.cidade, 'estado', c.estado, 'cep', c.cep)),
    dados = ct.dados || jsonb_build_object('_cliente', jsonb_strip_nulls(jsonb_build_object(
      'cpf_validado', c.cpf_validado, 'cnpj_validado', c.cnpj_validado, 'tipo_cliente', c.tipo_cliente,
      'origem_cliente', c.origem_cliente, 'usuario_id', c.usuario_id, 'status_aprovacao', c.status_aprovacao,
      'corretor_id', c.corretor_id, 'proprietario', c.proprietario, 'lead_id', c.lead_id,
      'ids', (select jsonb_agg(f.old_id order by f.old_id) from fonte f
               where f.origem = 'cliente' and f.grupo = (select grupo from grupo where contato_id = ct.id)))))
    from clientes c where c.id = ct.id;

  insert into migracao.mapa_contato (origem, old_id, contato_id, principal, motivo)
  select f.origem, f.old_id, gr.contato_id, f.no = gr.principal,
         (select string_agg(distinct a.motivo, ',') from aresta a where a.a = f.no or a.b = f.no)
    from fonte f join grupo gr on gr.grupo = f.grupo;

  insert into contato_fusoes (empresa_id, contato_principal_id, contato_removido_id, movido, em)
  select f.empresa_id, m.contato_id, m.old_id,
         jsonb_build_object('origem', m.origem, 'old_id', m.old_id, 'motivo', m.motivo, 'migracao', 'core_v1'), now()
    from migracao.mapa_contato m join fonte f on f.origem = m.origem and f.old_id = m.old_id
   where not m.principal
     and (select count(*) from migracao.mapa_contato m2 where m2.contato_id = m.contato_id) > 1;

  insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id)
  select l.empresa_id, m.contato_id, l.origem, l.origem_id
    from leads l join migracao.mapa_contato m on m.origem = 'lead' and m.old_id = l.id
   where l.origem is not null and nullif(l.origem_id, '') is not null
  on conflict (empresa_id, canal_tipo, external_id) do nothing;

  perform setval(v_seq, (select max(id) from contatos));
  perform migracao.marcar(2, 'contatos', jsonb_build_object(
    'grupos_fundidos', (select count(*) from (select contato_id from migracao.mapa_contato group by 1 having count(*) > 1) x)));
end $$;

do $$
declare
  v_fontes numeric := migracao.o('leads') + migracao.o('clientes');
  v_contatos bigint := (select count(distinct contato_id) from migracao.mapa_contato);
  v_grupos bigint := (select count(*) from (select contato_id from migracao.mapa_contato group by 1 having count(*) > 1) x);
  v_cruz bigint := (select count(*) from (select contato_id from migracao.mapa_contato group by 1
                     having bool_or(origem = 'lead') and bool_or(origem = 'cliente')) x);
  v_rep bigint := (select count(*) from (select empresa_id, telefone_e164 from contatos where telefone_e164 is not null
                     group by 1, 2 having count(*) > 1) x);
begin
  perform migracao.afirmar(2, 'todo lead e cliente no mapa',
    (select count(*) from migracao.mapa_contato) = v_fontes,
    format('%s registros de origem, %s no mapa', v_fontes, (select count(*) from migracao.mapa_contato)));
  perform migracao.afirmar(2, 'contatos = leads + clientes - fundidos',
    (select count(*) from contatos where id in (select contato_id from migracao.mapa_contato)) = v_contatos
    and v_contatos = v_fontes - ((select count(*) from migracao.mapa_contato) - v_contatos),
    format('%s contatos = %s leads + %s clientes - %s absorvidos; %s grupos com fusão (desenho: 119), %s com lead e cliente',
           v_contatos, migracao.o('leads'), migracao.o('clientes'),
           (select count(*) from migracao.mapa_contato) - v_contatos, v_grupos, v_cruz));
  perform migracao.afirmar(2, 'nenhum telefone repetido', v_rep = 0, format('%s telefones repetidos por empresa', v_rep));
end $$;

-- =====================================================================================
-- Passo 3 — negocios ← leads (kanban_status → etapa pelo slug do funil)
-- =====================================================================================
do $$
begin
  if migracao.feito(3) then raise notice 'passo 3 já rodou'; return; end if;

  insert into campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, ordem)
  select id, 'negocio', 'produto_interessado', 'Produto de interesse', 'texto', 10 from empresas
  on conflict (empresa_id, entidade, chave) do nothing;

  create temp table lead_etapa on commit drop as
  select l.id, l.empresa_id,
         coalesce(l.funil_id, (select f.id from funis f where f.empresa_id = l.empresa_id and f.padrao and not f.interno
                                order by f.id limit 1)) funil_id,
         l.kanban_status
    from leads l;
  alter table lead_etapa add column etapa_id bigint, add column etapa_tipo text;
  update lead_etapa le set etapa_id = e.id, etapa_tipo = e.tipo
    from funil_etapas e where e.funil_id = le.funil_id and e.slug = le.kanban_status;

  insert into migracao.leads_sem_etapa (lead_id, empresa_id, funil_id, kanban_status)
  select id, empresa_id, funil_id, kanban_status from lead_etapa where etapa_id is null
  on conflict do nothing;

  alter table negocios disable trigger negocios_limite;
  insert into negocios (id, empresa_id, filial_id, contato_id, funil_id, etapa_id, ordem, valor_estimado, responsavel_id,
                        status, motivo_perda_id, perdido_em, ganho_em, entrou_etapa_em, devolucoes, devolvido_em, dados, created_at)
  select l.id, l.empresa_id, l.filial_id, m.contato_id, le.funil_id, le.etapa_id, coalesce(l.kanban_ordem, 0), l.valor_estimado,
         case when exists (select 1 from usuarios u where u.id = l.responsavel_id) then l.responsavel_id end,
         case when le.etapa_tipo = 'ganho' then 'ganho'
              when le.etapa_tipo = 'perdido' or (le.etapa_id is null and l.perdido_em is not null) then 'perdido'
              else 'aberto' end,
         l.motivo_perda_id, l.perdido_em,
         case when le.etapa_tipo = 'ganho' then coalesce(l.data_transferencia_funil, l.created_at) end,
         coalesce(l.data_transferencia_funil, l.created_at), coalesce(l.devolucoes, 0), l.devolvido_em,
         jsonb_strip_nulls(jsonb_build_object(
           'produto_interessado', nullif(l.produto_interessado, ''),
           '_interesse', l.interesse, '_anuncio', l.anuncio,
           '_lead', jsonb_strip_nulls(jsonb_build_object(
             'ativo', coalesce(l.ativo, true), 'primeira_msg', l.primeira_msg, 'ultima_tratativa', l.ultima_tratativa,
             'responsavel_desde', l.responsavel_desde, 'convertido_em', l.convertido_em, 'nome', l.nome,
             'telefone', l.telefone, 'origem', l.origem, 'origem_id', l.origem_id, 'instagram', l.instagram,
             'kanban_status', case when le.etapa_id is null then l.kanban_status end)))),
         coalesce(l.created_at, now())
    from leads l
    join migracao.mapa_contato m on m.origem = 'lead' and m.old_id = l.id
    join lead_etapa le on le.id = l.id
  on conflict (id) do nothing;
  alter table negocios enable trigger negocios_limite;

  perform setval(pg_get_serial_sequence('public.negocios', 'id'), (select max(id) from negocios));
  perform migracao.marcar(3, 'negócios', jsonb_build_object('sem_etapa', (select count(*) from migracao.leads_sem_etapa)));
end $$;

do $$
declare v_n bigint; v_soma numeric;
begin
  select count(*), coalesce(sum(valor_estimado), 0) into v_n, v_soma
    from negocios where id in (select old_id from migracao.mapa_contato where origem = 'lead');
  perform migracao.afirmar(3, 'um negócio por lead', v_n = migracao.o('leads'),
    format('%s negócios (leads na origem: %s; desenho: 3.701)', v_n, migracao.o('leads')));
  perform migracao.afirmar(3, 'soma de valor_estimado', v_soma = migracao.o('leads_valor_estimado'),
    format('negócios %s = leads %s', v_soma, migracao.o('leads_valor_estimado')));
  perform migracao.afirmar(3, 'leads sem etapa (informativo)', true,
    format('%s leads sem etapa correspondente no funil', (select count(*) from migracao.leads_sem_etapa)));
end $$;

-- =====================================================================================
-- Passo 4 — canais, conversas (distinct contato × canal) e mensagens
-- =====================================================================================
do $$
begin
  if migracao.feito(4) then raise notice 'passo 4 já rodou'; return; end if;

  insert into canais (id, empresa_id, filial_id, tipo, external_id, waba_id, ig_user_id, nome_exibicao, access_token_enc,
                      token_expira_em, data_access_expira_em, coexistencia, status, ultimo_erro, ultimo_erro_em, conectado_em,
                      ultima_msg_em, sync_contatos_em, sync_historico_em, sync_request_ids, sync_historico_pct, criado_por,
                      via, created_at, updated_at)
  select id, empresa_id, filial_id, tipo, external_id, waba_id, ig_user_id, nome_exibicao, access_token_enc,
         token_expira_em, data_access_expira_em, coexistencia, status, ultimo_erro, ultimo_erro_em, conectado_em,
         ultima_msg_em, sync_contatos_em, sync_historico_em, sync_request_ids, sync_historico_pct, criado_por,
         via, created_at, updated_at
    from canais_conectados
  on conflict (id) do nothing;
  perform setval(pg_get_serial_sequence('public.canais', 'id'), greatest((select max(id) from canais), 1));

  insert into conversas (empresa_id, filial_id, contato_id, canal_id, status, responsavel_id)
  select m.empresa_id,
         (select c.filial_id from contatos c where c.id = mp.contato_id),
         mp.contato_id, m.canal_id, 'aberta',
         (select n.responsavel_id from negocios n where n.contato_id = mp.contato_id and n.responsavel_id is not null
           order by (n.status = 'aberto') desc, n.created_at desc limit 1)
    from lead_mensagens m
    join migracao.mapa_contato mp on mp.origem = 'lead' and mp.old_id = m.lead_id
   group by m.empresa_id, mp.contato_id, m.canal_id
  on conflict on constraint conversas_contato_canal_key do nothing;

  alter table mensagens disable trigger mensagens_sincroniza;
  alter table mensagens disable trigger mensagens_filial_do_contato;
  insert into mensagens (id, empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id,
                         midia_url, midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id,
                         canal_id, created_at, updated_at)
  select m.id, m.empresa_id, coalesce(m.filial_id, cv.filial_id), cv.id, mp.contato_id, m.direcao, coalesce(m.conteudo, ''),
         coalesce(m.tipo, 'texto'), m.origem, m.external_id, m.midia_url, m.midia_retida_em, m.transcricao,
         m.status_entrega, m.status_em, m.erro_envio, coalesce(m.lida, false),
         case when exists (select 1 from usuarios u where u.id = m.usuario_id) then m.usuario_id end,
         m.canal_id, coalesce(m.created_at, now()), coalesce(m.created_at, now())
    from lead_mensagens m
    join migracao.mapa_contato mp on mp.origem = 'lead' and mp.old_id = m.lead_id
    join conversas cv on cv.contato_id = mp.contato_id and cv.canal_id is not distinct from m.canal_id
  on conflict (id) do nothing;
  alter table mensagens enable trigger mensagens_filial_do_contato;
  alter table mensagens enable trigger mensagens_sincroniza;

  update conversas cv set
    nao_lidas = x.nao_lidas, ultima_mensagem_at = x.ultima, ultima_recebida_at = x.recebida, ultima_enviada_at = x.enviada
    from (select conversa_id, count(*) filter (where direcao = 'recebida' and not lida) nao_lidas, max(created_at) ultima,
                 max(created_at) filter (where direcao = 'recebida') recebida, max(created_at) filter (where direcao = 'enviada') enviada
            from mensagens group by 1) x
   where x.conversa_id = cv.id;

  perform setval(pg_get_serial_sequence('public.mensagens', 'id'), (select max(id) from mensagens));
  perform migracao.marcar(4, 'canais, conversas e mensagens');
end $$;

do $$
declare v_dif bigint;
begin
  perform migracao.afirmar(4, 'canais', (select count(*) from canais) >= migracao.o('canais_conectados'),
    format('%s canais (origem %s)', (select count(*) from canais), migracao.o('canais_conectados')));
  perform migracao.afirmar(4, 'uma mensagem por lead_mensagem',
    (select count(*) from mensagens where id <= migracao.o('lead_mensagens_max_id')) = migracao.o('lead_mensagens'),
    format('%s mensagens migradas (origem %s; desenho: 78.793)',
           (select count(*) from mensagens where id <= migracao.o('lead_mensagens_max_id')), migracao.o('lead_mensagens')));
  select count(*) into v_dif from conversas cv
   where cv.nao_lidas <> (select count(*) from mensagens m where m.conversa_id = cv.id and m.direcao = 'recebida' and not m.lida);
  perform migracao.afirmar(4, 'nao_lidas = recalculado', v_dif = 0,
    format('%s conversas divergentes; %s conversas; não lidas %s (origem: %s em lead_mensagens, %s em leads.msgs_nao_lidas)',
           v_dif, (select count(*) from conversas), (select coalesce(sum(nao_lidas), 0) from conversas),
           migracao.o('lead_mensagens_nao_lidas'), migracao.o('leads_msgs_nao_lidas')));
end $$;

-- =====================================================================================
-- Passo 5 — tarefas, cadencia_inscricoes, negocio_historico (e etapa_id de automações/cadências)
-- =====================================================================================
do $$
begin
  if migracao.feito(5) then raise notice 'passo 5 já rodou'; return; end if;

  alter table tarefas add column if not exists contato_id bigint references contatos(id) on delete set null;
  alter table tarefas add column if not exists negocio_id bigint references negocios(id) on delete set null;
  alter table tarefas add column if not exists origem text not null default 'manual'
    check (origem in ('manual', 'cadencia', 'automacao'));
  create index if not exists tarefas_contato_idx on tarefas (contato_id);
  create index if not exists tarefas_negocio_idx on tarefas (negocio_id);
  update tarefas t set negocio_id = t.lead_id,
                       contato_id = (select contato_id from migracao.mapa_contato m where m.origem = 'lead' and m.old_id = t.lead_id)
   where t.lead_id is not null;
  update tarefas t set origem = 'automacao' where exists (select 1 from followups_gerados f where f.tarefa_id = t.id);

  alter table cadencia_inscricoes add column if not exists negocio_id bigint references negocios(id) on delete cascade;
  create index if not exists cadencia_inscricoes_negocio_idx on cadencia_inscricoes (negocio_id);
  update cadencia_inscricoes set negocio_id = lead_id where negocio_id is null;

  alter table automacoes add column if not exists etapa_id bigint references funil_etapas(id) on delete set null;
  create index if not exists automacoes_etapa_idx on automacoes (etapa_id);
  update automacoes a set etapa_id = (select e.id from funil_etapas e join funis f on f.id = e.funil_id
                                       where e.empresa_id = a.empresa_id and e.slug = a.etapa_slug
                                       order by f.padrao desc, f.interno, f.id limit 1)
   where a.etapa_slug is not null and a.etapa_id is null;

  alter table cadencias add column if not exists gatilho_etapa_id bigint references funil_etapas(id) on delete set null;
  create index if not exists cadencias_gatilho_etapa_idx on cadencias (gatilho_etapa_id);
  update cadencias c set gatilho_etapa_id = (select e.id from funil_etapas e join funis f on f.id = e.funil_id
                                              where e.empresa_id = c.empresa_id and e.slug = c.gatilho_etapa_slug
                                              order by f.padrao desc, f.interno, f.id limit 1)
   where c.gatilho_etapa_slug is not null and c.gatilho_etapa_id is null;

  insert into negocio_historico (empresa_id, negocio_id, de_responsavel, para_responsavel, acao, por_usuario, em)
  select a.empresa_id, a.lead_id, a.de_responsavel, a.para_responsavel, a.acao, a.por_usuario, a.created_at
    from lead_atribuicoes a where exists (select 1 from negocios n where n.id = a.lead_id);

  comment on table followups_gerados is 'obsoleta: a régua vira automacoes (core v1); sai com as old_*';
  comment on table lead_atribuicoes is 'obsoleta: virou negocio_historico + eventos (core v1); sai com as old_*';
  perform migracao.marcar(5, 'remapeamento pelo mapa do passo 2');
end $$;

do $$
declare v_orf bigint;
begin
  select (select count(*) from tarefas t where t.lead_id is not null
           and (t.negocio_id is null or t.contato_id is null or not exists (select 1 from negocios n where n.id = t.negocio_id)))
       + (select count(*) from cadencia_inscricoes c where c.negocio_id is null
           or not exists (select 1 from negocios n where n.id = c.negocio_id))
       + (select count(*) from negocio_historico h where not exists (select 1 from negocios n where n.id = h.negocio_id))
    into v_orf;
  perform migracao.afirmar(5, 'nenhuma FK órfã', v_orf = 0,
    format('%s órfãs; tarefas com negócio %s/%s; inscrições %s/%s; histórico %s (lead_atribuicoes %s)', v_orf,
           (select count(*) from tarefas where negocio_id is not null), migracao.o('tarefas_com_lead'),
           (select count(*) from cadencia_inscricoes where negocio_id is not null), migracao.o('cadencia_inscricoes'),
           (select count(*) from negocio_historico), migracao.o('lead_atribuicoes')));
end $$;

-- =====================================================================================
-- Passo 6 — campos_personalizados (lead_perfil_busca + colunas de clientes) e valores em dados
-- =====================================================================================
do $$
begin
  if migracao.feito(6) then raise notice 'passo 6 já rodou'; return; end if;

  -- dados de contrato do comprador: core, todas as empresas
  insert into campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, ordem)
  select e.id, 'contato', c.chave, c.rotulo, c.tipo, c.ordem
    from empresas e cross join (values ('data_nascimento', 'Data de nascimento', 'data', 10),
                                       ('estado_civil', 'Estado civil', 'texto', 20),
                                       ('profissao', 'Profissão', 'texto', 30),
                                       ('nacionalidade', 'Nacionalidade', 'texto', 40)) c(chave, rotulo, tipo, ordem)
  on conflict (empresa_id, entidade, chave) do nothing;

  -- imóveis: empresas que usam (perfil de busca, colunas de imóvel preenchidas ou preset imobiliária)
  insert into campos_personalizados (empresa_id, entidade, chave, rotulo, tipo, opcoes, modulo_dono, ordem)
  select e.id, 'contato', c.chave, c.rotulo, c.tipo, c.opcoes::jsonb, 'imoveis', c.ordem
    from empresas e
    cross join (values
      ('tipo_negocio', 'Tipo de negócio', 'opcao', '["compra","locacao","captacao","investidor","lancamento"]', 100),
      ('valor_pretendido', 'Valor pretendido', 'moeda', '[]', 110),
      ('regiao_interesse', 'Região de interesse', 'texto', '[]', 120),
      ('busca_ativo', 'Busca ativa', 'booleano', '[]', 200),
      ('busca_finalidade', 'Finalidade', 'texto', '[]', 210),
      ('busca_tipos', 'Tipos de imóvel', 'multi', '[]', 220),
      ('busca_cidades', 'Cidades', 'multi', '[]', 230),
      ('busca_bairros', 'Bairros', 'multi', '[]', 240),
      ('busca_preco_min', 'Preço mínimo', 'moeda', '[]', 250),
      ('busca_preco_max', 'Preço máximo', 'moeda', '[]', 260),
      ('busca_quartos_min', 'Quartos (mín.)', 'numero', '[]', 270),
      ('busca_quartos_max', 'Quartos (máx.)', 'numero', '[]', 280),
      ('busca_suites_min', 'Suítes (mín.)', 'numero', '[]', 290),
      ('busca_vagas_min', 'Vagas (mín.)', 'numero', '[]', 300),
      ('busca_area_min', 'Área mínima (m²)', 'numero', '[]', 310),
      ('busca_area_max', 'Área máxima (m²)', 'numero', '[]', 320),
      ('busca_caracteristicas', 'Características', 'multi', '[]', 330),
      ('busca_observacoes', 'Observações da busca', 'texto', '[]', 340)) c(chave, rotulo, tipo, opcoes, ordem)
   where e.segmento = 'imobiliaria'
      or exists (select 1 from lead_perfil_busca p where p.empresa_id = e.id)
      or exists (select 1 from clientes c2 where c2.empresa_id = e.id
                  and (c2.tipo_negocio is not null or c2.valor_pretendido is not null or c2.regiao_interesse is not null))
  on conflict (empresa_id, entidade, chave) do nothing;

  -- valores das colunas de clientes (vence o cliente mais recente do grupo)
  update contatos ct set dados = ct.dados || x.v
    from (select m.contato_id, jsonb_strip_nulls(jsonb_build_object(
                   'data_nascimento', (array_agg(to_char(c.data_nascimento, 'YYYY-MM-DD') order by c.created_at desc)
                                        filter (where c.data_nascimento is not null))[1],
                   'estado_civil', (array_agg(c.estado_civil order by c.created_at desc) filter (where nullif(c.estado_civil, '') is not null))[1],
                   'profissao', (array_agg(c.profissao order by c.created_at desc) filter (where nullif(c.profissao, '') is not null))[1],
                   'nacionalidade', (array_agg(c.nacionalidade order by c.created_at desc) filter (where nullif(c.nacionalidade, '') is not null))[1],
                   'tipo_negocio', (array_agg(c.tipo_negocio order by c.created_at desc) filter (where c.tipo_negocio is not null))[1],
                   'valor_pretendido', (array_agg(c.valor_pretendido order by c.created_at desc) filter (where c.valor_pretendido is not null))[1],
                   'regiao_interesse', (array_agg(c.regiao_interesse order by c.created_at desc) filter (where nullif(c.regiao_interesse, '') is not null))[1])) v
            from migracao.mapa_contato m join clientes c on m.origem = 'cliente' and c.id = m.old_id
           group by m.contato_id) x
   where x.contato_id = ct.id and x.v <> '{}'::jsonb;

  -- perfil de busca: o mais recente por contato; _busca_ids guarda todos os perfis absorvidos
  update contatos ct set dados = ct.dados || x.v
    from (select distinct on (k.contato_id) k.contato_id,
                 jsonb_strip_nulls(jsonb_build_object(
                   'busca_ativo', p.ativo, 'busca_finalidade', p.finalidade,
                   'busca_tipos', to_jsonb(nullif(p.tipos, '{}')), 'busca_cidades', to_jsonb(nullif(p.cidades, '{}')),
                   'busca_bairros', to_jsonb(nullif(p.bairros, '{}')), 'busca_preco_min', p.preco_min, 'busca_preco_max', p.preco_max,
                   'busca_quartos_min', p.quartos_min, 'busca_quartos_max', p.quartos_max, 'busca_suites_min', p.suites_min,
                   'busca_vagas_min', p.vagas_min, 'busca_area_min', p.area_min, 'busca_area_max', p.area_max,
                   'busca_caracteristicas', to_jsonb(nullif(p.caracteristicas, '{}')), 'busca_observacoes', p.observacoes))
                 || jsonb_build_object('_busca_ids', (select jsonb_agg(p2.id order by p2.id) from lead_perfil_busca p2
                                                        join migracao.mapa_contato k2
                                                          on (k2.origem = 'lead' and k2.old_id = p2.lead_id)
                                                          or (k2.origem = 'cliente' and k2.old_id = p2.cliente_id and p2.lead_id is null)
                                                       where k2.contato_id = k.contato_id)) v
            from lead_perfil_busca p
            join migracao.mapa_contato k
              on (k.origem = 'lead' and k.old_id = p.lead_id) or (k.origem = 'cliente' and k.old_id = p.cliente_id and p.lead_id is null)
           order by k.contato_id, coalesce(p.updated_at, p.created_at) desc nulls last, p.id desc) x
   where x.contato_id = ct.id;

  perform migracao.marcar(6, 'campos personalizados');
end $$;

do $$
declare v_absorvidos bigint;
begin
  select coalesce(sum(jsonb_array_length(dados -> '_busca_ids')), 0) into v_absorvidos from contatos where dados ? '_busca_ids';
  perform migracao.afirmar(6, 'perfis dentro de dados', v_absorvidos = migracao.o('lead_perfil_busca'),
    format('%s perfis absorvidos em %s contatos (origem %s; desenho: 899)', v_absorvidos,
           (select count(*) from contatos where dados ? '_busca_ids'), migracao.o('lead_perfil_busca')));
  perform migracao.afirmar(6, 'campos definidos', (select count(*) from campos_personalizados) > 0,
    format('%s definições em %s empresas', (select count(*) from campos_personalizados),
           (select count(distinct empresa_id) from campos_personalizados)));
end $$;

-- =====================================================================================
-- Passo 7 — itens ← produtos + inventario_unidades (e gatilho que mantém o registro)
-- =====================================================================================
create or replace function public.estoque_item_sync() returns trigger
  language plpgsql security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_ref text := case when tg_table_name in ('produtos', 'estoque_produtos') then 'estoque_produtos' else 'estoque_unidades' end;
  v_titulo text;
  v_contato bigint;
begin
  if tg_op = 'DELETE' then
    delete from itens where empresa_id = old.empresa_id and ref_tabela = v_ref and ref_id = old.id;
    return old;
  end if;
  if v_ref = 'estoque_produtos' then
    insert into itens (empresa_id, tipo, modulo_dono, titulo, codigo, status, preco, dados, ref_tabela, ref_id)
    values (new.empresa_id, 'produto', 'estoque', coalesce(nullif(new.nome, ''), 'Produto'), new.codigos,
            case when coalesce(new.ativo, true) then 'ativo' else 'inativo' end, new.preco,
            jsonb_strip_nulls(jsonb_build_object('_categoria_tipo', new.categoria_tipo, '_marca_id', new.marca_id,
                                                 '_categoria_id', new.categoria_id, '_garantia_dias', new.garantia_dias)),
            v_ref, new.id)
    on conflict on constraint itens_ref_key do update set titulo = excluded.titulo, codigo = excluded.codigo,
      status = excluded.status, preco = excluded.preco, dados = excluded.dados;
  else
    select p.nome into v_titulo from produtos p where p.id = new.produto_id;
    select n.contato_id into v_contato from negocios n where n.id = new.reservado_lead_id;
    insert into itens (empresa_id, filial_id, tipo, modulo_dono, titulo, identificador, status, preco, custo, dados, ref_tabela, ref_id)
    values (new.empresa_id, new.filial_id,
            case when new.placa is not null or new.chassi is not null then 'veiculo' else 'unidade' end, 'estoque',
            trim(concat_ws(' ', coalesce(v_titulo, 'Unidade'), new.armazenamento, new.cor)),
            coalesce(nullif(new.imei, ''), nullif(new.numero_serie, ''), nullif(new.placa, ''), nullif(new.chassi, '')),
            new.status, new.preco_venda, new.preco_custo,
            jsonb_strip_nulls(jsonb_build_object('_produto_id', new.produto_id, '_contato_id', v_contato,
                                                 '_grupo_pdv', new.grupo_pdv, '_quantidade', new.quantidade)),
            v_ref, new.id)
    on conflict on constraint itens_ref_key do update set filial_id = excluded.filial_id, tipo = excluded.tipo,
      titulo = excluded.titulo, identificador = excluded.identificador, status = excluded.status,
      preco = excluded.preco, custo = excluded.custo, dados = excluded.dados;
  end if;
  return new;
end $$;
revoke execute on function public.estoque_item_sync() from public, anon, authenticated;
grant execute on function public.estoque_item_sync() to service_role;

do $$
begin
  if migracao.feito(7) then raise notice 'passo 7 já rodou'; return; end if;
  create trigger estoque_item_sync after insert or update or delete on produtos
    for each row execute function estoque_item_sync();
  create trigger estoque_item_sync after insert or update or delete on inventario_unidades
    for each row execute function estoque_item_sync();
  -- carga: um update sem efeito dispara o gatilho em cada linha existente
  update produtos set id = id;
  update inventario_unidades set id = id;
  perform migracao.marcar(7, 'itens');
end $$;

do $$
begin
  perform migracao.afirmar(7, 'itens de produto', (select count(*) from itens where ref_tabela = 'estoque_produtos') = migracao.o('produtos'),
    format('%s itens de produto (produtos %s)', (select count(*) from itens where ref_tabela = 'estoque_produtos'), migracao.o('produtos')));
  perform migracao.afirmar(7, 'itens de unidade', (select count(*) from itens where ref_tabela = 'estoque_unidades') = migracao.o('inventario_unidades'),
    format('%s itens de unidade (inventario_unidades %s; desenho: 33 + 34)',
           (select count(*) from itens where ref_tabela = 'estoque_unidades'), migracao.o('inventario_unidades')));
end $$;

-- =====================================================================================
-- Passo 8 — prefixo nas tabelas de módulo; views de compatibilidade; FKs reapontadas
-- =====================================================================================
create table if not exists migracao.renomeadas (antigo text primary key, novo text not null, tipo text not null);

-- Funções das views com instead of (transitórias: morrem com as views)
create or replace function public.compat_etapa(p_empresa bigint, p_funil bigint, p_slug text, out funil_id bigint, out etapa_id bigint, out tipo text)
  language sql stable set search_path to 'public', 'pg_temp' as $$
  with f as (select coalesce(p_funil, (select id from funis where empresa_id = p_empresa and padrao and not interno order by id limit 1)) id)
  select f.id, e.id, e.tipo from f left join funil_etapas e on e.funil_id = f.id and e.slug = p_slug $$;

create or replace function public.compat_guarda(p_empresa bigint) returns void
  language plpgsql stable set search_path to 'public', 'pg_temp' as $$
begin
  if auth.uid() is not null and p_empresa is distinct from get_empresa_id() then
    raise exception 'empresa fora da sessão' using errcode = '42501';
  end if;
end $$;

-- O NEGÓCIO DE QUEM VOLTA PELO CANAL, SEM DUPLICAR. No legado cada volta de quem tinha o lead
-- desativado abria um lead novo: o contato 1333 juntou 13 na migração. Aberto = status 'aberto'
-- E ativo (desativar pela tela grava dados._lead.ativo = false e deixa o status como está).
--   1. aberto no funil do canal → devolve. Canal não tem funil: é o funil padrão da empresa.
--      Aberto em outro funil (ex.: interno "Time JM") também serve — mensagem de quem é da
--      equipe não vira negócio de venda;
--   2. só fechado/desativado → reabre o mais recente na etapa inicial do funil DELE e registra
--      'reaberto_por_mensagem' em negocio_historico;
--   3. nenhum → NULL; quem chamou cria.
-- Só olha os negócios da LOJA do canal (p_filial; nulo = canal da rede, olha todos): cada loja
-- tem a sua conversa (regra do dono, 18/09/2026) — mensagem pelo número de Jaguariúna não reabre
-- o negócio de Mogi.
-- Quem usa: mensagem_registrar versão B (chamada por identidade) e compat_leads_iud (a Edge de hoje
-- resolve o lead sozinha e insere pela view leads). Quando a view leads cair, a Edge passa a chamar
-- mensagem_registrar por identidade e a regra continua valendo por ela.
create or replace function public.core_negocio_do_canal(p_empresa bigint, p_contato bigint, p_filial bigint) returns bigint
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_funil bigint; v_negocio bigint; v_funil_neg bigint; v_etapa bigint; v_etapa_antes bigint;
begin
  select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;
  select n.id into v_negocio from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
     and n.status = 'aberto' and coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true)
   order by (n.funil_id is not distinct from v_funil) desc, n.created_at desc, n.id desc limit 1;
  if v_negocio is not null then return v_negocio; end if;

  select n.id, coalesce(n.funil_id, v_funil), n.etapa_id into v_negocio, v_funil_neg, v_etapa_antes
    from negocios n
   where n.empresa_id = p_empresa and n.contato_id = p_contato
     and (p_filial is null or n.filial_id is not distinct from p_filial)
   order by n.created_at desc, n.id desc limit 1;
  if v_negocio is null then return null; end if;

  select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil_neg order by e.ordem, e.id limit 1;
  update negocios set status = 'aberto', funil_id = v_funil_neg, etapa_id = coalesce(v_etapa, etapa_id),
         motivo_perda_id = null, perdido_em = null, ganho_em = null,
         dados = jsonb_set(dados, '{_lead}', coalesce(dados -> '_lead', '{}'::jsonb) || '{"ativo": true}'::jsonb)
   where id = v_negocio;
  insert into negocio_historico (empresa_id, negocio_id, de_etapa_id, para_etapa_id, acao)
  values (p_empresa, v_negocio, v_etapa_antes, coalesce(v_etapa, v_etapa_antes), 'reaberto_por_mensagem');
  return v_negocio;
end $$;

create or replace function public.compat_leads_iud() returns trigger
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_contato bigint; v_negocio bigint; v_e164 text; e record; v_status text; v_dados jsonb;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    select contato_id into v_contato from negocios where id = old.id;
    delete from negocios where id = old.id;
    if v_contato is not null and not exists (select 1 from negocios where contato_id = v_contato) then
      if exists (select 1 from contatos where id = v_contato and dados ? '_cliente') then
        delete from conversas where contato_id = v_contato;
      else
        delete from contatos where id = v_contato;
      end if;
    end if;
    return old;
  end if;

  perform compat_guarda(new.empresa_id);
  v_e164 := core_telefone_e164(new.telefone);
  select * into e from compat_etapa(new.empresa_id, new.funil_id, coalesce(new.kanban_status, 'novo'));
  v_status := case when e.tipo = 'ganho' then 'ganho' when e.tipo = 'perdido' then 'perdido'
                   when e.etapa_id is null and new.perdido_em is not null then 'perdido' else 'aberto' end;
  v_dados := jsonb_strip_nulls(jsonb_build_object('produto_interessado', nullif(new.produto_interessado, ''),
               '_interesse', new.interesse, '_anuncio', new.anuncio));

  if tg_op = 'INSERT' then
    if v_e164 is not null then
      select id into v_contato from contatos where empresa_id = new.empresa_id and telefone_e164 = v_e164;
    end if;
    if v_contato is null and new.origem is not null and new.origem_id is not null then
      select contato_id into v_contato from contato_identidades
       where empresa_id = new.empresa_id and canal_tipo = new.origem and external_id = new.origem_id;
    end if;
    if v_contato is null then
      insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, foto_url, origem, origem_id,
                            responsavel_id, responsavel_desde, ativo, observacoes)
      values (new.empresa_id, new.filial_id, new.nome, new.telefone, v_e164, new.instagram, new.foto_url, new.origem, new.origem_id,
              new.responsavel_id, new.responsavel_desde, true, new.observacoes)
      returning id into v_contato;
    end if;
    if new.origem is not null and new.origem_id is not null then
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id)
      values (new.empresa_id, v_contato, new.origem, new.origem_id) on conflict do nothing;
    end if;
    -- Lead que vem de CANAL (o webhook não achou lead ativo e insere um): usa o negócio aberto
    -- ou reabre o do contato nesta loja, em vez de abrir outro (core_negocio_do_canal). Lead
    -- criado à mão (outra origem) continua criando negócio novo: é decisão de quem cadastrou.
    if new.origem in ('whatsapp', 'instagram', 'messenger') and new.origem_id is not null then
      v_negocio := core_negocio_do_canal(new.empresa_id, v_contato, new.filial_id);
      if v_negocio is not null then
        if new.anuncio is not null then
          update negocios set dados = dados || jsonb_build_object('_anuncio', new.anuncio) where id = v_negocio;
        end if;
        select l.* into new from public.leads l where l.id = v_negocio;
        return new;
      end if;
    end if;
    insert into negocios (id, empresa_id, filial_id, contato_id, funil_id, etapa_id, ordem, valor_estimado, responsavel_id, status,
                          motivo_perda_id, perdido_em, entrou_etapa_em, devolucoes, devolvido_em, dados, created_at)
    values (coalesce(new.id, nextval(pg_get_serial_sequence('public.negocios', 'id'))), new.empresa_id, new.filial_id, v_contato,
            e.funil_id, e.etapa_id, coalesce(new.kanban_ordem, 0), new.valor_estimado, new.responsavel_id, v_status,
            new.motivo_perda_id, new.perdido_em, coalesce(new.data_transferencia_funil, now()), coalesce(new.devolucoes, 0),
            new.devolvido_em,
            v_dados || jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object(
              'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
              'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
              'kanban_status', case when e.etapa_id is null then coalesce(new.kanban_status, 'novo') end))),
            coalesce(new.created_at, now()))
    returning id into v_negocio;
  else
    v_negocio := old.id;
    select contato_id into v_contato from negocios where id = old.id;
    update contatos set nome = new.nome, telefone = new.telefone,
           telefone_e164 = case when v_e164 is null or not exists (select 1 from contatos x where x.empresa_id = new.empresa_id
                                                                     and x.telefone_e164 = v_e164 and x.id <> v_contato)
                                then v_e164 else telefone_e164 end,
           instagram = new.instagram, foto_url = new.foto_url, origem = new.origem, origem_id = new.origem_id,
           observacoes = new.observacoes
     where id = v_contato
       and (nome, telefone, instagram, foto_url, origem, origem_id, observacoes)
           is distinct from (new.nome, new.telefone, new.instagram, new.foto_url, new.origem, new.origem_id, new.observacoes);
    update negocios n set
      funil_id = e.funil_id, etapa_id = e.etapa_id, ordem = coalesce(new.kanban_ordem, 0), valor_estimado = new.valor_estimado,
      responsavel_id = new.responsavel_id, status = v_status, motivo_perda_id = new.motivo_perda_id, perdido_em = new.perdido_em,
      entrou_etapa_em = case when new.data_transferencia_funil is distinct from old.data_transferencia_funil
                             then new.data_transferencia_funil else n.entrou_etapa_em end,
      devolucoes = coalesce(new.devolucoes, 0), devolvido_em = new.devolvido_em, filial_id = new.filial_id,
      dados = (n.dados - 'produto_interessado' - '_interesse' - '_anuncio') || v_dados
              || jsonb_build_object('_lead', coalesce(n.dados -> '_lead', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                   'ativo', coalesce(new.ativo, true), 'primeira_msg', new.primeira_msg, 'ultima_tratativa', new.ultima_tratativa,
                   'responsavel_desde', new.responsavel_desde, 'convertido_em', new.convertido_em,
                   'kanban_status', case when e.etapa_id is null then new.kanban_status end)))
     where n.id = old.id;
  end if;
  select l.* into new from public.leads l where l.id = v_negocio;
  return new;
end $$;

create or replace function public.compat_clientes_iud() returns trigger
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id bigint; v_e164 text; v_campos jsonb; v_cli jsonb; v_end jsonb;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    if exists (select 1 from negocios where contato_id = old.id) then
      update contatos set dados = dados - '_cliente' where id = old.id;
    else
      delete from contatos where id = old.id;
    end if;
    return old;
  end if;

  perform compat_guarda(new.empresa_id);
  v_e164 := core_telefone_e164(new.telefone);
  -- só grava campo personalizado que a empresa tem definido
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_campos
    from jsonb_each(jsonb_strip_nulls(jsonb_build_object(
           'data_nascimento', to_char(new.data_nascimento, 'YYYY-MM-DD'), 'estado_civil', new.estado_civil,
           'profissao', new.profissao, 'nacionalidade', new.nacionalidade, 'tipo_negocio', new.tipo_negocio,
           'valor_pretendido', new.valor_pretendido, 'regiao_interesse', new.regiao_interesse))) x(k, v)
   where exists (select 1 from campos_personalizados cp where cp.empresa_id = new.empresa_id and cp.entidade = 'contato'
                   and cp.chave = x.k and cp.ativo);
  v_cli := jsonb_strip_nulls(jsonb_build_object(
    'cpf_validado', coalesce(new.cpf_validado, false), 'cnpj_validado', coalesce(new.cnpj_validado, false),
    'tipo_cliente', coalesce(new.tipo_cliente, 'novo'), 'origem_cliente', coalesce(new.origem_cliente, 'loja_fisica'),
    'usuario_id', new.usuario_id, 'status_aprovacao', coalesce(new.status_aprovacao, 'pendente'),
    'corretor_id', new.corretor_id, 'proprietario', coalesce(new.proprietario, false), 'lead_id', new.lead_id));
  v_end := jsonb_strip_nulls(jsonb_build_object('logradouro', new.endereco, 'numero', new.numero, 'complemento', new.complemento,
                                                'bairro', new.bairro, 'cidade', new.cidade, 'estado', new.estado, 'cep', new.cep));

  if tg_op = 'INSERT' then
    if v_e164 is not null then
      select id into v_id from contatos where empresa_id = new.empresa_id and telefone_e164 = v_e164;
    end if;
    if v_id is null and new.lead_id is not null then
      select contato_id into v_id from negocios where id = new.lead_id and empresa_id = new.empresa_id;
    end if;
    if v_id is null then
      insert into contatos (id, empresa_id, filial_id, nome, telefone, telefone_e164, email, cpf_cnpj, instagram, origem,
                            tipo, ativo, observacoes, endereco, dados, created_at)
      values (coalesce(new.id, nextval(pg_get_serial_sequence('public.contatos', 'id'))), new.empresa_id, new.filial_id, new.nome,
              new.telefone, v_e164, new.email, new.cpf_cnpj, new.instagram, new.origem_cliente,
              case when length(regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g')) = 14 then 'empresa' else 'pessoa' end,
              coalesce(new.ativo, true), new.observacoes, v_end, v_campos || jsonb_build_object('_cliente', v_cli),
              coalesce(new.created_at, now()))
      returning id into v_id;
    else
      update contatos c set nome = coalesce(c.nome, new.nome), email = coalesce(c.email, new.email),
             cpf_cnpj = coalesce(c.cpf_cnpj, new.cpf_cnpj), instagram = coalesce(c.instagram, new.instagram),
             telefone = coalesce(c.telefone, new.telefone), telefone_e164 = coalesce(c.telefone_e164, v_e164),
             endereco = v_end || c.endereco, dados = v_campos || c.dados || jsonb_build_object('_cliente', v_cli)
       where c.id = v_id;
    end if;
  else
    v_id := old.id;
    update contatos c set nome = new.nome, email = new.email, telefone = new.telefone,
           telefone_e164 = case when v_e164 is null or not exists (select 1 from contatos x where x.empresa_id = new.empresa_id
                                                                     and x.telefone_e164 = v_e164 and x.id <> old.id)
                                then v_e164 else c.telefone_e164 end,
           cpf_cnpj = new.cpf_cnpj, instagram = new.instagram, ativo = coalesce(new.ativo, true), observacoes = new.observacoes,
           filial_id = new.filial_id, endereco = v_end,
           dados = (c.dados - 'data_nascimento' - 'estado_civil' - 'profissao' - 'nacionalidade' - 'tipo_negocio'
                    - 'valor_pretendido' - 'regiao_interesse') || v_campos || jsonb_build_object('_cliente', v_cli)
     where c.id = old.id;
  end if;
  select cl.* into new from public.clientes cl where cl.id = v_id;
  return new;
end $$;

create or replace function public.compat_lead_mensagens_iud() returns trigger
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_contato bigint; v_conversa bigint; v_id bigint; n record;
begin
  if tg_op = 'DELETE' then
    perform compat_guarda(old.empresa_id);
    delete from mensagens where id = old.id;
    return old;
  end if;
  perform compat_guarda(new.empresa_id);
  if tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id or new.canal_id is distinct from old.canal_id then
    select * into n from negocios where id = new.lead_id;
    if not found then raise exception 'lead % não encontrado', new.lead_id using errcode = '23503'; end if;
    v_contato := n.contato_id;
    select id into v_conversa from conversas where contato_id = v_contato and canal_id is not distinct from new.canal_id;
    if v_conversa is null then
      insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
      values (new.empresa_id, coalesce(new.filial_id, n.filial_id), v_contato, new.canal_id, n.responsavel_id)
      returning id into v_conversa;
    end if;
  end if;
  if tg_op = 'INSERT' then
    insert into mensagens (id, empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id, midia_url,
                           midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id, canal_id, created_at)
    values (coalesce(new.id, nextval(pg_get_serial_sequence('public.mensagens', 'id'))), new.empresa_id, new.filial_id, v_conversa,
            v_contato, new.direcao, coalesce(new.conteudo, ''), coalesce(new.tipo, 'texto'), new.origem, new.external_id,
            new.midia_url, new.midia_retida_em, new.transcricao, new.status_entrega, new.status_em, new.erro_envio,
            coalesce(new.lida, false), new.usuario_id, new.canal_id, coalesce(new.created_at, now()))
    returning id into v_id;
  else
    v_id := old.id;
    update mensagens set conversa_id = coalesce(v_conversa, conversa_id), contato_id = coalesce(v_contato, contato_id),
           direcao = new.direcao, conteudo = coalesce(new.conteudo, ''), tipo = coalesce(new.tipo, 'texto'), origem = new.origem,
           external_id = new.external_id, midia_url = new.midia_url, midia_retida_em = new.midia_retida_em,
           transcricao = new.transcricao, status_entrega = new.status_entrega, status_em = new.status_em,
           erro_envio = new.erro_envio, lida = coalesce(new.lida, false), usuario_id = new.usuario_id, canal_id = new.canal_id
     where id = old.id;
  end if;
  new.id := v_id;
  return new;
end $$;

create or replace function public.imoveis_perfil_espelho() returns trigger
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_contato bigint;
begin
  v_contato := coalesce((select contato_id from negocios where id = coalesce(new.lead_id, old.lead_id)), coalesce(new.cliente_id, old.cliente_id));
  if v_contato is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    update contatos set dados = dados - 'busca_ativo' - 'busca_finalidade' - 'busca_tipos' - 'busca_cidades' - 'busca_bairros'
           - 'busca_preco_min' - 'busca_preco_max' - 'busca_quartos_min' - 'busca_quartos_max' - 'busca_suites_min'
           - 'busca_vagas_min' - 'busca_area_min' - 'busca_area_max' - 'busca_caracteristicas' - 'busca_observacoes'
     where id = v_contato;
    return old;
  end if;
  update contatos set dados = dados || jsonb_strip_nulls(jsonb_build_object(
      'busca_ativo', new.ativo, 'busca_finalidade', new.finalidade, 'busca_tipos', to_jsonb(nullif(new.tipos, '{}')),
      'busca_cidades', to_jsonb(nullif(new.cidades, '{}')), 'busca_bairros', to_jsonb(nullif(new.bairros, '{}')),
      'busca_preco_min', new.preco_min, 'busca_preco_max', new.preco_max, 'busca_quartos_min', new.quartos_min,
      'busca_quartos_max', new.quartos_max, 'busca_suites_min', new.suites_min, 'busca_vagas_min', new.vagas_min,
      'busca_area_min', new.area_min, 'busca_area_max', new.area_max,
      'busca_caracteristicas', to_jsonb(nullif(new.caracteristicas, '{}')), 'busca_observacoes', new.observacoes))
   where id = v_contato
     and exists (select 1 from campos_personalizados cp where cp.empresa_id = new.empresa_id and cp.chave = 'busca_ativo');
  return new;
end $$;

-- mensagem_registrar — VERSÃO B. Mesmo contrato da versão A (migração 20261021000000), que a
-- Edge webhook-leads já chama antes do corte; aqui só o corpo muda, na mesma transação que
-- troca lead_mensagens por view (ON CONFLICT não funciona em view com INSTEAD OF).
--   · grava em mensagens; external_id repetido → não grava nada e devolve NULL;
--   · contato: pelo negócio (p_dados.lead_id = id do negócio, preservado na migração) ou,
--     sem negócio, pela identidade do canal (p_dados.identidade + origem ou tipo do canal) em
--     contato_identidades — cria contato e identidade quando não existem, e resolve o negócio
--     sem duplicar (usa o aberto, reabre o mais recente ou cria — ver abaixo);
--   · conversa = (contato, canal), a mesma regra da view lead_mensagens; criada se faltar;
--   · nao_lidas e ultima_mensagem/recebida/enviada_at da conversa: gatilho mensagens_sincroniza
--     (core v1), disparado pelo insert — não são somados aqui para não contar duas vezes.
create or replace function public.mensagem_registrar(p_empresa bigint, p_canal_id bigint, p_external_id text, p_dados jsonb)
  returns bigint
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  d           jsonb := coalesce(p_dados, '{}'::jsonb);
  v_negocio   bigint := nullif(d ->> 'lead_id', '')::bigint;
  v_filial    bigint := nullif(d ->> 'filial_id', '')::bigint;
  v_ident     text := nullif(d ->> 'identidade', '');
  v_canal_tipo   text;
  v_canal_filial bigint;
  v_tipo      text;
  v_contato   bigint;
  v_resp      uuid;
  v_conversa  bigint;
  v_e164      text;
  v_id        bigint;
  v_funil       bigint;
  v_etapa       bigint;
begin
  if p_external_id is not null and exists (select 1 from mensagens where external_id = p_external_id) then
    return null;
  end if;
  if p_canal_id is not null then
    select tipo, filial_id into v_canal_tipo, v_canal_filial from canais where id = p_canal_id and empresa_id = p_empresa;
    if not found then
      raise exception 'mensagem_registrar: canal % não é da empresa %', p_canal_id, p_empresa using errcode = '42501';
    end if;
  end if;
  v_tipo := coalesce(nullif(d ->> 'origem', ''), v_canal_tipo);

  if v_negocio is not null then
    select n.contato_id, coalesce(v_filial, n.filial_id), n.responsavel_id into v_contato, v_filial, v_resp
      from negocios n where n.id = v_negocio and n.empresa_id = p_empresa;
    if v_contato is null then
      raise exception 'mensagem_registrar: lead % não é da empresa %', v_negocio, p_empresa using errcode = '42501';
    end if;
  else
    if v_ident is null or v_tipo is null then
      raise exception 'mensagem_registrar: informe lead_id, ou identidade com origem/canal' using errcode = '23502';
    end if;
    select contato_id into v_contato from contato_identidades
     where empresa_id = p_empresa and canal_tipo = v_tipo and external_id = v_ident;
    if v_contato is null then
      v_e164 := case when v_tipo = 'whatsapp' then core_telefone_e164(v_ident) end;
      if v_e164 is not null then
        select id into v_contato from contatos where empresa_id = p_empresa and telefone_e164 = v_e164;
      end if;
      if v_contato is null then
        insert into contatos (empresa_id, filial_id, nome, telefone, telefone_e164, instagram, origem, origem_id)
        values (p_empresa, coalesce(v_filial, v_canal_filial), coalesce(nullif(d ->> 'nome', ''), v_ident),
                case when v_tipo = 'whatsapp' then v_ident end, v_e164, nullif(d ->> 'instagram', ''), v_tipo, v_ident)
        returning id into v_contato;
      end if;
      insert into contato_identidades (empresa_id, contato_id, canal_tipo, external_id, canal_id)
      values (p_empresa, v_contato, v_tipo, v_ident, p_canal_id) on conflict do nothing;
    end if;

    -- O negócio do contato sem duplicar: usa o aberto ou reabre o mais recente DA LOJA do canal
    -- (core_negocio_do_canal); só sem nenhum cria um, no funil do canal, etapa inicial.
    v_negocio := core_negocio_do_canal(p_empresa, v_contato, coalesce(v_filial, v_canal_filial));
    if v_negocio is null then
      select f.id into v_funil from funis f where f.empresa_id = p_empresa and f.padrao and not f.interno order by f.id limit 1;
      select e.id into v_etapa from funil_etapas e where e.funil_id = v_funil order by e.ordem, e.id limit 1;
      insert into negocios (empresa_id, filial_id, contato_id, funil_id, etapa_id, status, dados)
      values (p_empresa, coalesce(v_filial, v_canal_filial), v_contato, v_funil, v_etapa, 'aberto',
              jsonb_build_object('_lead', jsonb_strip_nulls(jsonb_build_object('ativo', true, 'primeira_msg', d ->> 'conteudo'))))
      returning id into v_negocio;
    end if;
    select coalesce(v_filial, n.filial_id), n.responsavel_id into v_filial, v_resp from negocios n where n.id = v_negocio;
  end if;

  select id into v_conversa from conversas
   where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
  if v_conversa is null then
    insert into conversas (empresa_id, filial_id, contato_id, canal_id, responsavel_id)
    values (p_empresa, coalesce(v_filial, v_canal_filial), v_contato, p_canal_id, v_resp)
    on conflict on constraint conversas_contato_canal_key do nothing
    returning id into v_conversa;
    if v_conversa is null then
      select id into v_conversa from conversas
       where empresa_id = p_empresa and contato_id = v_contato and canal_id is not distinct from p_canal_id;
    end if;
  end if;

  insert into mensagens (empresa_id, filial_id, conversa_id, contato_id, direcao, conteudo, tipo, origem, external_id,
                         midia_url, midia_retida_em, transcricao, status_entrega, status_em, erro_envio, lida, usuario_id,
                         canal_id, created_at)
  values (p_empresa, nullif(d ->> 'filial_id', '')::bigint, v_conversa, v_contato, d ->> 'direcao',
          coalesce(d ->> 'conteudo', ''), coalesce(nullif(d ->> 'tipo', ''), 'texto'), v_tipo, p_external_id,
          d ->> 'midia_url', (d ->> 'midia_retida_em')::timestamptz, d ->> 'transcricao', d ->> 'status_entrega',
          (d ->> 'status_em')::timestamptz, d ->> 'erro_envio', coalesce((d ->> 'lida')::boolean, false),
          (d ->> 'usuario_id')::uuid, p_canal_id, coalesce((d ->> 'created_at')::timestamptz, now()))
  on conflict (external_id) where external_id is not null do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ZapIntel ao vivo sobre mensagens (gatilho zapintel_ao_vivo, recriado no 8.8). Mesmo corpo da
-- produção (baseline, tg_zapintel_mensagens_ao_vivo) com UMA coluna trocada: mensagens não tem
-- lead_id. "leads" do aviso continua sendo id de lead = id de negócio (preservado), agora os
-- negócios do contato da mensagem. Quem lê é app/zapintel/leads/[id]/page.tsx (payload.leads).
create or replace function public.tg_zapintel_mensagens_ao_vivo() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in
    select empresa_id, count(*) n,
           count(*) filter (where direcao = 'recebida') recebidas,
           array_agg(distinct coalesce(filial_id, 0)) lojas,
           (select (array_agg(distinct ng.id))[1:100] from negocios ng
             where ng.contato_id = any (array_agg(distinct novas.contato_id))) leads
    from novas group by empresa_id
  loop
    perform zapintel_avisar(r.empresa_id, 'mensagens',
      jsonb_build_object('n', r.n, 'recebidas', r.recebidas, 'lojas', to_jsonb(r.lojas), 'leads', to_jsonb(r.leads)));
  end loop;
  return null;
exception when others then
  raise warning '[zapintel_ao_vivo] %', sqlerrm;
  return null;
end $$;

-- hard_delete_empresa depois do corte. A versão do core_v1 apaga por leads/clientes/lead_mensagens,
-- que aqui viram views com INSTEAD OF — e a guarda delas (compat_guarda) recusa o superadmin, cuja
-- sessão não é da empresa apagada: a exclusão quebrava no primeiro DELETE. Mesma ordem, nas
-- tabelas de verdade (core v1 e nomes com prefixo). As old_* vão junto com a empresa (FK com
-- cascade, 8.9); o resto do core também tem cascade, mas sai explícito para a ordem ficar à vista.
create or replace function public.hard_delete_empresa(p_empresa_id bigint) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_super boolean;
begin
  select is_super_admin into v_super from public.usuarios where id = auth.uid();
  if not coalesce(v_super, false) then
    raise exception 'Permission denied: not a super admin';
  end if;
  if not exists (select 1 from public.empresas where id = p_empresa_id) then
    raise exception 'Empresa % nao encontrada', p_empresa_id;
  end if;

  -- Folhas primeiro. Transacional: se algo falhar, nada é apagado.
  -- Tabelas com empresa_id SEM FK para empresas: nada as apagava e ficavam órfãs.
  delete from public.zapintel_venda_lead     where empresa_id = p_empresa_id;
  delete from public.zapintel_lead_perfil    where empresa_id = p_empresa_id;
  delete from public.zapintel_conversa_cache where empresa_id = p_empresa_id;
  delete from public.assistente_uso          where empresa_id = p_empresa_id;
  delete from public.historico_bruto         where empresa_id = p_empresa_id;
  delete from public.diagnostico_canais      where empresa_id = p_empresa_id;
  delete from public.assistencia_servicos    where empresa_id = p_empresa_id;
  delete from public.estoque_tabela_precos   where empresa_id = p_empresa_id;
  delete from public.vendas_alertas          where empresa_id = p_empresa_id;
  delete from public.vendas_termos           where empresa_id = p_empresa_id;
  delete from public.estoque_imei_consultas  where empresa_id = p_empresa_id;
  delete from public.vendas_pagamentos       where empresa_id = p_empresa_id;
  delete from public.financeiro_cobrancas    where empresa_id = p_empresa_id;
  delete from public.vendas_comissoes        where empresa_id = p_empresa_id;
  delete from public.vendas_pre_vendas       where empresa_id = p_empresa_id;
  delete from public.estoque_movimentacoes   where empresa_id = p_empresa_id;
  delete from public.followups_gerados       where empresa_id = p_empresa_id;
  delete from public.visitas                 where empresa_id = p_empresa_id;
  delete from public.tarefas                 where empresa_id = p_empresa_id;
  delete from public.mensagens               where empresa_id = p_empresa_id;
  delete from public.conversas               where empresa_id = p_empresa_id;
  delete from public.imoveis_perfis_busca    where empresa_id = p_empresa_id;
  delete from public.assistencia_garantias   where empresa_id = p_empresa_id;
  delete from public.estoque_unidades        where empresa_id = p_empresa_id;
  delete from public.vendas_pedidos_compra   where empresa_id = p_empresa_id;
  delete from public.vendas_vendas           where empresa_id = p_empresa_id;
  delete from public.negocios                where empresa_id = p_empresa_id;
  delete from public.imoveis_imoveis         where empresa_id = p_empresa_id;
  delete from public.estoque_produtos        where empresa_id = p_empresa_id;
  delete from public.estoque_subcategorias   where empresa_id = p_empresa_id;
  delete from public.estoque_marcas          where empresa_id = p_empresa_id;
  delete from public.estoque_categorias      where empresa_id = p_empresa_id;
  delete from public.estoque_fornecedores    where empresa_id = p_empresa_id;
  delete from public.contatos                where empresa_id = p_empresa_id;
  delete from public.metas_comissoes         where empresa_id = p_empresa_id;
  delete from public.financeiro_lancamentos  where empresa_id = p_empresa_id;
  delete from public.configuracoes_sistema   where empresa_id = p_empresa_id;
  delete from public.funil_etapas            where empresa_id = p_empresa_id;
  delete from public.financeiro_taxas        where empresa_id = p_empresa_id;
  delete from public.financeiro_config_pagamento where empresa_id = p_empresa_id;
  delete from public.stripe_eventos          where empresa_id = p_empresa_id;
  delete from public.empresa_usuarios        where empresa_id = p_empresa_id;

  -- Preserva a trilha de auditoria (inclui o log da propria exclusao).
  update public.superadmin_logs set empresa_id = null where empresa_id = p_empresa_id;

  delete from public.empresas where id = p_empresa_id;
end $$;
revoke execute on function public.hard_delete_empresa(p_empresa_id bigint) from public, anon;
grant execute on function public.hard_delete_empresa(p_empresa_id bigint) to authenticated, service_role;

do $$
declare
  f text;
begin
  foreach f in array array['compat_etapa(bigint,bigint,text)', 'compat_guarda(bigint)', 'compat_leads_iud()',
                           'compat_clientes_iud()', 'compat_lead_mensagens_iud()', 'imoveis_perfil_espelho()',
                           'mensagem_registrar(bigint,bigint,text,jsonb)', 'tg_zapintel_mensagens_ao_vivo()',
                           'core_negocio_do_canal(bigint,bigint,bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

do $$
declare
  r record;
  v_cols text;
  g record;
  ren constant text[][] := array[
    ['vendas', 'vendas_vendas'], ['propostas', 'vendas_propostas'], ['contratos_venda', 'vendas_contratos'],
    ['contrato_modelos', 'vendas_contrato_modelos'], ['contrato_documentos', 'vendas_contrato_documentos'],
    ['pedidos_compra', 'vendas_pedidos_compra'], ['comissoes', 'vendas_comissoes'],
    ['fichas_financiamento', 'vendas_fichas_financiamento'], ['pre_vendas', 'vendas_pre_vendas'],
    ['produtos', 'estoque_produtos'], ['inventario_unidades', 'estoque_unidades'], ['movimentacao_estoque', 'estoque_movimentacoes'],
    ['categorias_produtos', 'estoque_categorias'], ['subcategorias_produtos', 'estoque_subcategorias'],
    ['marcas_produtos', 'estoque_marcas'], ['tabela_precos', 'estoque_tabela_precos'], ['imei_consultas', 'estoque_imei_consultas'],
    ['veiculo_dados', 'estoque_veiculo_dados'], ['fornecedores', 'estoque_fornecedores'],
    ['troca_cotacoes', 'avaliacao_cotacoes'], ['troca_precos', 'avaliacao_precos'], ['troca_regras', 'avaliacao_regras'],
    ['avaliacoes_usados', 'avaliacao_usados'], ['fipe_referencia', 'avaliacao_fipe_referencia'],
    ['fipe_consultas', 'avaliacao_fipe_consultas'],
    ['orcamentos', 'assistencia_orcamentos'], ['garantias_assistencias', 'assistencia_garantias'],
    ['servicos_reparo', 'assistencia_servicos'],
    ['lancamentos_financeiros', 'financeiro_lancamentos'], ['taxas_pagamento', 'financeiro_taxas'],
    ['cobrancas', 'financeiro_cobrancas'], ['tenant_payment_config', 'financeiro_config_pagamento'],
    ['payment_webhook_eventos', 'financeiro_webhook_eventos'],
    ['imoveis', 'imoveis_imoveis'], ['negocios_imobiliarios', 'imoveis_negocios'], ['chaves_imoveis', 'imoveis_chaves'],
    ['lead_perfil_busca', 'imoveis_perfis_busca']];
  i int;
  v_view_defs jsonb := '{}'::jsonb;
  v_view_grants jsonb := '{}'::jsonb;
  v text;
begin
  if migracao.feito(8) then raise notice 'passo 8 já rodou'; return; end if;

  -- 8.1 views que dependem de leads / clientes / lead_mensagens: guarda a definição e derruba
  for r in select distinct v.relname, v.oid, v.reloptions
             from pg_depend d join pg_rewrite rw on rw.oid = d.objid join pg_class v on v.oid = rw.ev_class
             join pg_class t on t.oid = d.refobjid join pg_namespace n on n.oid = v.relnamespace
            where n.nspname = 'public' and v.relkind = 'v' and v.relname not in ('leads', 'clientes', 'lead_mensagens')
              and t.relname in ('leads', 'clientes', 'lead_mensagens', 'canais_conectados', 'lead_perfil_busca') loop
    v_view_defs := v_view_defs || jsonb_build_object(r.relname, jsonb_build_object(
      'def', pg_get_viewdef(r.oid, true), 'opcoes', coalesce(array_to_string(r.reloptions, ','), '')));
    v_view_grants := v_view_grants || jsonb_build_object(r.relname, coalesce((
      select jsonb_agg(jsonb_build_object('quem', grantee, 'priv', privilege_type))
        from information_schema.role_table_grants where table_schema = 'public' and table_name = r.relname
         and grantee in ('anon', 'authenticated', 'service_role')), '[]'::jsonb));
    execute format('drop view public.%I', r.relname);
  end loop;

  -- 8.2 tabelas trocadas pelo core → old_*
  alter table leads rename to old_leads;
  alter table clientes rename to old_clientes;
  alter table lead_mensagens rename to old_lead_mensagens;
  alter table canais_conectados rename to old_canais_conectados;
  insert into migracao.renomeadas values ('leads', 'old_leads', 'trocada'), ('clientes', 'old_clientes', 'trocada'),
    ('lead_mensagens', 'old_lead_mensagens', 'trocada'), ('canais_conectados', 'old_canais_conectados', 'trocada')
  on conflict do nothing;

  -- 8.3 tabelas de módulo com prefixo + view simples com o nome antigo (aceita insert/update/upsert)
  for i in 1 .. array_length(ren, 1) loop
    execute format('alter table public.%I rename to %I', ren[i][1], ren[i][2]);
    execute format('create view public.%I with (security_invoker = true) as select * from public.%I', ren[i][1], ren[i][2]);
    for g in select grantee, string_agg(privilege_type, ', ') privs from information_schema.role_table_grants
              where table_schema = 'public' and table_name = ren[i][2]
                and grantee in ('anon', 'authenticated', 'service_role')
                and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') group by grantee loop
      execute format('grant %s on public.%I to %I', g.privs, ren[i][1], g.grantee);
    end loop;
    insert into migracao.renomeadas values (ren[i][1], ren[i][2], 'modulo') on conflict do nothing;
  end loop;

  -- 8.4 views de compatibilidade do core
  create view public.canais_conectados with (security_invoker = true) as
    select id, empresa_id, tipo, external_id, waba_id, ig_user_id, nome_exibicao, access_token_enc, token_expira_em,
           data_access_expira_em, coexistencia, status, ultimo_erro, ultimo_erro_em, conectado_em, ultima_msg_em,
           sync_contatos_em, sync_historico_em, sync_request_ids, sync_historico_pct, criado_por, created_at, updated_at,
           filial_id, via
      from public.canais;

  create view public.leads with (security_invoker = true) as
    select n.id, c.nome, c.telefone, c.instagram, c.origem,
           coalesce(e.slug, n.dados -> '_lead' ->> 'kanban_status') as kanban_status,
           n.responsavel_id, (n.dados -> '_lead' ->> 'convertido_em')::bigint as convertido_em, c.observacoes, n.created_at,
           c.origem_id, coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true) as ativo,
           n.dados -> '_lead' ->> 'primeira_msg' as primeira_msg, coalesce(cv.nao_lidas, 0)::integer as msgs_nao_lidas,
           (n.dados -> '_lead' ->> 'ultima_tratativa')::timestamptz as ultima_tratativa,
           n.entrou_etapa_em as data_transferencia_funil, cv.ultima_mensagem_at,
           n.dados ->> 'produto_interessado' as produto_interessado, n.ordem as kanban_ordem, n.empresa_id, n.valor_estimado,
           n.motivo_perda_id, n.perdido_em, n.funil_id, n.dados -> '_interesse' as interesse, c.foto_url,
           (n.dados -> '_lead' ->> 'responsavel_desde')::timestamptz as responsavel_desde, n.devolvido_em, n.devolucoes,
           cv.ultima_recebida_at, cv.ultima_enviada_at, n.dados -> '_anuncio' as anuncio, n.filial_id
      from public.negocios n
      join public.contatos c on c.id = n.contato_id
      left join public.funil_etapas e on e.id = n.etapa_id
      -- Não lidas e última mensagem SÓ no negócio principal do contato — a mesma regra da view
      -- lead_mensagens, que põe a conversa nele. Sem isto cada negócio de um contato fundido
      -- mostrava o badge do contato inteiro (32 cards, 920 mensagens contadas duas vezes na cópia
      -- de 19/10) e abrir o card não mostrava conversa nenhuma.
      -- Principal = o negócio ATIVO mais recente; sem ativo, o mais recente. A regra antiga
      -- ("aberto primeiro") escolhia negócio desativado com status aberto em vez do card visível
      -- (ex.: 2341 desativado x 3964 ganho e ativo) — 2 contatos ficavam com badge escondido.
      left join lateral (select sum(x.nao_lidas) as nao_lidas, max(x.ultima_mensagem_at) as ultima_mensagem_at,
                                max(x.ultima_recebida_at) as ultima_recebida_at, max(x.ultima_enviada_at) as ultima_enviada_at
                           from public.conversas x
                          where x.contato_id = n.contato_id
                            and n.id = (select p.id from public.negocios p where p.contato_id = n.contato_id
                                         order by coalesce((p.dados -> '_lead' ->> 'ativo')::boolean, true) desc, p.created_at desc, p.id desc limit 1)) cv on true;
  alter view public.leads alter column ativo set default true;
  alter view public.leads alter column kanban_status set default 'novo';
  alter view public.leads alter column kanban_ordem set default 0;
  alter view public.leads alter column devolucoes set default 0;
  alter view public.leads alter column msgs_nao_lidas set default 0;
  alter view public.leads alter column created_at set default now();
  create trigger compat_leads instead of insert or update or delete on public.leads
    for each row execute function public.compat_leads_iud();

  create view public.clientes with (security_invoker = true) as
    select c.id, c.nome, c.email, c.telefone, c.cpf_cnpj,
           (c.dados -> '_cliente' ->> 'cpf_validado')::boolean as cpf_validado,
           (c.dados -> '_cliente' ->> 'cnpj_validado')::boolean as cnpj_validado,
           (c.dados ->> 'data_nascimento')::date as data_nascimento, c.endereco ->> 'logradouro' as endereco,
           c.endereco ->> 'cidade' as cidade, c.endereco ->> 'estado' as estado, c.endereco ->> 'cep' as cep,
           c.dados -> '_cliente' ->> 'tipo_cliente' as tipo_cliente, c.instagram,
           c.dados -> '_cliente' ->> 'origem_cliente' as origem_cliente, c.observacoes, c.ativo,
           (c.dados -> '_cliente' ->> 'usuario_id')::uuid as usuario_id, c.created_at,
           c.dados ->> 'estado_civil' as estado_civil, c.dados ->> 'profissao' as profissao,
           c.dados ->> 'nacionalidade' as nacionalidade, c.endereco ->> 'numero' as numero,
           c.endereco ->> 'complemento' as complemento, c.endereco ->> 'bairro' as bairro, c.empresa_id,
           (c.dados -> '_cliente' ->> 'lead_id')::bigint as lead_id, c.dados ->> 'tipo_negocio' as tipo_negocio,
           coalesce(c.dados -> '_cliente' ->> 'status_aprovacao', 'pendente') as status_aprovacao,
           (c.dados -> '_cliente' ->> 'corretor_id')::uuid as corretor_id, (c.dados ->> 'valor_pretendido')::numeric as valor_pretendido,
           c.dados ->> 'regiao_interesse' as regiao_interesse,
           coalesce((c.dados -> '_cliente' ->> 'proprietario')::boolean, false) as proprietario, c.filial_id
      from public.contatos c
     where c.dados ? '_cliente';
  alter view public.clientes alter column ativo set default true;
  alter view public.clientes alter column cpf_validado set default false;
  alter view public.clientes alter column cnpj_validado set default false;
  alter view public.clientes alter column origem_cliente set default 'loja_fisica';
  alter view public.clientes alter column proprietario set default false;
  alter view public.clientes alter column status_aprovacao set default 'pendente';
  alter view public.clientes alter column tipo_cliente set default 'novo';
  alter view public.clientes alter column created_at set default now();
  create trigger compat_clientes instead of insert or update or delete on public.clientes
    for each row execute function public.compat_clientes_iud();

  create view public.lead_mensagens with (security_invoker = true) as
    select m.id, p.id as lead_id, m.direcao, m.conteudo, m.origem, m.lida, m.created_at, m.empresa_id, m.external_id, m.tipo,
           m.midia_url, m.status_entrega, m.erro_envio, m.status_em, m.usuario_id, m.filial_id, m.canal_id, m.transcricao,
           m.midia_retida_em
      from public.mensagens m
      left join lateral (select n.id from public.negocios n where n.contato_id = m.contato_id
                          order by coalesce((n.dados -> '_lead' ->> 'ativo')::boolean, true) desc, n.created_at desc, n.id desc limit 1) p on true;
  alter view public.lead_mensagens alter column lida set default false;
  alter view public.lead_mensagens alter column tipo set default 'texto';
  alter view public.lead_mensagens alter column created_at set default now();
  create trigger compat_lead_mensagens instead of insert or update or delete on public.lead_mensagens
    for each row execute function public.compat_lead_mensagens_iud();

  foreach v in array array['leads', 'clientes', 'lead_mensagens', 'canais_conectados'] loop
    execute format('revoke all on public.%I from anon', v);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', v);
  end loop;

  create trigger imoveis_perfil_espelho after insert or update or delete on public.imoveis_perfis_busca
    for each row execute function public.imoveis_perfil_espelho();

  -- 8.5 FKs que apontavam para as tabelas trocadas → core (o id foi preservado; cliente fundido é remapeado)
  for r in
    select c.conname, cl.relname tabela, a.attname coluna, rf.relname alvo, c.confdeltype
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rf on rf.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
       and rf.relname in ('old_leads', 'old_clientes', 'old_canais_conectados')
       and cl.relname not like 'old\_%'
  loop
    if r.alvo = 'old_clientes' then
      execute format('update public.%I t set %I = m.contato_id from migracao.mapa_contato m
                       where m.origem = ''cliente'' and m.old_id = t.%I and m.contato_id <> m.old_id', r.tabela, r.coluna, r.coluna);
    end if;
    execute format('alter table public.%I drop constraint %I', r.tabela, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s not valid',
                   r.tabela, r.conname, r.coluna,
                   case r.alvo when 'old_leads' then 'negocios' when 'old_clientes' then 'contatos' else 'canais' end,
                   case r.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default'
                                      when 'r' then 'restrict' else 'no action' end);
    execute format('alter table public.%I validate constraint %I', r.tabela, r.conname);
    -- índice da FK (princípio do core), se a tabela não tiver
    if not exists (select 1 from pg_index i join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[0]
                    where i.indrelid = ('public.' || r.tabela)::regclass and a2.attname = r.coluna) then
      execute format('create index %I on public.%I (%I)', r.tabela || '_' || r.coluna || '_fk_idx', r.tabela, r.coluna);
    end if;
  end loop;

  -- 8.6 recria as views dependentes sobre as views de compatibilidade
  for r in select key nome, value d from jsonb_each(v_view_defs) loop
    execute format('create view public.%I %s as %s', r.nome,
                   case when r.d ->> 'opcoes' <> '' then 'with (' || (r.d ->> 'opcoes') || ')' else '' end, r.d ->> 'def');
    for g in select x ->> 'quem' quem, string_agg(x ->> 'priv', ', ') privs
               from jsonb_array_elements(v_view_grants -> r.nome) x group by 1 loop
      execute format('grant %s on public.%I to %I', g.privs, r.nome, g.quem);
    end loop;
  end loop;

  -- 8.7 Realtime: postgres_changes lê o WAL de TABELA — assinar as views novas não dispara nada.
  -- A publicação passa das tabelas trocadas (que continuam nela depois do rename) para as do
  -- core. O app escolhe a tabela por NEXT_PUBLIC_DB_CORE (lib/realtime/tabelas.ts).
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v in array array['old_leads', 'old_clientes', 'old_lead_mensagens', 'old_canais_conectados'] loop
      if exists (select 1 from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
                  where p.pubname = 'supabase_realtime' and pr.prrelid = ('public.' || v)::regclass) then
        execute format('alter publication supabase_realtime drop table public.%I', v);
      end if;
    end loop;
    foreach v in array array['negocios', 'conversas', 'mensagens', 'contatos', 'tarefas'] loop
      if not exists (select 1 from pg_publication_rel pr join pg_publication p on p.oid = pr.prpubid
                      where p.pubname = 'supabase_realtime' and pr.prrelid = ('public.' || v)::regclass) then
        execute format('alter publication supabase_realtime add table public.%I', v);
      end if;
    end loop;
  end if;

  -- 8.8 ZapIntel ao vivo. RENAME leva o gatilho junto com a tabela:
  --   zapintel_ao_vivo        ficou em old_lead_mensagens, onde ninguém mais grava → sai dali e
  --                           nasce em mensagens (corpo ajustado acima: lead_id → contato_id);
  --   zapintel_vendas_ao_vivo foi com vendas para vendas_vendas (insert pela view simples
  --                           vendas chega na tabela e dispara) → recriado igual, explícito;
  --   zapintel_ficha_ao_vivo  está em zapintel_lead_perfil, que não é renomeada nem trocada:
  --                           continua onde está (lead_id dela já aponta para negocios, 8.5).
  drop trigger if exists zapintel_ao_vivo on public.old_lead_mensagens;
  drop trigger if exists zapintel_ao_vivo on public.mensagens;
  create trigger zapintel_ao_vivo after insert on public.mensagens
    referencing new table as novas for each statement execute function public.tg_zapintel_mensagens_ao_vivo();
  drop trigger if exists zapintel_vendas_ao_vivo on public.vendas_vendas;
  create trigger zapintel_vendas_ao_vivo after insert on public.vendas_vendas
    referencing new table as novas for each statement execute function public.tg_zapintel_vendas_ao_vivo();

  -- 8.9 old_* saem junto com a empresa (hard_delete_empresa): FK para empresas com cascade.
  -- old_canais_conectados já era; leads, clientes e lead_mensagens eram NO ACTION e travavam a
  -- exclusão de qualquer empresa com dado antigo. As FKs entre as old_* ficam como estão: a
  -- cascata apaga as quatro no mesmo comando e a checagem de NO ACTION é no fim dele.
  for r in
    select c.conname, cl.relname tabela, a.attname coluna
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.empresas'::regclass and c.confdeltype <> 'c'
       and cl.relname in ('old_leads', 'old_clientes', 'old_lead_mensagens', 'old_canais_conectados')
  loop
    execute format('alter table public.%I drop constraint %I', r.tabela, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.empresas(id) on delete cascade',
                   r.tabela, r.conname, r.coluna);
  end loop;

  perform migracao.marcar(8, 'prefixo, views de compatibilidade e FKs', jsonb_build_object('views_recriadas', v_view_defs));
end $$;

-- Checagem do passo 8: o código antigo continua funcionando (como um vendedor logado da JM).
do $$
declare
  v_usuario uuid := (select usuario_id from empresa_usuarios where empresa_id = 1 and ativo and role = 'owner' limit 1);
  v_falta text;
  v_fk_old bigint;
  v_lead bigint; v_cli bigint; v_msg bigint; v_n bigint; v_canal bigint;
  v_erros text := '';
  v_upsert_msg text;
begin
  -- toda tabela antiga tem uma view com as mesmas colunas, na mesma ordem
  select string_agg(r.antigo, ', ') into v_falta
    from migracao.renomeadas r
   where (select string_agg(attname, ',' order by attnum) from pg_attribute
           where attrelid = ('public.' || r.novo)::regclass and attnum > 0 and not attisdropped)
         is distinct from
         (select string_agg(attname, ',' order by attnum) from pg_attribute
           where attrelid = to_regclass('public.' || r.antigo) and attnum > 0 and not attisdropped);
  perform migracao.afirmar(8, 'views com as colunas antigas', v_falta is null,
    format('%s views de compatibilidade; divergentes: %s', (select count(*) from migracao.renomeadas), coalesce(v_falta, 'nenhuma')));

  perform migracao.afirmar(8, 'publicação do Realtime nas tabelas do core',
    not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    or ((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename in ('negocios', 'conversas', 'mensagens', 'contatos', 'tarefas')) = 5
        and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'old\_%')),
    coalesce((select string_agg(tablename, ', ' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
             'sem publicação supabase_realtime neste banco'));

  select string_agg(t.tgname || '@' || c.relname, ', ' order by t.tgname) into v_falta
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and t.tgname like 'zapintel\_%';
  perform migracao.afirmar(8, 'gatilhos do ZapIntel ao vivo nas tabelas novas',
    v_falta = 'zapintel_ao_vivo@mensagens, zapintel_ficha_ao_vivo@zapintel_lead_perfil, zapintel_vendas_ao_vivo@vendas_vendas',
    v_falta);

  -- os três avisam de verdade: zapintel_avisar trocado por um que anota, desfeito no fim
  begin
    create temp table zap_avisos (empresa bigint, evento text, dados jsonb) on commit drop;
    create or replace function public.zapintel_avisar(p_empresa bigint, p_evento text, p_dados jsonb) returns void
      language sql security definer set search_path to 'public' as
      'insert into zap_avisos values (p_empresa, p_evento, p_dados)';
    select n.id into v_lead from negocios n where n.empresa_id = 1 and n.status = 'aberto' order by n.id limit 1;
    perform mensagem_registrar(1, null, 'teste-zap-1', jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida', 'conteudo', 'x'));
    insert into vendas (empresa_id, valor_venda) values (1, 1);
    update zapintel_lead_perfil set gerado_em = gerado_em
     where lead_id = (select lead_id from zapintel_lead_perfil where empresa_id = 1 limit 1);
    v_upsert_msg := (select string_agg(evento || coalesce(':' || (dados -> 'leads' @> to_jsonb(v_lead))::text, ''), ', ' order by evento)
                       from zap_avisos where empresa = 1);
    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then v_upsert_msg := 'erro: ' || sqlerrm; end if;
  end;
  perform migracao.afirmar(8, 'ZapIntel ao vivo avisa (mensagens, vendas, análises)',
    v_upsert_msg = 'analises, mensagens:true, vendas',
    coalesce(v_upsert_msg, 'nenhum aviso') || ' (mensagens:true = o negócio da mensagem veio em leads)');

  select count(*) into v_fk_old from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class rf on rf.oid = c.confrelid
   where c.contype = 'f' and rf.relname like 'old\_%' and cl.relname not like 'old\_%';
  perform migracao.afirmar(8, 'nenhuma FK nova apontando para old_*', v_fk_old = 0, format('%s FKs', v_fk_old));

  -- uso real pelas views, sob RLS, desfeito no fim (sub-transação)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_usuario::text, true);
    execute 'set local role authenticated';

    insert into leads (empresa_id, nome, telefone, origem, kanban_status)
    values (1, 'Teste compat', '(19) 99999-0001', 'manual', 'novo') returning id into v_lead;
    update leads set kanban_status = (select slug from funil_etapas where empresa_id = 1 and funil_id = 1 order by ordem offset 1 limit 1),
                     valor_estimado = 123 where id = v_lead;
    select count(*) into v_n from leads where id = v_lead and valor_estimado = 123 and ativo;
    if v_n <> 1 then v_erros := v_erros || ' leads.update;'; end if;

    insert into lead_mensagens (lead_id, empresa_id, direcao, conteudo) values (v_lead, 1, 'recebida', 'oi') returning id into v_msg;
    select msgs_nao_lidas into v_n from leads where id = v_lead;
    if v_n <> 1 then v_erros := v_erros || ' msgs_nao_lidas=' || v_n || ';'; end if;
    update lead_mensagens set lida = true where id = v_msg;
    select msgs_nao_lidas into v_n from leads where id = v_lead;
    if v_n <> 0 then v_erros := v_erros || ' lida;'; end if;
    select count(*) into v_n from lead_mensagens where lead_id = v_lead;
    if v_n <> 1 then v_erros := v_erros || ' lead_mensagens.select;'; end if;

    insert into clientes (empresa_id, nome, telefone, profissao) values (1, 'Teste compat', '19999990001', 'Analista') returning id into v_cli;
    select count(*) into v_n from clientes where id = v_cli and profissao = 'Analista';
    if v_n <> 1 then v_erros := v_erros || ' clientes.insert;'; end if;
    if (select contato_id from negocios where id = v_lead) <> v_cli then v_erros := v_erros || ' cliente não casou com o lead pelo telefone;'; end if;

    update inventario_unidades set observacoes = observacoes where id = (select id from inventario_unidades where empresa_id = 1 limit 1);
    select count(*) into v_n from vendas where empresa_id = 1;
    if v_n = 0 then v_erros := v_erros || ' vendas.select vazio;'; end if;

    delete from leads where id = v_lead;
    select count(*) into v_n from negocios where id = v_lead;
    if v_n <> 0 then v_erros := v_erros || ' leads.delete;'; end if;

    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then v_erros := v_erros || ' erro: ' || sqlerrm; end if;
  end;
  execute 'reset role';
  perform migracao.afirmar(8, 'código antigo lê e grava pelas views', v_erros = '',
    case when v_erros = '' then 'insert/update/select/delete em leads, clientes, lead_mensagens, inventario_unidades e vendas como owner da JM, sob RLS'
         else v_erros end);

  -- upsert (ON CONFLICT) das rotas que usam: canais (view simples) passa; lead_mensagens (view com instead of) não
  begin
    execute 'set local role service_role';
    insert into canais_conectados (empresa_id, tipo, external_id) values (1, 'whatsapp', 'teste-compat')
      on conflict (tipo, external_id) do update set nome_exibicao = 'x';
    insert into lead_perfil_busca (empresa_id, lead_id, finalidade, tipos, cidades, bairros)
      select empresa_id, id, 'venda', '{}', '{}', '{}' from negocios where empresa_id = 3 limit 1
      on conflict (lead_id) do update set finalidade = 'venda';
    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then v_erros := v_erros || ' upsert simples: ' || sqlerrm; end if;
  end;
  execute 'reset role';
  perform migracao.afirmar(8, 'upsert em view simples (canais_conectados, lead_perfil_busca)', v_erros = '', coalesce(nullif(v_erros, ''), 'ok'));

  begin
    insert into lead_mensagens (lead_id, empresa_id, direcao, conteudo, external_id)
      select id, empresa_id, 'recebida', 'x', 'teste-compat' from negocios limit 1
      on conflict (external_id) do nothing;
    v_upsert_msg := 'funcionou';
    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then v_upsert_msg := sqlerrm; end if;
  end;
  perform migracao.afirmar(8, 'AVISO upsert em lead_mensagens (webhook-leads)', true,
    'não suportado em view com instead of: ' || v_upsert_msg
    || ' — a Edge grava por mensagem_registrar (runbook passo c) antes do corte');

  -- mensagem_registrar versão B, como a Edge chama (service_role), desfeito no fim
  v_erros := '';
  begin
    execute 'set local role service_role';
    select n.id into v_lead from negocios n where n.empresa_id = 1 and n.status = 'aberto' order by n.id limit 1;
    select c.id into v_canal from canais c where c.empresa_id = 1 and c.tipo = 'whatsapp' order by c.id limit 1;
    select coalesce(sum(nao_lidas), 0) into v_n from conversas
     where contato_id = (select contato_id from negocios where id = v_lead);
    v_msg := mensagem_registrar(1, v_canal, 'teste-registrar-1',
               jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida', 'conteudo', 'oi', 'origem', 'whatsapp'));
    if v_msg is null then v_erros := v_erros || ' pelo negócio não gravou;'; end if;
    if (select coalesce(sum(nao_lidas), 0) from conversas where contato_id = (select contato_id from negocios where id = v_lead)) <> v_n + 1 then
      v_erros := v_erros || ' nao_lidas não subiu;';
    end if;
    if (select count(*) from lead_mensagens where id = v_msg and external_id = 'teste-registrar-1') <> 1 then
      v_erros := v_erros || ' não aparece na view lead_mensagens;';
    end if;
    if mensagem_registrar(1, v_canal, 'teste-registrar-1', jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida', 'conteudo', 'oi'))
       is not null or (select count(*) from mensagens where external_id = 'teste-registrar-1') <> 1 then
      v_erros := v_erros || ' external_id repetido gravou de novo;';
    end if;
    v_msg := mensagem_registrar(1, v_canal, 'teste-registrar-2',
               jsonb_build_object('identidade', '5519900001234', 'direcao', 'recebida', 'conteudo', 'contato novo', 'nome', 'Teste registrar'));
    if v_msg is null
       or not exists (select 1 from contato_identidades i join contatos c on c.id = i.contato_id
                       where i.empresa_id = 1 and i.canal_tipo = 'whatsapp' and i.external_id = '5519900001234'
                         and c.telefone_e164 = '+5519900001234')
       or (select c.nao_lidas from conversas c join mensagens m on m.conversa_id = c.id where m.id = v_msg) <> 1 then
      v_erros := v_erros || ' identidade nova não criou contato/conversa;';
    end if;
    begin
      perform mensagem_registrar(3, v_canal, 'teste-registrar-3', jsonb_build_object('lead_id', v_lead, 'direcao', 'recebida'));
      v_erros := v_erros || ' aceitou canal de outra empresa;';
    exception when insufficient_privilege then null;
    end;
    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then v_erros := v_erros || ' erro: ' || sqlerrm; end if;
  end;
  execute 'reset role';
  perform migracao.afirmar(8, 'mensagem_registrar versão B', v_erros = '',
    coalesce(nullif(v_erros, ''), 'pelo negócio, identidade nova (contato + identidade + conversa), external_id repetido = NULL, outra empresa recusada; nao_lidas pelo gatilho'));
end $$;

-- =====================================================================================
-- Passo 9 — eventos ← superadmin_logs + lead_atribuicoes
-- =====================================================================================
do $$
begin
  if migracao.feito(9) then raise notice 'passo 9 já rodou'; return; end if;
  insert into eventos (empresa_id, tipo, entidade, entidade_id, dados, por_usuario, em)
  select s.empresa_id, 'superadmin.' || s.acao, 'empresa', s.empresa_id, coalesce(s.detalhes, '{}'::jsonb), s.admin_user_id, s.created_at
    from superadmin_logs s where s.empresa_id is not null;
  insert into eventos (empresa_id, filial_id, tipo, entidade, entidade_id, dados, por_usuario, em)
  select a.empresa_id, a.filial_id, 'negocio.' || a.acao, 'negocio', a.lead_id,
         jsonb_strip_nulls(jsonb_build_object('de', a.de_responsavel, 'para', a.para_responsavel)), a.por_usuario, a.created_at
    from lead_atribuicoes a;
  perform migracao.marcar(9, 'eventos');
end $$;

do $$
begin
  perform migracao.afirmar(9, 'eventos do superadmin',
    (select count(*) from eventos where tipo like 'superadmin.%') = migracao.o('superadmin_logs_com_empresa'),
    format('%s eventos (superadmin_logs com empresa: %s; sem empresa, fora: %s)', (select count(*) from eventos where tipo like 'superadmin.%'),
           migracao.o('superadmin_logs_com_empresa'), migracao.o('superadmin_logs_sem_empresa')));
  perform migracao.afirmar(9, 'eventos de atribuição',
    -- ETAPA 0 (22/10/2026): lead_atribuicoes saiu (20261022000300); as atribuições passaram a ser só
    -- negocio_historico (gatilho + negocio_atribuir). Esta checagem só vale no corte.
    (select count(*) from eventos where tipo like 'negocio.%') = migracao.o('lead_atribuicoes'),
    format('%s eventos (lead_atribuicoes: %s)', (select count(*) from eventos where tipo like 'negocio.%'), migracao.o('lead_atribuicoes')));
end $$;

-- =====================================================================================
-- Passo 10 — old_* guardadas (não apagadas)
-- =====================================================================================
do $$
begin
  if migracao.feito(10) then raise notice 'passo 10 já rodou'; return; end if;
  comment on table old_leads is 'old_*: substituída por negocios + contatos (core v1). Apagar 14 dias depois do último deploy que lê a view leads.';
  comment on table old_clientes is 'old_*: substituída por contatos (core v1). Apagar 14 dias depois do último deploy que lê a view clientes.';
  comment on table old_lead_mensagens is 'old_*: substituída por mensagens + conversas (core v1). Apagar 14 dias depois do último deploy que lê a view lead_mensagens.';
  comment on table old_canais_conectados is 'old_*: substituída por canais (core v1). Apagar 14 dias depois do último deploy que lê a view canais_conectados.';
  perform migracao.marcar(10, 'old_* guardadas', jsonb_build_object(
    'dump', 'pg_dump -Fc -t public.old_leads -t public.old_clientes -t public.old_lead_mensagens -t public.old_canais_conectados'));
end $$;

do $$
begin
  perform migracao.afirmar(10, 'old_* intactas',
    (select count(*) from old_leads) = migracao.o('leads') and (select count(*) from old_clientes) = migracao.o('clientes')
    and (select count(*) from old_lead_mensagens) = migracao.o('lead_mensagens')
    and (select count(*) from old_canais_conectados) = migracao.o('canais_conectados'),
    format('old_leads %s, old_clientes %s, old_lead_mensagens %s, old_canais_conectados %s — dump e prazo de 14 dias são manuais',
           (select count(*) from old_leads), (select count(*) from old_clientes), (select count(*) from old_lead_mensagens),
           (select count(*) from old_canais_conectados)));
end $$;

commit;
