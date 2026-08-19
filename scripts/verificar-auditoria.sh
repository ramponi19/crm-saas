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
v "chaves usa o helper"               "app/(dashboard)/chaves/chaves-view.tsx" "paraData"

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

echo
echo "RESULTADO: $ok ok, $falha falha(s)"
