# Auditoria completa — 18/08/2026

Varredura dos módulos que nunca tinham passado por revisão (garantia/assistência,
orçamentos, financeiro, compras, relatórios) e do que sustenta os três: a rota
pública de aprovação, as rotas de escrita da API e os webhooks de pagamento.

Método: medir antes de mexer. Cada achado abaixo foi confirmado no banco de
produção ou lendo o caminho do código de ponta a ponta — nenhum é suspeita.

---

## 1. Orçamentos — 31 de 31 eram fantasma

`/api/leads/mover` criava um orçamento a cada vez que um lead entrava numa etapa
do tipo `negociacao`: `status='rascunho'`, `total=0`, zero itens, sem
`usuario_id`. Ninguém pediu, ninguém preencheu, e a lista de orçamentos da loja
tinha 31 registros que só faziam ruído.

**Feito:** bloco removido — o caminho explícito (o painel de orçamento dentro do
chat do lead) já existia. As 31 linhas foram copiadas para
`backup.orcamentos_fantasma_20260818` e apagadas (`guardados: 31, restantes: 0`).

## 2. Aprovação por link — a venda nascia sem custo, sem peça e sem cliente

O achado mais grave. Em `app/api/orcamento/[token]/route.ts`, quando o cliente
aprovava um orçamento do tipo `venda`, o CRM marcava a unidade como `vendido` e
inseria a venda **sem** `unidade_id`, `valor_custo`, `produto_id`,
`numero_serie` nem `cliente_id`. Consequências, todas verificadas no schema:

- `vendas.valor_custo` tem default `0` e `lucro` é coluna **gerada**
  (`valor_venda - valor_custo`). Custo ausente ⇒ **100% de margem** relatada num
  aparelho que foi comprado com dinheiro.
- `vendas.status` tem default `'concluida'` ⇒ a venda entra direto no
  faturamento.
- O aparelho ficava `vendido` no estoque sem nada apontando para qual venda o
  levou.
- Sem cliente, a venda não aparece na ficha de ninguém: não serve para contrato
  nem para consulta de garantia.

Além disso, não havia claim: se o balcão vendesse a mesma peça antes do clique do
cliente, saíam **duas** vendas para um aparelho.

**Feito:** a unidade é lida antes (custo, produto, IMEI), a baixa virou claim
atômico (`.in('status', ['disponivel','reservado'])`) e a venda passa a gravar
peça, custo, série, vendedor e cliente. Quando a peça já não está disponível, a
venda **não** é criada e o motivo é escrito no próprio orçamento — silêncio ali
viraria "o sistema perdeu minha venda". A OS aberta por link e a venda de
downgrade também passaram a gravar `cliente_id`.

**Migração:** `orcamentos_guarda_cliente_id` — o orçamento guardava só
`cliente_nome`/`cliente_telefone`; o vínculo com o cadastro morria na criação.
Texto não é chave. A cadeia foi ligada: busca → editor → API (que **confere** se
o cliente é da empresa) → venda. Digitar por cima do nome solta o vínculo.

## 3. Garantia/assistência — dias restantes eram digitados

`dias_garantia_restantes` era campo livre. O balcão tinha de lembrar a data da
venda e fazer a conta.

**Feito:** ao digitar o IMEI na OS, o CRM procura a venda concluída daquele
número de série, lê `garantia_dias` da configuração da loja (90 por padrão),
calcula o que resta e pré-preenche **só o que ainda não foi tocado**. Mostra
embaixo do campo: "Vendido em X · garantia de N dias · N dia(s) restantes" — ou
que não existe venda desta loja com aquele IMEI.

## 4. Financeiro — dois números verdadeiros que se contradiziam

Nenhuma venda gera `lancamentos_financeiros`. A loja que lança o aluguel e não
lança as vendas vê "Resultado líquido" negativo enquanto o Dashboard mostra
faturamento no mesmo dia.

**Feito:** a tela agora diz o que ela não conta — faixa de aviso com o
faturamento das vendas do mês ao lado. Gerar receita automaticamente é decisão de
produto (risco de duplicar com o lançamento manual) e fica com o dono.

## 5. Relatórios — "Lucro total" = faturamento

Medido: `vendas_concluidas: 1, sem_custo: 1, pct_sem_custo: 100`. O KPI mostrava
margem cheia porque o custo é zero em todas — e a tela não recebia `valor_custo`,
então não tinha como distinguir venda sem margem de custo não lançado.

**Feito:** `valor_custo` chega na tela e o card de "Lucro total" carrega o aviso
"N de M sem custo lançado". Número que parece calculado é pior que número
ausente, porque ninguém desconfia dele.

## 6. Compras/encomenda — código certo, custo zero

O fluxo está correto (cria a compra, cria a venda pendente, desfaz a compra se a
venda falhar). Os dois registros existentes eram testes com `valor_total 0.00`.

**Feito:** aviso não bloqueante no modal quando o custo é zero — custo zero
produz 100% de lucro na hora de fechar o mês.

## 7. Webhooks de pagamento — "pago" sem assinatura era aceito

Os quatro adapters (Asaas, Efí, Mercado Pago, PagSeguro) verificavam a assinatura
**quando o segredo estava configurado** e, quando não estava, seguiam com um
`console.warn`. Quem soubesse um `provider_ref` podia POSTar "confirmado" e
marcar uma cobrança como paga — com lançamento de receita no Financeiro.

Pior: o formulário de meios de pagamento **não tinha campo** para o segredo do
webhook, então nenhum tenant teria como configurá-lo.

**Feito:** sem assinatura o webhook é recusado, e os campos
`webhook_secret`/`webhook_token` entraram no formulário com a dica de que sem
eles o pagamento não confirma sozinho. Pagamento não confirmado se resolve
conferindo no painel; pagamento confirmado por engano é prejuízo com o cliente já
a caminho da porta. Custo zero para fazer agora: `tenant_payment_config`,
`cobrancas` e `payment_webhook_eventos` estão todos vazios.

## 8. Duas rotas de escrita sem tranca de papel

Varredura de todas as rotas com POST/PUT/PATCH/DELETE. Duas dependiam só da
sessão, e a RLS dessas tabelas libera o tenant inteiro:

- **`/api/payments/config`** — grava a credencial de **recebimento** da loja. Um
  vendedor podia apontar a conta para a chave Pix dele. Agora exige owner/admin
  (GET e POST).
- **`/api/funis`** — criar, renomear, excluir funil e marcar outro como `padrao`,
  o que muda onde **todo lead novo da loja** cai. `/api/funil` (as etapas) já
  exigia owner/admin; aqui faltava. Agora exige.

As duas telas já eram de admin — a tela nunca é a tranca.

---

## Conferido e sem defeito

- Integridade dos dados: venda ↔ unidade ↔ empresa, unidade vendida sem venda,
  venda apontando para unidade inexistente, venda sem cliente, orçamento sem
  token — **zero** divergências.
- As cinco funções `SECURITY DEFINER` expostas ao `authenticated`
  (`set_super_admin`, `set_impersonation`, `hard_delete_empresa`,
  `get_empresa_id`, `is_empresa_admin`) checam `is_super_admin` por dentro e não
  têm mais `EXECUTE` para PUBLIC — o conserto da regressão de 14/08 continua de
  pé.
- As três tabelas com "RLS sem policy" (`assistente_config`, `assistente_uso`,
  `historico_bruto`) são acessadas **só** por service role: nega-tudo é o
  comportamento pretendido.
- Todas as páginas `/superadmin` são trancadas pelo layout; as demais rotas
  administrativas checam papel.

## Pendente com o dono (não é código)

- Preencher CNPJ e telefone em Administração → Minha empresa: o contrato sai com
  `SUA EMPRESA LTDA` / CNPJ `11.111.111/1111-11`, e **dois contratos já foram
  emitidos assim**.
- Lançar o custo das vendas — enquanto for zero, todo lucro é o faturamento.
- Tabela de preços vazia; metas de comissão zeradas; três clientes sem
  CPF/endereço.
- Validar "registrar ligação" com a conta do Luis Felipe (corrigido, nunca
  conferido em produção).
- Termo de garantia e termo de entrega do usado: documentos da loja.

## Adiado de propósito

- Gerar lançamento financeiro a partir da venda (risco de duplicar com o
  lançamento manual — decisão de produto).
- Derrubar as 5 colunas legadas de veículo em `inventario_unidades`, só quando a
  leitura migrar e uma concessionária real validar.
