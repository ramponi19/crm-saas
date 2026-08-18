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

echo
echo "RESULTADO: $ok ok, $falha falha(s)"
