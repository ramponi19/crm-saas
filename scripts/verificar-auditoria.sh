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
v "encomenda avisa custo zero"           "components/modules/pdv/encomenda-modal.tsx" "Encomenda sem custo de compra"
v "encomenda exige preco de venda"       "components/modules/pdv/encomenda-modal.tsx" "Informe quanto o cliente vai pagar"

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
v "encomenda copia a serie"           "components/modules/historico/historico-view.tsx" "serieDaUnidade"
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
v "executivo trava por capacidade"    "app/(dashboard)/executivo/page.tsx" "cfgSeg.capacidades.comissaoPorNegocio) redirect"
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
v "meu menu ve a config do segmento"   "app/admin/meu-menu/page.tsx" "segmentos_config"
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
v "rota antiga cai em clientes"        "middleware.ts" "'/proprietarios': '/clientes'"
v "imovel escolhe entre clientes"      "app/(dashboard)/imoveis/page.tsx" "from('clientes').select('id, nome, proprietario')"
v "papel aparece na lista"             "app/(dashboard)/clientes/components/clientes-view.tsx" "Proprietário</Badge>"
v "papel se marca na ficha"            "app/(dashboard)/clientes/components/cliente-modal-imob.tsx" "proprietario: form.proprietario"
v "filtro so proprietarios"            "app/(dashboard)/clientes/components/clientes-view.tsx" "soProprietarios"

echo "== chave e atributo do imovel (21/08) =="
n "nao existe mais tela de chaves"     "lib/menu.ts" "href: '/chaves'"
v "rota antiga cai em imoveis"         "middleware.ts" "'/chaves': '/imoveis'"
v "estado da chave tem fonte unica"    "lib/chave-imovel.ts" "export function estadoDaChave"
v "atraso conta so o dia passado"      "lib/chave-imovel.ts" "prevista < new Date(agora.getFullYear()"
v "pior noticia ganha no imovel"       "lib/chave-imovel.ts" "chaves.some(chaveAtrasada)"
v "lista de imoveis filtra por chave"  "app/(dashboard)/imoveis/imoveis-view.tsx" "estadoDaChave(chavesPorImovel.get(im.id)"
v "emprestimo mora na ficha"           "app/(dashboard)/imoveis/imoveis-view.tsx" "async function emprestarChave"
n "campo de texto de chave saiu"       "app/(dashboard)/imoveis/imoveis-view.tsx" "status_chaves"

echo "== contact2sale (21/08) =="
v "webhook e rota publica"            "middleware.ts" "startsWith('/api/webhook/')"
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

echo
echo "RESULTADO: $ok ok, $falha falha(s)"
