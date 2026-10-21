#!/usr/bin/env bash
# Verificacao mecanica dos consertos da auditoria de 18/08/2026.
#
# Existe porque "eu conferi" nao e evidencia: rode isto e veja. Cada linha checa
# UM conserto no codigo. Dois checks aqui ja passaram falso por casarem com o
# comentario que explicava a correcao — por isso agora eles olham a linha exata.
cd "D:/Empresa TI/CRM-SaaS"
ok=0; falha=0
v() { # v "descricao" "arquivo" "padrao"  → confere presenca
  if grep -q -- "$3" "$2" 2>/dev/null; then printf "  ok    %s\n" "$1"; ok=$((ok+1));
  else printf "  FALHA %s  [%s]\n" "$1" "$2"; falha=$((falha+1)); fi
}
n() { # n "descricao" "arquivo" "padrao"  → confere AUSENCIA
  if grep -q -- "$3" "$2" 2>/dev/null; then printf "  FALHA %s (ainda presente)  [%s]\n" "$1" "$2"; falha=$((falha+1));
  else printf "  ok    %s\n" "$1"; ok=$((ok+1)); fi
}

echo "== passada 1: modulos =="
n "orcamento fantasma nao e mais criado" "app/api/leads/mover/route.ts" "from('orcamentos')"
v "venda por link grava a peca"          "app/api/orcamento/[token]/route.ts" "unidade_id: orc.unidade_id"
v "venda por link grava o custo"         "app/api/orcamento/[token]/route.ts" "valor_custo: uni?.preco_custo"
v "venda por link grava o cliente"       "app/api/orcamento/[token]/route.ts" "cliente_id: orc.cliente_id"
v "claim atomico da peca"                "app/api/orcamento/[token]/route.ts" "in('status', \['disponivel', 'reservado'\])"
v "vendedor sem lead vem do orcamento"   "app/api/orcamento/[token]/route.ts" "orc.usuario_id"
v "garantia calculada pelo IMEI"         "app/(dashboard)/assistencia/components/os-modal.tsx" "garantiaDaVenda"
v "garantia procura pela unidade"        "app/(dashboard)/assistencia/components/os-modal.tsx" "inventario_unidades"
v "financeiro avisa das vendas"          "app/(dashboard)/financeiro/components/financeiro-view.tsx" "As vendas não entram"
v "relatorio avisa custo faltando"       "components/modules/relatorios/relatorios-view.tsx" "sem custo lançado"
v "encomenda exige produto e preco"    "components/modules/pdv/encomenda-form.tsx" "Informe o produto e o preço"
v "itens da encomenda no mesmo grupo"   "components/modules/pdv/encomenda-form.tsx" "grupo_pdv: grupo"
v "um pedido de compra por item"        "components/modules/pdv/encomenda-form.tsx" "for (const .n, item. of validos.entries())"
v "entrega cobra o saldo uma vez so"    "components/modules/pdv/encomenda-fechar.tsx" "n === 0 && saldo > 0.005"
v "troca amarrada pelo grupo"           "components/modules/pdv/encomenda-form.tsx" "grupo_pdv: grupo,"
v "troca guarda de quem veio"           "components/modules/pdv/encomenda-form.tsx" "cliente_id: Number(clienteId),"
v "acessorio vira venda propria"        "components/modules/pdv/encomenda-fechar.tsx" "Acessório: "
v "acessorio entra no grupo da encomenda" "components/modules/pdv/encomenda-fechar.tsx" "grupo_pdv: encomenda.grupo_pdv"
v "documentos apos fechar a encomenda"  "components/modules/pdv/encomenda-fechar.tsx" "emitirContrato(supabase"
v "custo editavel na lista"             "components/modules/pdv/encomendas-abertas.tsx" "sem custo"
v "encomenda grava o prazo prometido"    "components/modules/pdv/encomenda-form.tsx" "previsao_entrega: prazo"
v "entrega registra o pagamento"        "lib/encomendas.ts" "registrouPagamento"
v "pedido feito nao troca a data"       "components/modules/pdv/encomendas-abertas.tsx" "solicitado_em., null"
v "prazo compara DIA, nao instante"      "lib/encomendas.ts" "function diaLocal"
v "item da encomenda escreve por funcao" "components/modules/pdv/encomenda-itens.tsx" "onChange((xs) =>"
n "item da encomenda nao parte da lista do render" "components/modules/pdv/encomenda-itens.tsx" "onChange(itens"
v "busca global ordena o lead"        "components/layout/command-palette.tsx" "order(.ultima_mensagem_at."
n "busca global nao volta ao teto de 4" "components/layout/command-palette.tsx" "limit(4)"
v "lead e procurado na loja do canal"   "supabase/functions/webhook-leads/index.ts" "busca = busca.eq(.filial_id., canal.filial_id)"
v "echo tambem respeita a loja"         "supabase/functions/webhook-leads/index.ts" "ql = ql.eq(.filial_id., canal.filial_id)"
v "historico importa na loja do canal"  "supabase/functions/webhook-leads/index.ts" "qh = qh.eq(.filial_id., canal.filial_id)"
v "mensagem guarda o canal de entrada"  "supabase/functions/webhook-leads/index.ts" "canal_id: canal.id"
v "modal aberto recebe o realtime"      "components/modules/leads/leads-view.tsx" "setSelectedLead(prev =>"
v "coluna do kanban guarda a rolagem"  "components/modules/leads/kanban-column.tsx" "ondeParei.current = e.currentTarget.scrollTop"
v "rolagem reposta antes de pintar"    "components/modules/leads/kanban-column.tsx" "useLayoutEffect"
v "sentry sabe quem esta na tela"      "app/(dashboard)/layout.tsx" "<SentryUsuario"
n "sentry nao manda email do usuario"  "components/layout/sentry-usuario.tsx" "email:"
v "erro sem arquivo revela a origem"   "lib/sentry-comum.ts" "origem_desconhecida"
v "tela de leads traz todos"           "app/(dashboard)/leads/page.tsx" "todosOsLeads"
v "conversas lidas em paralelo"        "lib/zapintel/conversas.ts" "Promise.all"
v "paginacao paralela ordena por id"   "lib/zapintel/conversas.ts" "order(.id., { ascending"
n "linguagem nao calcula no cliente"   "app/zapintel/linguagem/page.tsx" "POWER_WORDS"
n "zapintel nao assina sob RLS"        "hooks/zapintel/useLeads.tsx" "postgres_changes"
# ── o teto de 4h de Active CPU da Vercel (09/10/2026) ──────────────────────
# Abrir o painel custava 2,76 s de CPU; 5.217 aberturas gastam o mes inteiro e
# a Vercel PAUSA os projetos. Estes checks guardam o conserto, nao o estilo.
n "a tela nao tem relogio nenhum"   "hooks/zapintel/useLeads.tsx" "setInterval"
n "a tela nao pergunta por pulso"   "hooks/zapintel/useLeads.tsx" "api/pulso"
# 15/10/2026: o menu virou ao vivo (zapintel_resumo) e o "Sincronizar" saiu
# dele; as telas que ainda leem o painel antigo dizem de quando é o número.
# 15/10/2026: o painel antigo saiu inteiro. Estas regras impedem a volta.
n "provider nao baixa o painel"     "hooks/zapintel/useLeads.tsx" "fetch(\"/zapintel/api/painel"
n "ficha nao le o painel"           "app/zapintel/leads/[id]/page.tsx" "usePainelAntigo"
n "ficha sem venda que nao grava"   "app/zapintel/leads/[id]/page.tsx" "markSaleClosed"
v "ficha ao vivo so do lead dela"   "app/zapintel/leads/[id]/page.tsx" "ouvirZapintel(supabase"
v "aviso do banco lista os leads"   "supabase/funcoes/zapintel_ao_vivo.sql" "'leads', to_jsonb(r.leads)"
# 15/10/2026: o motor de agosto saiu inteiro e a ficha foi reescrita do zero.
n "montar sem o motor de agosto"    "lib/zapintel/montar.ts" "classifyLead"
n "vendedor nao sai do texto"       "lib/zapintel/montar.ts" "quemAtendeu("
n "travamento sem objecao por palavra" "lib/zapintel/travou.ts" "OBJECOES"
v "sugestao usa o papel do segmento" "app/zapintel/api/sugestao/route.ts" "papelDoSegmento(segmento)"
v "conversa nao viaja para a tela"  "app/zapintel/api/conversa/route.ts" "messages: \[\]"
v "ficha abre a conversa no CRM"    "app/zapintel/leads/[id]/page.tsx" "/leads?lead="
n "ficha sem leitura automatica"    "app/zapintel/leads/[id]/page.tsx" "RegraAutomatica"
v "ficha so analisa no clique"      "app/zapintel/leads/[id]/page.tsx" "onClick={() => analisar(false)}"
v "ficha rotula audio transcrito"   "app/zapintel/leads/[id]/page.tsx" "áudio transcrito"
n "lista nao manda pro wa.me"       "app/zapintel/leads/page.tsx" "https://wa.me/"
n "posvenda nao manda pro wa.me"    "app/zapintel/posvenda/page.tsx" "https://wa.me/"
v "lista abre a conversa no CRM"    "app/zapintel/leads/page.tsx" "abrir conversa no CRM</a>"
v "lead de outra loja avisa"        "components/modules/leads/leads-view.tsx" "setForaDaLoja(leadNaUrl)"
v "dias contam o calendario da loja" "lib/zapintel/montar.ts" "RELOGIO.format(d).slice(0, 10)"
n "ficha sem ha 0 dias"             "lib/zapintel/ficha.ts" "não voltou — há "
# 15/10/2026: como a loja conversa, por vendedor (apresentacao no audio + Pegar lead)
v "conversa le o banco"             "app/zapintel/atendimento/page.tsx" "rpc(\"zapintel_conversa\""
n "atendimento sem cartao antigo"   "app/zapintel/atendimento/page.tsx" "function Vendedor("
v "autor pela apresentacao"         "supabase/funcoes/zapintel_conversa.sql" "aqui (e|eh) (o|a)"
v "resposta nao reroda por linha"   "supabase/funcoes/zapintel_conversa.sql" "RESP as materialized"
v "venda sem lead nulo"             "supabase/funcoes/zapintel_conversa.sql" "z.lead_id is not null"
v "audio quebrado sai"              "scripts/transcrever-audios.py" "def descartar(linha)"
v "pasta temporaria sai no erro"    "scripts/transcrever-audios.py" "atexit.register(shutil.rmtree"
v "busca acha lead pelo numero"    "components/layout/command-palette.tsx" "buscar_lead_por_numero"
v "busca por numero respeita a loja" "supabase/funcoes/buscar_lead_por_numero.sql" "or l.filial_id is null or l.filial_id = any (v_vis))"
v "posvenda le do banco"            "app/zapintel/posvenda/page.tsx" "useRpcAoVivo<PosVenda>(\"zapintel_posvenda\""
n "posvenda sem promessa de brinde" "app/zapintel/posvenda/page.tsx" "ganha um brinde"
v "funil interno fora do zapintel"  "supabase/funcoes/zapintel_turnos.sql" "zapintel_funil_interno(l.funil_id)"
v "robo conta as novas sem analise" "components/zapintel/robo-analises.tsx" "desatualizadas.length + semAnalise.length"
v "lead troca de funil"             "app/api/leads/mover/route.ts" "funilId"
v "sugestao exige sessao"           "app/zapintel/api/sugestao/route.ts" "zapintelAcesso()"
# -- auditoria do zapintel (15/10/2026): acesso por loja, teto de IA, retencao --
v "acesso pergunta ao banco"        "lib/zapintel/ctx.ts" "rpc('zapintel_escopo'"
v "conversa respeita a loja"        "app/zapintel/api/conversa/route.ts" "lojaVisivel(acesso, banco.filial_id)"
v "perfil respeita a loja"          "app/zapintel/api/perfil/route.ts" "lojaVisivel(acesso, banco.filial_id)"
v "sugestao respeita a loja"        "app/zapintel/api/sugestao/route.ts" "lojaVisivel(acesso"
v "pendentes respeita a loja"       "app/zapintel/api/perfil/pendentes/route.ts" "lojaVisivel(acesso"
v "perfil tem teto por pessoa"      "app/zapintel/api/perfil/route.ts" "excedeuLimiteDoUsuario(db, 'zapintel-perfil'"
v "sugestao tem teto por pessoa"    "app/zapintel/api/sugestao/route.ts" "excedeuLimiteDoUsuario(db, 'zapintel-sugestao'"
v "pendentes paginado"              "app/zapintel/api/perfil/pendentes/route.ts" ".order('lead_id').range(de, ate)"
v "ficha velha nao sobrescreve"     "lib/zapintel/perfil.ts" "Number(guardada.marca) > marca.marca"
v "retencao falha guardando"        "lib/storage/retencao.ts" "nao consegui conferir as imagens, nada apagado"
v "retencao so apaga url limpa"     "lib/storage/retencao.ts" "alvos.filter((a) => limpas.has(a.mensagemId))"
n "chave do gemini fora da url"     "lib/zapintel/ia.ts" "?key="
v "resposta velha descartada"       "hooks/zapintel/useRpcAoVivo.ts" "if (chave !== chaveAtual.current) return;"
v "turnos sem horario por linha"    "supabase/funcoes/zapintel_turnos.sql" "HH as materialized ("
# -- fechamento tecnico (15/10/2026, fase 2) -----------------------------------
n "preview nao muda por GET"        "app/api/zapintel/preview/route.ts" "searchParams.get('empresa')"
v "preview confere a origem"        "app/api/zapintel/preview/route.ts" "if (!mesmaOrigem(req))"
n "preview sem link GET (admin)"    "components/superadmin/addons-empresa.tsx" "api/zapintel/preview?empresa="
n "preview sem link GET (faixa)"    "components/zapintel/preview-banner.tsx" "api/zapintel/preview?clear=1"
v "robo para ao sair do zapintel"   "components/zapintel/robo-analises.tsx" "desmontado.current = true; parar.current = true"
v "funil interno fora da analise"   "app/zapintel/api/perfil/route.ts" "leadDeFunilInterno(db, empresaId, id)"
v "funil interno fora da sugestao"  "app/zapintel/api/sugestao/route.ts" "leadDeFunilInterno(db, empresaId, id)"
v "tempo esgotado nao vira rajada"  "hooks/zapintel/useRpcAoVivo.ts" "error.code === \"57014\" ? 1 : 2"
v "testes existem"                  "package.json" "\"test\": \"node --import ./tests/alias.mjs"
# -- estabilizacao (15/10/2026, fase 3) -----------------------------------------
n "sino nao agrega a view"          "components/layout/topbar.tsx" "from('v_leads_nao_lidas')"
v "sino le o contador do lead"      "components/layout/topbar.tsx" ".gt('msgs_nao_lidas', 0)"
v "sino pagina alem de 1000"        "components/layout/topbar.tsx" ".range(de, de + 999)"
v "sino so escuta recebidas"        "components/layout/topbar.tsx" "filter: 'direcao=eq.recebida'"
n "sino nao escuta tudo"            "components/layout/topbar.tsx" "event: '*', schema: 'public', table: 'lead_mensagens'"
v "sino recarrega ao reconectar"    "components/layout/topbar.tsx" "if (caiu) { caiu = false; scheduleLoad() }"
v "migracoes pendentes com volta"   "supabase/pendentes/03_rls_uma_vez_por_consulta.volta.sql" "backup.rls_politicas_20261015"
v "zapintel so dono/admin (regra)"  "lib/zapintel/quem-usa.ts" "'owner', 'admin'"
v "zapintel so dono/admin (tela)"   "app/zapintel/layout.tsx" "if (liberado && !papelOk)"
v "zapintel so dono/admin (rotas)"  "lib/zapintel/ctx.ts" "if (!(await zapintelPapelPermitido(userId, empresaId))) return null"
v "menu le o banco ao vivo"         "hooks/zapintel/useLeads.tsx" "useRpcAoVivo<Resumo>(\"zapintel_resumo\""
n "menu sem sincronizar"            "components/zapintel/zap-sidebar.tsx" "syncFromCRM"
v "canal unico por empresa"         "hooks/zapintel/useRpcAoVivo.ts" "ouvirZapintel(supabase"
# -- ponte venda->conversa (10/10/2026) ------------------------------------
# Sem ligar venda a conversa, todo numero do ZapIntel e heuristica escrita a
# mao. Estes checks guardam as decisoes que a medicao obrigou.
v "ponte casa por telefone"          "lib/zapintel/ponte.ts" "chaveTelefone"
n "ponte nao casa por nome"          "lib/zapintel/ponte.ts" "like .%. || lower"
v "ponte so olha lead COM conversa"  "supabase/funcoes/zapintel_leads_com_conversa.sql" "join public.lead_mensagens"
v "ponte pagina a funcao tambem"     "lib/zapintel/ponte.ts" "buscarTudo<LeadComConversa>"
v "ponte guarda como e confianca"    "lib/zapintel/ponte.ts" "confianca: candidatos.length > 1"
v "confirmacao manual nao e desfeita" "lib/zapintel/ponte.ts" "protegidos.has"
# -- fim dos numeros inventados (10/10/2026) -------------------------------
# `TICKET_MEDIO = 5200` alimentava "PIPELINE R$ 1,2M" e "objecao mais cara
# R$ 558k", e o pipeline ainda supunha 70% dos quentes fechando (real: 2,8%).
# O check anterior olhava SO `stats.ts` — e foi por isso que um terceiro
# `TICKET_MEDIO = 5200` sobreviveu em performance.ts por mais um dia. Agora
# varre a pasta inteira: check estreito e a mesma coisa que check ausente.
# Performance I e II viraram Atendimento (15/10/2026), calculado no banco. O
# `5200 * 0.3` da ação #02 morava no page.tsx da tela antiga — fora de lib/.
n "atendimento sem ticket inventado" "app/zapintel/atendimento/page.tsx" "5200"
v "atendimento le do banco"          "app/zapintel/atendimento/page.tsx" "useRpcAoVivo<Atendimento>(\"zapintel_atendimento\""
v "atendimento fechado para anon"    "supabase/funcoes/zapintel_atendimento.sql" "revoke all on function public.zapintel_atendimento"
# Tempo de resposta: UMA conta para dashboard e Atendimento (15/10/2026). O
# dashboard tinha regra própria (seg–sáb 8h–20h) e os números não batiam.
v "dashboard usa a conta comum"      "supabase/funcoes/zapintel_dashboard.sql" "from zapintel_turnos(v_emp"
v "atendimento usa a conta comum"    "supabase/funcoes/zapintel_atendimento.sql" "from zapintel_turnos(v_emp"
n "dashboard sem horario proprio"    "supabase/funcoes/zapintel_dashboard.sql" "between 8 and 19"
n "card sem a regra antiga"          "components/zapintel/painel-ao-vivo.tsx" "seg a sáb, 8h–20h"
v "endereco antigo redireciona"      "next.config.ts" "destination: '/zapintel/atendimento'"
v "a IA do zapintel usa a do CRM"    "lib/zapintel/ia.ts" "GEMINI_API_KEY"
v "a IA respeita o desligar geral"   "lib/zapintel/ia.ts" "cfg.ativo === false"
# O padrao olha a DECLARACAO, nao a palavra: o arquivo cita `allText` no
# comentario que explica por que o campo saiu, e o aviso deve continuar la.
v "sem venda a tela nao inventa"     "components/zapintel/painel-ao-vivo.tsx" "sem venda registrada para estimar o ticket"
# -- ficha por lead e frase antes do silencio (10/10/2026) -----------------
# O corte de 24h e a regra que torna o ranking honesto: sem ele o topo vira a
# frase de RETOMADA, mandada dias depois para quem ja tinha sumido (740 -> 418
# conversas). E marcador de midia nao e fala ("Video enviado pelo celular"
# aparecia 54x).
v "ficha relata, nao escolhe frase"   "lib/zapintel/ficha.ts" "montarRelato"
v "silencio exige conversa viva"      "lib/zapintel/ficha.ts" "> 86_400_000) return null"
v "midia nao conta como fala"         "lib/zapintel/ficha.ts" "function ehFala"
v "retomada nao conta como sumico"    "supabase/funcoes/zapintel_dashboard.sql" "interval '20 hours'"
v "a tela diz precedeu, nao causou"   "components/zapintel/painel-ao-vivo.tsx" "Mostra onde olhar, não o que culpar"
v "a ficha chega com a conversa"      "app/zapintel/api/conversa/route.ts" "montarFicha"
# -- recalibracao da classificacao (10/10/2026) ----------------------------
# 133 leads eram marcados "cliente" por palavra; 33 compraram. E a conversa
# funda no 1o dia prediz (7,65x) enquanto "Pediu 18x" nao prediz nada (+2pp).
v "a ficha traz os tres momentos"    "lib/zapintel/ficha.ts" "primeiraFalaDoCliente"
v "saudacao nao conta como pedido"   "lib/zapintel/ficha.ts" "SAUDACAO.test(soLetras"
# -- o caminho de importacao manual saiu em 10/10/2026 --------------------
# O negocio e online; manter o import era guardar duas verdades sobre o mesmo
# lead e pagar o parser de CSV no meio de cada recalculo.
v "le as tabelas direto, sem CSV"    "lib/zapintel/conversas.ts" "montarLeads(porId, msgs)"
n "nao existe mais parser de CSV"    "lib/zapintel/conversas.ts" "parseCombinedCSV"
# O padrao olha a DECLARACAO: o arquivo cita o numero no comentario que explica
# por que ele saiu, e esse aviso deve continuar la.
n "telefone da loja nao esta no codigo" "lib/zapintel/montar.ts" "const STORE_PHONE"
v "o lado da mensagem vem da direcao" "lib/zapintel/montar.ts" "isStore: m.direcao"
v "o lead carrega os fatos do CRM"   "lib/zapintel/montar.ts" "kanbanStatus: banco.kanban_status"
# -- a ponte alcanca o Instagram (11/10/2026) ------------------------------
# Lead de IG nao tem telefone (3 em 384). O numero vem do que o CLIENTE disse
# na conversa, com tres filtros achados medindo: chave Pix/CPF repetida em 29
# leads, o numero da loja do lado `enviada`, e formato (DDD + 9 + 8 digitos).
v "ponte usa telefone do texto"      "lib/zapintel/ponte.ts" "chaveTelefone(l.telefone_no_texto)"
n "origem_id nao vira chave"         "lib/zapintel/ponte.ts" "chaveTelefone(l.origem_id)"
v "so a fala do cliente"             "supabase/funcoes/zapintel_leads_com_conversa.sql" "direcao = .recebida."
v "numero repetido nao e de cliente" "supabase/funcoes/zapintel_leads_com_conversa.sql" "count(distinct id) > 2"
v "exige formato de celular"         "supabase/funcoes/zapintel_leads_com_conversa.sql" "between 11 and 99"
v "proxy sai antes de abrir o supabase" "proxy.ts" "SEM_SESSAO.some"
# O matcher corta ANTES de acordar o proxy; SEM_SESSAO corta depois. Os dois
# existem, nesta ordem. O terceiro check e o que mais importa: matcher montado
# com `+` nao e constante, o Next IGNORA e o proxy volta a rodar em tudo — em
# silencio, sem erro, sem aviso.
v "matcher exclui o tunel do sentry"    "proxy.ts" "|monitoring|"
v "matcher exclui webhook e cron"       "proxy.ts" "|api/webhook/|api/cron/|"
v "matcher exclui arquivo publico"      "proxy.ts" "|i/|offline|sw"
n "matcher nao e concatenacao"          "proxy.ts" "' +$"

echo "== o ponto onde a venda travou + o dia da loja (12/10) =="
# O relogio: `getHours()` devolvia a hora do PROCESSO (UTC na Vercel), e o
# painel guardado dizia pico as 14h quando o real e 11h.
v "data e hora no fuso da loja"      "lib/zapintel/montar.ts" "FUSO_DA_LOJA = 'America/Sao_Paulo'"
n "nao formata hora pelo processo"   "lib/zapintel/montar.ts" "d.getHours()"
# A fala que encerrou tem que vir DEPOIS no fio: `ehFala` descarta audio e
# mensagem de 3 letras, e comparar por HORA dava "ele sumiu" com a resposta
# dele visivel na linha de baixo.
v "fim da conversa compara indice"   "lib/zapintel/ficha.ts" "ultimaFala.i < ultimaDoCliente.i"
v "travamento sai do indice"         "lib/zapintel/travou.ts" "indiceDaFalaQueEncerrou"
n "venda fechada nao tem travamento" "lib/zapintel/travou.ts" "ondeTravou(a: Lead): "
# Audio e resposta. Com `ehFala` nesta linha, conversa respondida por audio
# aparecia como "a loja nao voltou".
v "audio conta como resposta"        "lib/zapintel/travou.ts" "if (!m.isStore) continue"
# Uma porta de IA so: desligar no painel tem que calar as tres telas.
v "ia do zapintel num lugar so"      "lib/zapintel/ia.ts" "assistente_config"
v "sugestao usa a porta unica"       "app/zapintel/api/sugestao/route.ts" "perguntarIA"
# O prompt nao pode ter o nome de um tenant escrito no codigo.
v "sugestao pega o nome do banco"    "app/zapintel/api/sugestao/route.ts" "nomeDaLoja"
v "prompt monta a loja em runtime"   "app/zapintel/api/sugestao/route.ts" "de \${nomeDaLoja}"
# Uma chamada de IA por abertura de tela seria o erro do pulso de 20s. Desde
# 14/10/2026 o resumo do dia so existe quando alguem pede (botao -> assistente),
# e nenhuma tela pede analise sozinha.
n "dashboard nao chama IA sozinho"   "components/zapintel/painel-ao-vivo.tsx" "zapintel/api/dia"
v "resumo do dia so quando pedem"    "components/zapintel/painel-ao-vivo.tsx" "assistente:perguntar"
# Ao vivo sem pulso (14/10/2026): o banco avisa, a tela consulta com teto.
v "ao vivo tem teto de ritmo"        "hooks/zapintel/useRpcAoVivo.ts" "INTERVALO_MINIMO = 20_000"
# Insights (14/10/2026): das análises e das vendas, no banco; nada do motor de palavras.
v "insights le do banco"             "app/zapintel/insights/page.tsx" "useRpcAoVivo<Insights>(\"zapintel_insights\""
n "insights sem chamou pelo nome"    "app/zapintel/insights/page.tsx" "calledByName"
n "insights sem atendente do texto"  "app/zapintel/insights/page.tsx" "sellerDistribution"
v "insights fechado para anon"       "supabase/funcoes/zapintel_insights.sql" "revoke all on function public.zapintel_insights"
v "lista de leads usa o ao vivo"     "app/zapintel/leads/page.tsx" "useRpcAoVivo<Lista>(\"zapintel_leads_lista\""
v "aviso ao vivo nao derruba webhook" "supabase/funcoes/zapintel_ao_vivo.sql" "exception when others"
v "conversas fechadas para anon"     "supabase/funcoes/seguranca_20261014.sql" "revoke all on function public.zapintel_conversas"
# O teto de tokens e cobrado do PENSAMENTO do modelo tambem. Com 400, o
# gemini-3.6-flash devolveu meia frase em ingles para a tela. Quem segura o
# tamanho e a regra de frases no prompt, nunca o teto.
v "teto de tokens e de seguranca"    "lib/zapintel/ia.ts" "TETO_DE_SEGURANCA = 8_000"
n "sugestao nao aperta o teto"       "app/zapintel/api/sugestao/route.ts" "maxTokens: [0-9]"
# O padrao do gemini-3.6-flash e pensar em `medium`, e isso estourou 20s de
# timeout em producao com o briefing completo. Redacao nao precisa raciocinio.
v "ia pede raciocinio baixo"         "lib/zapintel/ia.ts" "NIVEL_DE_RACIOCINIO = 'low'"
# Modelo que nao conhecer o campo nao pode derrubar a IA inteira do CRM.
v "modelo sem thinking tem volta"    "lib/zapintel/ia.ts" "repetindo sem ele"
# 503 do Google e pico de demanda, e ele mesmo diz que passa.
v "503 do provedor tem retentativa"  "lib/zapintel/ia.ts" "em alta demanda; tentando de novo"
# A JM e `varejo` no CRM -> `ecommerce` no ZapIntel -> "loja de moda/varejo".
# Com isso no prompt, a IA oferecia "suas pecas" para quem queria iPhone.
v "sugestao fala do produto real"    "lib/zapintel/travou.ts" "O que ele procurou"

echo "== audio transcrito (13/10) =="
# 35% do que a loja fala e audio. Enquanto o conteudo era so "[audio]", todo
# motor media dois tercos da conversa e apresentava como se fosse ela inteira.
v "motor le a transcricao"           "lib/zapintel/montar.ts" "m.transcricao?.trim() || m.conteudo"
v "conversa traz a transcricao"      "lib/zapintel/conversas.ts" "created_at, transcricao"
# A tela NAO pode mostrar transcricao como texto digitado: a maquina escreveu
# "no prato" onde era "preto". Requisito do Lucas.
v "tela marca o que foi falado"      "lib/zapintel/montar.ts" "transcrito: !!m.transcricao"
v "chat rotula a transcricao"        "components/modules/leads/lead-modal.tsx" "transcrição automática"
v "chat usa tipografia propria"      "components/modules/leads/lead-modal.tsx" "font-serif text-\[12.5px\] italic"
v "chat avisa se o audio saiu"       "components/modules/leads/lead-modal.tsx" "áudio não guardado"
# Vocabulario so com nome proprio: listar modelo fez a IA INVENTAR "o Pro Max".
n "vocabulario sem modelo"           "scripts/transcrever-audios.py" "VOCABULARIO = ($|.*256GB)"

echo "== direcao do historico importado (13/10) =="
# `to` NUNCA vem no payload do historico: em 611 mensagens aparecia 0 vezes.
# A condicao era sempre falsa e TUDO entrava como recebida.
n "nao decide direcao por to"        "supabase/functions/webhook-leads/index.ts" "doNegocio = !!m.to;"
v "direcao vem do remetente"         "supabase/functions/webhook-leads/index.ts" "remetente === numeroDaLoja"
# O historico da Meta e RASO: 406 conversas, 613 mensagens (1,5 cada). Cada
# reconexao enchia o funil de casca — 188 leads de 1 msg numa hora.
v "conversa de 1 msg nao vira lead"  "supabase/functions/webhook-leads/index.ts" "linhas.length < 2"
v "conta quantas foram ignoradas"    "supabase/functions/webhook-leads/index.ts" "conversas de 1 msg ignoradas"
n "painel de responsavel sem copia"     "components/modules/leads/responsavel-panel.tsx" "setRespId"
v "chat conta nao lidas por conversa"   "hooks/use-chat-nao-lidas.ts" "chat_nao_lidas_por_conversa"
v "chat marca lido ao abrir"            "app/(dashboard)/chat/chat-view.tsx" "marcarConversaLida(conversaAtual)"
v "menu do chat tem contador"           "lib/menu.ts" "badge: .chat."
v "contagem so apos inscrever"          "hooks/use-chat-nao-lidas.ts" "status === .SUBSCRIBED."
v "push cala na conversa aberta"        "public/sw.js" "data.conversa === conversaAberta"
v "so cala com a tela a vista"          "public/sw.js" "visibilityState === .visible."
v "tela avisa o sw qual conversa"       "app/(dashboard)/chat/chat-view.tsx" "tipo: .chat:conversa."
v "push diz de qual conversa veio"      "app/api/chat/notify/route.ts" "conversa: .direto:"

echo "== passada 2: rotas abertas =="
v "cadastro publico com teto"       "app/api/register/route.ts" "excedeuLimite"
v "agendar com teto"                "app/api/agendar/[slug]/route.ts" "excedeuLimite"
v "pedido do cardapio com teto"     "app/api/menu/[slug]/pedido/route.ts" "excedeuLimite"
v "lead do site imob com teto"      "app/api/imob/[slug]/lead/route.ts" "excedeuLimite"
n "feed de veiculos sem nota interna" "app/api/veiculos/[slug]/route.ts" "preco_venda, observacoes"
v "feed exige capacidade de veiculo"  "app/api/veiculos/[slug]/route.ts" "usaPlaca"
v "agendar exige capacidade"          "app/api/agendar/[slug]/route.ts" "agendaClinica"
v "cardapio exige capacidade"         "app/api/menu/[slug]/pedido/route.ts" "usaComanda"
v "OS aprovada com claim atomico"     "app/api/os/[token]/route.ts" "is('aprovado_em', null)"
v "config de pagamento so admin"      "app/api/payments/config/route.ts" "requireEmpresaRoleApi"
v "funis so admin"                    "app/api/funis/route.ts" "requireEmpresaRoleApi"

echo "== webhooks de pagamento (recusam sem assinatura) =="
for prov in asaas efibank mercadopago pagseguro; do
  v "$prov recusa sem segredo" "lib/payments/providers/$prov.ts" "webhook recusado"
done

echo "== passada 3: teste na tela =="
v "conversao avisa o que falta"       "components/modules/leads/lead-modal.tsx" "camposFaltantesContrato"
v "estoque grava quem deu entrada"    "app/(dashboard)/estoque/components/estoque-view.tsx" "usuario_id: autor?.id"
v "PDV amarra a peca na venda"        "app/(dashboard)/pdv/components/pdv-view.tsx" "unidade_id: c.item.id,"
v "PDV nao chama recebido de venda"   "app/(dashboard)/pdv/components/pdv-view.tsx" "Recebido do cliente"
v "pagina publica mostra o item"      "app/orcamento/[token]/orcamento-view.tsx" "dados.tipo === 'venda' &&"
v "encomenda copia a serie"           "lib/encomendas.ts" "serieDaUnidade"
v "datas: helper existe"              "lib/datas.ts" "SO_DATA"
v "compras usa o helper"              "app/(dashboard)/compras/components/compras-view.tsx" "formatarDiaMes"
# A tela /chaves saiu (21/08/2026); a regra da data pura mudou de casa junto.
v "chave usa o helper de data"         "lib/chave-imovel.ts" "paraData"

echo "== passada 4 e 5: o que era meu =="
v "rota da empresa existe"            "app/api/empresa/route.ts" "requireEmpresaRoleApi"
v "rota da empresa usa service role"  "app/api/empresa/route.ts" "createServiceClient"
if head -1 lib/planos.ts | grep -q "use client"; then printf "  FALHA planos.ts virou modulo de cliente
"; falha=$((falha+1)); else printf "  ok    planos.ts nao e modulo de cliente
"; ok=$((ok+1)); fi
v "contrato recusa loja sem CNPJ"     "lib/contrato-emitir.ts" "lojaIdentificada"
v "tela trata a recusa (garantia)"    "app/(dashboard)/garantia/components/termos-view.tsx" "r.bloqueado"
v "tela trata a recusa (PDV)"         "app/(dashboard)/pdv/components/pdv-view.tsx" "r.bloqueado"
v "tela trata a recusa (Historico)"   "components/modules/historico/historico-view.tsx" "r.bloqueado"
v "Historico avisa campos do cliente"  "components/modules/historico/historico-view.tsx" "r.faltando"

echo "== painel executivo (19/08) =="
# Padroes escolhidos para NAO casarem com comentario: sao trechos de codigo
# executavel (chamada, chave de objeto, expressao), nunca prosa minha.
v "executivo exige dono ou admin"     "app/(dashboard)/executivo/page.tsx" "await requireEmpresaRole(.'owner', 'admin'.)"
v "executivo trava por capacidade"    "app/(dashboard)/executivo/page.tsx" "cfgSeg.capacidades.comissaoPorNegocio) return <VitrineDoModulo"
v "executivo no menu e opcional"      "lib/menu.ts" "href: '/executivo', label: 'Executivo', icon: 'Landmark', opcional: true, adminOnly: true"
v "icone do executivo no mapa"        "components/layout/menu-icons.ts" "Landmark,"
v "comissao respeita papel vago"      "lib/comissao-imob.ts" "temCaptador ? arredonda"
v "rota informa os papeis"            "app/api/imob/negocios/route.ts" "captador: !!captadorId, vendedor: !!corretorId"
v "eficiencia por origem e historica" "app/(dashboard)/executivo/page.tsx" "qFechados"

echo "== menu do segmento (19/08) =="
v "resolverMenu injeta extras"        "lib/menu.ts" "if (noCatalogo.has(ex.href)) continue"
v "extra escolhe o grupo"             "lib/menu.ts" "const grupo = ex.grupo ?? 'Operação'"
v "ranking e extra da imobiliaria"    "lib/segmentos.ts" "href: '/ranking', label: 'Metas e Ranking'"
v "ranking abre por segmento"         "app/(dashboard)/ranking/page.tsx" "if (!isAdmin && !abertoAoTime) redirect"
v "trava do ranking le o banco"       "app/(dashboard)/ranking/page.tsx" "extrasBanco.some"
v "captacao de imovel e modulo proprio" "lib/captacao-imob.ts" "imoveisCaptadosPorPessoa"
# Sem '*' no padrao: no grep basico ele e quantificador, e a checagem passava a
# exigir espacos onde o codigo tem "* 1" — o check falhava com o codigo certo.
v "ranking soma imovel captado"       "lib/ranking.ts" "+ l.imoveisCaptados"
v "conversao segue sendo por lead"    "lib/ranking.ts" "l.conversao = l.captacoes > 0"

echo "== agenda em calendario (19/08) =="
v "agenda trava por capacidade"        "app/(dashboard)/agenda/page.tsx" "cap.agendaVisitas"
n "agenda nao olha nome de segmento"   "app/(dashboard)/agenda/page.tsx" "seg !== 'imobiliaria'"
v "agenda usa dia LOCAL"               "app/(dashboard)/agenda/agenda-view.tsx" "const chaveLocal"
v "agenda tem aba supervisao"          "app/(dashboard)/agenda/agenda-view.tsx" "aba === 'supervisao'"
v "agenda avisa fim em outro dia"      "app/(dashboard)/agenda/agenda-view.tsx" "const faixa ="
v "compromisso tem tipo e fim"         "app/(dashboard)/agenda/agenda-view.tsx" "participantes: form.participantes.trim"
v "menu ordena por segmento"           "lib/menu.ts" "seg.menuLayout"
v "imob abre por dashboard e pipeline" "lib/segmentos.ts" "menuLayout: { Hoje:"

echo "== pipeline (19/08) =="
v "pipeline filtra por responsavel"   "components/modules/leads/leads-view.tsx" "setResponsavelId(e.target.value)"
v "palavra do filtro vem do segmento" "components/modules/leads/leads-view.tsx" "equipeLabel.toLowerCase()"
v "pagina passa a palavra da equipe"  "app/(dashboard)/leads/page.tsx" "equipeLabel ?? 'Vendedor'"
v "filtro so para quem ve o colega"    "components/modules/leads/leads-view.tsx" "{!restringe && ("
n "filtro nao exige equipe montada"    "components/modules/leads/leads-view.tsx" "restringe && usuarios.length > 1"
v "esteira e responsavel exclusivos"   "components/modules/leads/leads-view.tsx" "if (responsavelId) return leadsDoFunilBase.filter"

echo "== funil: uma verdade so (19/08) =="
n "superadmin nao edita funil morto"    "app/superadmin/segmentos/segmentos-view.tsx" "funil_seed"
n "rota de segmentos nao grava seed"    "app/api/superadmin/segmentos/route.ts" "funil_seed"
n "segmentos.ts nao declara funil"      "lib/segmentos.ts" "funil: ["
v "relatorio imob le o funil da empresa" "components/modules/relatorios/relatorios-imob-view.tsx" "doBanco.length > 0 ? doBanco"
v "padrao do codigo tem Aprovados"      "components/modules/leads/types.ts" "label: 'Aprovados'"

echo "== gestao de leads (20/08) =="
v "faixa de atraso tem fonte unica"    "lib/lead-parado.ts" "export function gravidadeDoAtraso"
n "dashboard nao redefine a faixa"     "app/(dashboard)/dashboard/leads-parados.tsx" "function prioridade"
v "dias parados usa o marco recente"   "lib/lead-parado.ts" "Math.max(...marcos)"
v "tela corta etapa terminal"          "app/(dashboard)/gestao-leads/page.tsx" "terminais.has"
# A primeira versao ESCONDIA o card "Atencao" porque ele nunca somava. O certo era
# a faixa comecar em 3 dias e a lista abrir nela — os cinco cards do original existem.
v "faixa atencao existe de verdade"    "lib/lead-parado.ts" "label: 'Atenção',  desde: 3"
v "tela mostra as quatro faixas"       "app/(dashboard)/gestao-leads/gestao-leads-view.tsx" "GRAVIDADES.map"
v "vocabulario do dono nas abas"       "app/(dashboard)/gestao-leads/gestao-leads-view.tsx" "'Leads Perdidos'"
v "follow-up abre as sugestoes"        "app/(dashboard)/gestao-leads/gestao-leads-view.tsx" "Enviar via WhatsApp"
v "regiao vem do perfil de busca"      "app/(dashboard)/gestao-leads/page.tsx" "lead_perfil_busca"
n "faixa nao usa opacidade sobre soft" "app/(dashboard)/gestao-leads/gestao-leads-view.tsx" "bg-warn-soft/"
v "rodar reativacao recarrega numero"  "app/(dashboard)/gestao-leads/gestao-leads-view.tsx" "router.refresh()"
v "texto da mensagem e da loja"        "app/(dashboard)/gestao-leads/page.tsx" "mensagens_templates"
n "menu nao renomeia mais conversao"   "lib/segmentos.ts" "'/conversao': 'Gest"

echo "== cliente imobiliario (20/08) =="
v "ficha imob por capacidade"          "app/(dashboard)/clientes/page.tsx" "clienteComPipeline"
v "varejo mantem a ficha antiga"       "app/(dashboard)/clientes/components/clientes-view.tsx" "imob ? ("
v "etapa grava no LEAD"                "app/(dashboard)/clientes/components/cliente-modal-imob.tsx" "kanban_status: id"
# Sem 'as never' no insert do lead: quem confere o payload contra as colunas reais
# e o TypeScript, nao um grep — foi assim que o 'email' inexistente apareceu.
v "insert do lead sem cast cego"       "app/(dashboard)/clientes/components/cliente-modal-imob.tsx" "}).select(.id.).single<{ id: number }>()"
v "guarda de empresa no insert"        "app/(dashboard)/clientes/components/cliente-modal-imob.tsx" "typeof emp !== .number."
v "cliente sem lead nao inventa score" "app/(dashboard)/clientes/components/clientes-view.tsx" "Sem lead vinculado"
v "15 caracteristicas do modelo"       "app/(dashboard)/clientes/components/cliente-imob-tipos.ts" "'Ar Condicionado'"
v "10 tipos de imovel do modelo"       "app/(dashboard)/clientes/components/cliente-imob-tipos.ts" "'Sala Comercial'"
v "status de aprovacao existe"         "app/(dashboard)/clientes/components/cliente-imob-tipos.ts" "em_analise"

echo "== fusao de clientes (20/08) =="
v "fusao roda numa funcao do banco"    "app/api/clientes/fundir/route.ts" "rpc('fundir_clientes'"
v "fundir exige dono ou admin"         "app/api/clientes/fundir/route.ts" "await requireEmpresaRoleApi(.'owner', 'admin'.)"
n "empresa nao vem do corpo"           "app/api/clientes/fundir/route.ts" "b.empresa"
v "confirmacao exige digitar o nome"   "app/(dashboard)/clientes/components/fundir-leads-modal.tsx" "disabled={!podeConfirmar}"
v "os tres passos do modelo"           "app/(dashboard)/clientes/components/fundir-leads-modal.tsx" "SECUNDÁRIO (será removido)"
v "lista recarrega apos fundir"        "app/(dashboard)/clientes/components/clientes-view.tsx" "router.refresh()"

echo "== rotulo do topo (20/08) =="
v "topo respeita rotulo do segmento"   "components/layout/topbar.tsx" "const titulo = rotuloDoSegmento ?? title"
v "layout passa os rotulos"            "app/(dashboard)/layout.tsx" "RotulosProvider valor="
v "rotulo resolve pela raiz da rota"   "components/layout/rotulos-context.tsx" "const raiz = ./. + (pathname.split"

echo "== relatorios: filtro e exportacao (20/08) =="
v "relatorio recorta por periodo"      "components/modules/relatorios/relatorios-imob-view.tsx" "soData.test(de)"
# O regex de data perdeu a barra do d num script meu e passou a NAO CASAR NUNCA: a
# tela dizia "Recorte: julho" e mostrava agosto. Este check existe por causa disso.
n "regex de data nao perdeu a barra"   "components/modules/relatorios/relatorios-imob-view.tsx" "/^d{4}"
n "regex do export tambem esta certo"  "app/api/exportar/route.ts" "/^d{4}"
v "export usa o mesmo recorte"         "app/api/exportar/route.ts" "cfg.corretor && corretor"
v "seis conjuntos para exportar"       "app/api/exportar/route.ts" "imob_corretores"
v "css de impressao existe"            "app/globals.css" "@media print"
v "impressao esconde so os controles"  "components/modules/relatorios/relatorios-filtros.tsx" "gap-2 print:hidden"

echo "== metas e ranking (20/08) =="
# Lista vazia no banco nao pode vencer a declaracao do codigo: com
# modulos_extra = [] o item sumia do menu e o corretor caia no dashboard.
v "extra vazio do banco cai no codigo" "lib/menu.ts" "segOverride?.modulosExtra?.length ?"
v "acesso do time checa lista cheia"   "app/(dashboard)/ranking/page.tsx" "extrasBanco.length > 0"
v "segmento nomeia quem vende"         "lib/segmentos.ts" "equipeLabel: .Corretor."
v "menu e ranking usam o mesmo nome"   "app/(dashboard)/layout.tsx" "equipeLabel ?? .Vendedor."
v "coluna leva o nome do segmento"     "app/(dashboard)/ranking/ranking-view.tsx" "font-semibold\">{equipeLabel}"
v "cabecalho da secao como no modelo"  "app/(dashboard)/ranking/ranking-view.tsx" "Ranking Completo"
v "papel aparece ao lado do nome"      "app/(dashboard)/ranking/ranking-view.tsx" "papelDe(papeis.l.usuario_id., equipeLabel)"
v "mes e ano em lista"                 "app/(dashboard)/ranking/ranking-view.tsx" "aria-label=\"Ano\""
v "equipe geral e a primeira opcao"    "app/(dashboard)/ranking/ranking-view.tsx" "Equipe Geral"
# Tipo fora da lista da rota virava "vendas" em silencio: a meta media outra coisa.
v "meta de imovel captado e aceita"    "app/api/ranking/metas/route.ts" "imoveis_captados"
n "sem opcao duplicada de fechamento"  "app/(dashboard)/ranking/ranking-view.tsx" "v: .fechamentos., l:"
echo "== financeiro: comissoes e cashback (20/08) =="
# Lancar comissao a mao e dizer que a casa deve dinheiro sem negocio no funil.
v "lancar a mao exige dono ou admin"   "app/api/imob/negocios/route.ts" "pode lançar comissão à mão"
v "corretor conferido na empresa"      "app/api/imob/negocios/route.ts" "Corretor não encontrado nesta empresa"
# 0% passaria batido: o valor do negocio aparece cheio e a comissao sai zero.
v "percentual obrigatorio no manual"   "app/api/imob/negocios/route.ts" "% de comissão combinado"
v "percentual digitado tem funcao own" "lib/comissao-imob.ts" "calcularComissaoPorPercentual"
v "os quatro status do molde"          "components/modules/financeiro/comissoes-imob.tsx" "v: .aprovada., l: .Aprovado."
v "aprovar e pagar sao datas do server" "app/api/imob/negocios/route.ts" "comissao_aprovada_em = hojeIso()"
# Cancelar comissao avulsa nao pode mandar update com id nulo no imovel.
v "cancelar respeita imovel nulo"      "app/api/imob/negocios/route.ts" "cancelado. && atual.imovel_id"
v "filtro por corretor status e tipo"  "components/modules/financeiro/comissoes-imob.tsx" "Todos os corretores"
# Cartao somando tudo com a tabela filtrada faz o dono cobrar o valor errado.
v "totais seguem o recorte da tela"    "components/modules/financeiro/comissoes-imob.tsx" "}, .visiveis.)"
v "comissao abre primeiro na imob"     "app/(dashboard)/financeiro/components/financeiro-view.tsx" "temComissoes ? .comissoes. : .fluxo."
v "caixa nao aparece na aba comissao"  "app/(dashboard)/financeiro/components/financeiro-view.tsx" "tab === .comissoes. ? .hidden."
v "conta do lancamento aparece antes"  "components/modules/financeiro/comissoes-imob.tsx" "Fica com a casa"
v "cashback maior que a casa avisa"    "components/modules/financeiro/comissoes-imob.tsx" "cashbackCabe(conta, cashbackNum)"
v "executivo ignora imovel nulo"       "app/(dashboard)/executivo/page.tsx" "filter((id): id is number"
echo "== menu configuravel e rolagem (20/08) =="
# Salvar segmento zerava hidden_hrefs e modulos_extra: era ?? [] em campo que a
# tela nem manda. Foi como a imobiliaria perdeu os extras do menu.
v "salvar segmento nao zera campo"     "app/api/superadmin/segmentos/route.ts" "SALVAR É REMENDO"
v "campo ausente conserva o banco"     "app/api/superadmin/segmentos/route.ts" "vindo !== undefined ? vindo"
v "ordem do menu tem coluna"           "app/superadmin/segmentos/segmentos-view.tsx" "menu_layout: form.menu_layout"
v "ordem em camadas no resolvedor"     "lib/menu.ts" "configDono?.ordem ?? {}"
v "chave dos grupos e unica"           "lib/menu.ts" "CHAVE_GRUPOS = "
v "dono salva a ordem"                 "app/api/menu-config/route.ts" "body.ordem ?? {}"
v "editor de ordem e lista unica"     "components/layout/menu-ordenavel.tsx" "CHAVE_ORDEM.: novo.map"
# Alca, e nao a linha toda: senao clicar no campo de renomear arrastaria o item.
v "arraste sai da alca"                "components/layout/menu-ordenavel.tsx" "aria-label={.Reordenar"
v "menu sai plano do resolvedor"       "lib/menu.ts" "export function resolverMenuPlano"
v "setas existem ao lado do arraste"   "components/layout/menu-ordenavel.tsx" "aria-label=\"Descer\""
# O menu cortava sem aviso e nem rolava ate a pagina aberta (medido em /ranking).
v "menu rola ate o item ativo"         "components/layout/nav-rolavel.tsx" "scrollIntoView({ block: .nearest. })"
v "aviso de conteudo escondido"        "components/layout/nav-rolavel.tsx" "cortado.abaixo"
v "item ativo marcado no CRM"          "components/layout/sidebar.tsx" "data-ativo={isActive || undefined}"
v "rodape nao encolhe"                 "components/layout/sidebar.tsx" "shrink-0 px-3 py-2.5"
v "meu menu ve a config do segmento"   "app/admin/meu-menu/page.tsx" "carregarConfigEmpresa(supabase, empresaId"
# 21/10/2026: o segmento e as camadas vem do core (lib/empresa-config.ts); o menu
# do CRM, a trava de rota e esta tela leem a mesma funcao.
v "menu le as camadas do core"         "app/(dashboard)/layout.tsx" "carregarConfigEmpresa(supabase"
v "trava le o preset"                  "proxy.ts" "presets_onboarding"
v "superadmin nao apaga habilitados"   "app/api/superadmin/empresas/[id]/overrides/route.ts" "PRESERVA o que existe"
# 21/10/2026 (etapa 0, 2.1): o painel le o core por lib/painel/metricas.ts, e o
# lucro so existe onde ha custo lancado (antes: 'margem de 100%' sem custo).
v "painel conta lucro so com custo"     "lib/painel/metricas.ts" "comCusto.length"
n "pagina do painel nao le a view"      "app/(dashboard)/dashboard/page.tsx" "from('vendas')"
n "rota do painel nao le a view"        "app/api/dashboard/route.ts" "from('leads')"
n "card nao divide lucro por receita"   "components/modules/dashboard/dashboard-view.tsx" "lucro / receita"
v "card mostra sem custo lancado"       "components/modules/dashboard/dashboard-view.tsx" "sem custo lançado"
# 21/10/2026: tarefas tem duas chaves para negocios desde o corte; embed sem o
# nome da chave e PGRST201 (lista vazia, criar tarefa falha calado).
n "lista de tarefas sem embed ambiguo"   "app/(dashboard)/tarefas/page.tsx" "leads(nome)"
n "criar tarefa sem embed ambiguo"      "app/(dashboard)/tarefas/tarefas-view.tsx" "leads(nome)"
n "painel imob sem embed ambiguo"       "app/(dashboard)/dashboard/dashboard-imob.tsx" "vencimento, leads(nome)"
n "follow-ups do painel sem ambiguo"    "components/modules/dashboard/dashboard-view.tsx" "vencimento, leads(nome)"
# 21/10/2026 (etapa 0, 2.4): Simular parcela, Check IMEI e FIPE sao ferramentas,
# nao itens de menu; moram em Orcamentos/Estoque/Avaliacoes e abrem pelo Cmd+K.
v "ferramenta nao entra no menu"        "lib/menu.ts" "if (item.ferramenta) {"
v "trava conhece a rota da ferramenta"  "lib/menu.ts" "pathname.startsWith(i.ferramenta.rota +"
v "parcela e aba de orcamentos"         "app/(dashboard)/orcamentos/abas.tsx" "useFerramenta('/simular-parcela')"
v "imei e aba do estoque"               "app/(dashboard)/estoque/components/estoque-view.tsx" "useFerramenta('/check-imei')"
v "fipe mora em avaliacoes"             "app/(dashboard)/avaliacoes/avaliacoes-view.tsx" "useFerramenta('/consulta-fipe')"
v "cmd+k abre as ferramentas"           "components/layout/command-palette.tsx" "useFerramentas()"
v "endereco antigo responde 308"        "next.config.ts" "destination: '/estoque/imei', permanent: true"
# 21/10/2026 (etapa 0, 2.3): duplicadas num lugar so. Relatorios/Financeiro = CRM;
# Integracoes = /admin/integracoes; codigo copiado de stripe e preview vira funcao.
v "admin/relatorios responde 308"       "next.config.ts" "source: '/admin/relatorios', destination: '/relatorios', permanent: true"
v "admin/financeiro responde 308"       "next.config.ts" "source: '/admin/financeiro', destination: '/financeiro', permanent: true"
n "configuracoes sem aba integracoes"   "components/modules/configuracoes/configuracoes-view.tsx" "id: 'integracoes'"
v "legado do admin e permanente"        "proxy.ts" "NextResponse.redirect(url, 308)"
v "stripe reconcilia num lugar so"      "app/api/superadmin/sync-stripe/route.ts" "reconciliarAssinaturas("
v "cron usa a mesma reconciliacao"      "app/api/cron/[job]/route.ts" "reconciliarAssinaturas(supabase)"
v "previews do superadmin num lugar so" "app/api/superadmin/laboratorio/preview/route.ts" "entrarNaEmpresaDePreview(null)"
v "relatorio conta lucro so com custo"  "components/modules/relatorios/relatorios-view.tsx" "resultadoDasVendas("
# 21/10/2026 (etapa 0, 2.5): modulo desligado = vitrine (rewrite), nao redirect;
# a trava passa a somar o que o superadmin liga por empresa.
v "modulo desligado vira vitrine"       "proxy.ts" "NextResponse.rewrite(new URL(`/vitrine${modulo}`"
v "trava ve a liberacao por empresa"    "proxy.ts" "camadasDoMenu(menu?.itens).superadmin?.habilitados"
v "agenda sem capacidade mostra vitrine" "app/(dashboard)/agenda/page.tsx" "<VitrineDoModulo href=\"/agenda\" />"
v "executivo sem capacidade vitrine"    "app/(dashboard)/executivo/page.tsx" "<VitrineDoModulo href=\"/executivo\" />"
v "vitrine diz que numero e exemplo"    "components/modulos/vitrine.tsx" "Números de exemplo"
v "pedido so de dono ou admin"          "app/api/modulos/pedido/route.ts" "requireOwnerOrAdminApi()"
v "ativar so do superadmin"             "app/api/modulos/ativar/route.ts" "requireSuperAdminApi()"
# A rota descartava /dashboard do ocultar e a tela oferecia o botao: o dono
# salvava e nada acontecia.
n "sem protegido fantasma na rota"     "app/api/menu-config/route.ts" "PROTEGIDOS = ../dashboard"
echo "== menu sem separadores (20/08) =="
# O dono tirou os cabecalhos de grupo: o menu e uma lista corrida.
n "sidebar nao desenha grupo"          "components/layout/sidebar.tsx" "grupos.map((group)"
n "gaveta do celular tambem nao"       "components/layout/mobile-topbar.tsx" "grupos.map((g)"
n "folha Mais tambem nao"              "components/layout/bottom-nav.tsx" "grupos.map((g)"
v "sidebar usa a lista plana"          "components/layout/sidebar.tsx" "resolverMenuPlano({"
# Href salvo que nao existe mais e ignorado; item novo entra no fim, nao desaparece.
v "ordem plana tolera href sumido"     "lib/menu.ts" "if (!usados.has(item.href)) saida.push(item)"
echo "== proprietario e um cliente (21/08) =="
n "nao existe mais tela paralela"      "lib/menu.ts" "href: '/proprietarios'"
n "segmento nao declara a tela"        "lib/segmentos.ts" "href: '/proprietarios'"
v "rota antiga cai em clientes"        "proxy.ts" "'/proprietarios': '/clientes'"
v "imovel escolhe entre clientes"      "app/(dashboard)/imoveis/page.tsx" "from('clientes').select('id, nome, proprietario')"
v "papel aparece na lista"             "app/(dashboard)/clientes/components/clientes-view.tsx" "Proprietário</Badge>"
v "papel se marca na ficha"            "app/(dashboard)/clientes/components/cliente-modal-imob.tsx" "proprietario: form.proprietario"
v "filtro so proprietarios"            "app/(dashboard)/clientes/components/clientes-view.tsx" "soProprietarios"

echo "== chave e atributo do imovel (21/08) =="
n "nao existe mais tela de chaves"     "lib/menu.ts" "href: '/chaves'"
v "rota antiga cai em imoveis"         "proxy.ts" "'/chaves': '/imoveis'"
v "estado da chave tem fonte unica"    "lib/chave-imovel.ts" "export function estadoDaChave"
v "atraso conta so o dia passado"      "lib/chave-imovel.ts" "prevista < new Date(agora.getFullYear()"
v "pior noticia ganha no imovel"       "lib/chave-imovel.ts" "chaves.some(chaveAtrasada)"
v "lista de imoveis filtra por chave"  "app/(dashboard)/imoveis/imoveis-view.tsx" "estadoDaChave(chavesPorImovel.get(im.id)"
v "emprestimo mora na ficha"           "app/(dashboard)/imoveis/imoveis-view.tsx" "async function emprestarChave"
n "campo de texto de chave saiu"       "app/(dashboard)/imoveis/imoveis-view.tsx" "status_chaves"

echo "== contact2sale (21/08) =="
v "webhook e rota publica"            "proxy.ts" "startsWith('/api/webhook/')"
v "token deles entra cifrado"         "app/api/admin/c2s/route.ts" "cifrarToken(t)"
v "token deles nunca volta pra tela"  "app/admin/integracoes/page.tsx" "temToken: !!cfgC2S.token"
v "valida token antes de guardar"     "app/api/admin/c2s/route.ts" "const teste = await testarToken(t)"
v "repeticao nao duplica lead"        "app/api/webhook/c2s/[slug]/route.ts" ".eq('origem_id', lead.externoId)"
v "update nao apaga o que nao veio"   "app/api/webhook/c2s/[slug]/route.ts" "if (lead.produto) patch.produto_interessado"
v "log grava o payload cru"           "app/api/webhook/c2s/[slug]/route.ts" "payload: (dados.payload ?? null)"
v "teto de requisicao no webhook"     "app/api/webhook/c2s/[slug]/route.ts" "excedeuLimite(svc,"
v "avisa do um-endpoint-por-token"    "app/api/admin/c2s/route.ts" "um endereço por token"
v "vendedor casa por e-mail"          "app/api/webhook/c2s/[slug]/route.ts" "eq('email', lead.vendedorEmail)"
v "recusa assinar endereco local"    "app/api/admin/c2s/route.ts" "if (local) {"
v "guarda a url que foi assinada"    "app/api/admin/c2s/route.ts" "url_assinada: feitos.length ? url"
v "tela e rota usam a mesma conta"   "app/admin/integracoes/page.tsx" "basePublica(hostReq"
v "tela mostra divergencia de url"   "components/modules/integracoes/c2s-card.tsx" "estado.urlAssinada !== estado.urlWebhook"

echo "== filiais (24/08) =="
v "limite do plano conta a empresa"  "lib/limites.ts" "const svc = createServiceClient()"
v "uso do plano usa total da rede"   "app/admin/page.tsx" "const leadsDaRede = rede?.total"
v "consolidado le fora da RLS"       "lib/filiais-consulta.ts" "eq('empresa_id', empresaId)"
v "seletor some com uma loja so"     "components/layout/seletor-filial.tsx" "if (filiais.length < 2) return null"
v "vendedor nao troca de loja"       "components/layout/seletor-filial.tsx" "if (!podeTrocar) {"
v "troca de loja recarrega tudo"     "components/layout/seletor-filial.tsx" "window.location.reload()"
v "matriz nao se desativa"           "app/api/admin/filiais/route.ts" "if (alvo.matriz) {"
v "matriz unica troca em ordem"      "app/api/admin/filiais/route.ts" "eq('matriz', true)"
v "desativar solta quem estava nela" "app/api/admin/filiais/route.ts" "eq('filial_id', b.id)"
v "selecao valida a empresa"         "app/api/filial/selecionar/route.ts" "eq('empresa_id', empresaId).eq('ativo', true)"
v "loja da pessoa e validada"        "app/api/equipe/atualizar-usuario/route.ts" "Loja não encontrada nesta empresa"
v "campo de loja so no /admin"       "app/admin/equipe/page.tsx" "filiais={(filiais ?? "
v "CRM nao apaga a loja ao salvar"   "app/(dashboard)/equipe/components/equipe-view.tsx" "...(escolheLoja ?"
v "canal pode ser de uma loja"       "app/api/canais/[id]/route.ts" "filial_id: filialId ?? null"
v "canal valida a loja da empresa"   "app/api/canais/[id]/route.ts" "Loja nao encontrada nesta empresa."
v "tela explica canal da rede"       "components/modules/canais/canais-view.tsx" "Toda a rede"
v "campo de loja do canal so com 2"  "components/modules/canais/canais-view.tsx" "lojas.length >= 2"
v "retorno da meta preserva o code"   "app/admin/canais/page.tsx" "const q = query.toString()"
v "endereco limpo aponta pra tela"    "components/modules/canais/canais-view.tsx" "replaceState({}, '', '/admin/integracoes')"
v "canal novo nasce na loja atual"    "app/api/canais/meta/route.ts" "update({ filial_id: loja })"
v "reconexao nao mexe na loja"        "app/api/canais/meta/route.ts" "if (existia.has(l.tipo"
v "numero novo nasce na loja atual"   "app/api/canais/whatsapp/route.ts" "loja != null && !jaExistia"
v "escolha de pagina mostra o insta"  "components/modules/canais/canais-view.tsx" "sem Instagram vinculado"
v "rota manda o @ de cada pagina"     "app/api/canais/meta/route.ts" "instagram: p.instagram?.username"

echo "== instagram sem pagina (27/08) =="
v "app do instagram e outro par"      "lib/canais/instagram-login.ts" "INSTAGRAM_APP_ID"
v "escopo de mensagem do instagram"   "lib/canais/instagram-login.ts" "instagram_business_manage_messages"
v "token curto vira longo"            "lib/canais/instagram-login.ts" "ig_exchange_token"
v "perfil devolve os dois ids"        "lib/canais/instagram-login.ts" "contaProfissionalId"
v "grava o id da conta profissional"  "app/api/canais/instagram/retorno/route.ts" "const idDoWebhook = quem.contaProfissionalId"
v "busca tolerante aos dois ids"      "supabase/functions/webhook-leads/index.ts" "eq(\"ig_user_id\", String(externalId))"
v "envio do IG usa me/messages"       "supabase/functions/webhook-leads/index.ts" "/me/messages?access_token="
v "assinatura aceita os 2 segredos"   "supabase/functions/webhook-leads/index.ts" "assinaturaConfere(INSTAGRAM_APP_SECRET"
v "recusa sem nenhum dos 2 segredos"  "supabase/functions/webhook-leads/index.ts" "!APP_SECRET && !INSTAGRAM_APP_SECRET"
v "log diz QUAL segredo existe"       "supabase/functions/webhook-leads/index.ts" "segredoInstagram="
v "perfil do IG pelo host certo"      "supabase/functions/webhook-leads/index.ts" "graph.instagram.com\" : \"https://graph.facebook.com"
v "lead nasce na loja do canal"       "supabase/functions/webhook-leads/index.ts" "canal.filial_id != null ? { filial_id: canal.filial_id }"
v "assinatura leva o nome da loja"    "supabase/functions/webhook-leads/index.ts" "select(\"nome\").eq(\"id\", filialId)"
v "notificacao respeita a RLS"        "components/layout/topbar.tsx" "if (!podeVer) return"
v "toast so com lead visivel"        "components/layout/notification-provider.tsx" "if (!lead) return"
v "toast abre a conversa"            "components/layout/notification-provider.tsx" "/leads?lead="
v "busca abre a conversa"            "components/layout/command-palette.tsx" "/leads?lead="
v "leads le o lead da URL"           "components/modules/leads/leads-view.tsx" "params.get('lead')"
v "roleta sorteia so na loja"        "lib/roleta.ts" "m.filial_id === alvo"
v "ponteiro do rodizio por loja"     "lib/roleta.ts" "roleta_leads:"
v "regra nao vaza para outra loja"   "lib/distribuicao.ts" "declarados.filter(d => podem.includes(d))"
v "esteira leva a loja do lead"      "app/api/leads/distribuir/route.ts" "responsavel_id, filial_id"
v "transferencia so de dono/admin"    "app/api/estoque/transferir/route.ts" "requireEmpresaRoleApi"
v "transferida chega como pendente"   "app/api/estoque/transferir/route.ts" "status: 'pendente'"
v "so transfere o disponivel"         "app/api/estoque/transferir/route.ts" ".eq('status', TRANSFERIVEL)"
v "recebimento zera na transferencia" "app/api/estoque/transferir/route.ts" "recebido_em: null"
v "movimento nas duas lojas"          "app/api/estoque/transferir/route.ts" "transferencia_entrada"
v "nao lidas contadas no banco"      "app/(dashboard)/leads/page.tsx" "v_leads_nao_lidas"
v "sino conta no banco tambem"       "components/layout/topbar.tsx" "v_leads_nao_lidas"
n "borda nao soma nao lidas a mao"   "supabase/functions/webhook-leads/index.ts" "rpc(\"incrementar_msgs_nao_lidas\""
v "abrir conversa marca sem perguntar" "components/modules/leads/lead-modal.tsx" "count: 'exact'"
v "contrato descreve pagamento dividido" "lib/contrato-emitir.ts" "vendas_pagamentos"
v "pagamento dividido vira texto"        "lib/contrato-modelo.ts" "descreverPagamentos"
v "banco e campo de mesclagem"        "lib/contrato-modelo.ts" "loja.banco"
v "avisa se faltar banco no cadastro" "lib/contrato-emitir.ts" "Chave PIX"
v "minha empresa pede os dados"       "app/admin/empresa/empresa-config-view.tsx" "banco_pix"
v "online vem da tabela acessos"      "lib/presenca.ts" "is('saida', null)"
v "janela do online tolera 1 pulso"   "lib/presenca.ts" "JANELA_ONLINE_MIN = 10"
v "equipe mostra online"              "app/(dashboard)/equipe/components/equipe-view.tsx" "online.has(u.id)"
v "presenca por realtime"             "app/(dashboard)/equipe/components/equipe-view.tsx" "table: 'acessos'"
v "relogio local apaga quem sumiu"    "app/(dashboard)/equipe/components/equipe-view.tsx" "setAgora(Date.now())"
v "trava de avisos no build"          "package.json" "check:avisos"
v "teto de avisos existe"             "scripts/avisos-congelados.json" "set-state-in-effect"
v "valor do navegador sem efeito"     "lib/navegador.ts" "useSyncExternalStore"
v "ressincroniza ao reconectar"       "app/(dashboard)/equipe/components/equipe-view.tsx" "SUBSCRIBED"
v "renovador de token agendado"      "vercel.json" "renovar-tokens"
v "cron passa pelo middleware"       "proxy.ts" "/api/cron/"
v "cron ainda exige o segredo"       "app/api/cron/[job]/route.ts" "verificarCronSecret"
v "cron sabe renovar token"          "app/api/cron/[job]/route.ts" "renovarTokensInstagram"
v "renova antes de vencer"           "lib/canais/renovacao.ts" "DIAS_DE_ANTECEDENCIA"
v "token vencido vira expirado"      "lib/canais/renovacao.ts" "expirado"
v "integracoes tenta renovar tambem" "app/admin/integracoes/page.tsx" "renovarTokensInstagram"
v "avisa so perto de vencer"         "components/modules/canais/canais-view.tsx" "DIAS_PARA_ALARMAR"
n "instagram nao oferece mais 2 botoes" "components/modules/canais/canais-view.tsx" "Conectar sem Página"
v "reconectar segue o caminho do canal" "components/modules/canais/canais-view.tsx" "c.via === 'instagram' ? conectarInstagramSemPagina"
v "assina o webhook na conta"         "lib/canais/instagram-login.ts" "me/subscribed_apps"
v "state confere na volta"            "app/api/canais/instagram/retorno/route.ts" "state !== esperado"
v "recusa ambiente local"             "app/api/canais/instagram/iniciar/route.ts" "if (local) {"
v "conta de outro tenant e recusada"  "app/api/canais/instagram/retorno/route.ts" "existente.empresa_id !== empresaId"
v "retorno resolvido no servidor"     "app/api/canais/instagram/retorno/route.ts" "const curto = await trocarCodigo"
v "envio escolhe o host pelo via"     "supabase/functions/webhook-leads/index.ts" "graph.instagram.com/"
v "pagina do IG sem maybeSingle"      "supabase/functions/webhook-leads/index.ts" "order(\"conectado_em\", { ascending: false }).limit(1)"
v "messaging_type so no caminho FB"   "supabase/functions/webhook-leads/index.ts" "const corpoEnvio = viaInstagram"
v "retorno do IG vai pro login"       "proxy.ts" "/api/canais/instagram/retorno"

echo "== zapintel le o core (21/10) =="
# Desde o corte o ZapIntel lia as views leads/lead_mensagens, que calculam o principal
# linha a linha: insights 74 s, conversa_calc 200 s na copia (06, secao 10).
n "zapintel nao le as views do corte"   "supabase/migrations/20261022001000_zapintel_le_o_core.sql" "\(from\|join\) \(public\.\)\?\(leads\|lead_mensagens\) "
v "principal calculado uma vez"         "supabase/migrations/20261022001000_zapintel_le_o_core.sql" "select distinct on (n.contato_id, n.filial_id) n.id"
v "loja casada por igualdade (hash)"    "supabase/migrations/20261022001000_zapintel_le_o_core.sql" "coalesce(p.filial_id, -1) = coalesce(m.filial_id, -1)"
v "helpers fechados para a api"         "supabase/migrations/20261022001000_zapintel_le_o_core.sql" "  from public, anon, authenticated;"
v "seql calculado uma vez"              "supabase/migrations/20261022001000_zapintel_le_o_core.sql" "SEQL as materialized (select lead_id"
echo
echo "RESULTADO: $ok ok, $falha falha(s)"
