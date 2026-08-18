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

- **Contrato — ver o achado 13 na terceira passada.** Preencher CNPJ e telefone NÃO
  era suficiente: o modelo não usava marcador nenhum da loja. Agora usa. O que falta
  é preencher os dados da JM em Administração → Minha empresa (inclusive endereço e
  quem assina) e digitar, uma vez, a qualificação pessoal de quem assina no modelo.
  Três contratos já saíram sem identificar a vendedora.
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

---

# Segunda passada — as rotas ABERTAS (mesmo dia)

Depois do achado da aprovação por link, fui atrás das irmãs dela: toda rota que
escreve **sem login**. São sete (`/api/register`, `/api/agendar/[slug]`,
`/api/menu/[slug]/pedido`, `/api/os/[token]`, `/api/orcamento/[token]`,
`/api/portais/[slug]/leads`, `/api/imob/[slug]/lead`) mais o feed
`/api/veiculos/[slug]`. Cinco achados.

## 9. Cadastro público sem teto — o pior da segunda passada

`/api/register` cria o usuário com `email_confirm: true` **e** a empresa, e o
docblock dele diz, textualmente, que passa por fora do rate limit do `signUp` do
Supabase de propósito (para não depender de e-mail). Sem captcha e sem teto
próprio: um script criava tenants confirmados sem parar — empresa, funil, etapas e
motivos de perda a cada chamada.

**Feito:** migração `rate_limit_para_rotas_publicas` (tabela + função
`rate_limit_bump`, `EXECUTE` só para `service_role`) e `lib/rate-limit.ts`. O IP
**não** é guardado: a chave é um HMAC-SHA256 do IP com segredo do servidor —
serve para contar, não para identificar. Tetos por hora e por origem: 5 no
cadastro, 20 no agendamento, 30 no pedido. Se o contador falhar, a chamada passa —
um problema no banco não pode derrubar o cadastro. Conferido no banco: a 6ª
chamada com teto 5 é bloqueada, as 5 primeiras passam.

## 10. Feed público de veículos vazava nome de cliente

`/api/veiculos/[slug]` é aberto e exportava `inventario_unidades.observacoes` —
que é a nota **interna** da peça. E é exatamente ali que o CRM escreve
"aparelho recebido em troca no PDV (cliente Maria)" e "Entrada por downgrade —
orçamento #12, cliente João". Qualquer pessoa com a URL lia isso.

Além do vazamento, o feed servia o estoque **inteiro com preços** de qualquer
empresa, bastando saber o slug — que é público (aparece na landing, no cardápio,
no link de agendamento). Inclusive de uma loja de celular, que não tem portal de
veículo nenhum.

**Feito:** `observacoes` saiu do feed e o feed passou a exigir a capacidade
`usaPlaca` do contrato de segmento — quem não trabalha com veículo devolve o mesmo
404 de slug inexistente (não confirma que a empresa existe). Descrição de anúncio,
se for necessária, precisa de campo próprio, escrito para ser lido de fora.

## 11. Aprovação da OS criava tarefa dupla

`/api/os/[token]` conferia `aprovado_em`/`recusado_em` e **depois** dava o UPDATE.
Dois cliques do cliente — ou o retry de um POST — passavam pelos dois e criavam
duas tarefas de reparo para a mesma OS.

**Feito:** a condição foi para dentro do UPDATE (mesmo claim atômico do achado 2).

## 12. Agendamento e pedido aceitavam qualquer loja

Nenhuma das duas rotas conferia se a empresa **usa** aquele canal. Um POST no slug
de uma loja de celular criava lead + "consulta" nela: o lead entrava na roleta,
consumia o limite do plano e a consulta ia para uma tela que não existe naquele
segmento. As páginas públicas tinham o mesmo furo — o visitante preenchia o
formulário e só tomava o erro no fim.

**Feito:** rota e página agora exigem a capacidade do contrato
(`agendaClinica`/`agendaVisitas` para agendar, `usaComanda` para o cardápio).
Nenhum nome de segmento entrou no código — a trava do núcleo segue em zero.

## Conferido nesta passada e sem defeito

- Tokens de link público (`orcamentos`, `garantias_assistencias`, `propostas`) são
  UUID v4 em hex, 32 caracteres — sem risco de enumeração.
- `/api/portais/[slug]/leads` valida token por empresa antes de qualquer escrita.
- `/api/menu/[slug]/pedido` recalcula todos os preços pelo banco: preço que vem do
  cliente é ignorado.
- Os webhooks Stripe e de pagamento verificam assinatura (o segundo passou a
  recusar quando não há segredo — achado 7).

## Aplicado depois, com autorização — e uma correção do que eu disse

- **`/api/imob/[slug]/lead`** recebeu o mesmo teto (20/hora por origem), a pedido
  do dono em 18/08.

  **Correção do que registrei antes:** eu descrevi esta rota como "aberta", e ela
  não é — valida o token do portal (`getPortalToken`) antes de escrever. O teto
  continua valendo, por outro motivo: o token viaja na URL de um formulário que roda
  no NAVEGADOR do visitante (o site da imobiliária é outro domínio), então quem abre
  o código-fonte da página lê o token. O limite ficou ANTES da checagem do token,
  para também limitar quem tenta adivinhá-lo.

---

# Terceira passada — teste NA TELA, em produção (mesmo dia)

Conta do dono, navegador real, dado de teste marcado ("TESTE AUDITORIA") e
apagado no fim com cópia em `backup.teste_auditoria_20260818_*`. O banco voltou ao
estado anterior: 2 vendas reais, 3 clientes, contratos 10 e 11, pedidos 2 e 3,
estoque zerado.

## O que passou

- **Registrar chamada** (o bug do Luis Felipe, corrigido dias antes e nunca
  conferido): gravou empresa, autor, direção, resultado e observação. Sem
  "Empresa não carregada".
- **Aprovação por link** (achado 2): a venda nasceu com `valor_custo` 1000,
  `lucro` 500 — não os 1500 de margem fantasma —, com peça, IMEI, produto e
  cliente, e a unidade foi para `vendido`. A cadeia `cliente_id` passou ponta a
  ponta: busca com badge CLIENTE → editor → API → orçamento → venda.
- **PDV com troca**: venda registrada por R$ 1.200 com custo 800 e lucro 400 — a
  troca entrou como pagamento, não como desconto, então não virou prejuízo. O
  aparelho recebido entrou como unidade `pendente`, `usado`/`troca`, custo 400, no
  nome do vendedor.
- **Encomenda**: pedido de compra criado, recebimento gerou unidade `reservado`
  ligada à venda, conclusão baixou o estoque.
- **Garantia pelo IMEI** (achado 3, depois do conserto): "Vendido em 18/08/2026 ·
  garantia de 90 dias · **90 dia(s) restantes**", e a Origem da OS já veio como
  Garantia.
- **Emissão do contrato**: emitiu, arquivou e avisou — "Contrato saiu com campos
  em branco: falta CPF/CNPJ, Estado civil, Profissão, CEP, Endereço…".

## 13. O contrato não usava marcador nenhum da loja

O mais importante da passada, e corrige o que eu havia dito antes. O modelo ativo
da JM identificava a vendedora como **texto fixo**: "SUA EMPRESA LTDA, inscrita no
CNPJ sob o nº 11.111.111/1111-11, com sede na Rua xxx…". Preencher CNPJ e telefone
em Minha empresa **não mudaria nada**, porque o modelo não perguntava isso ao
sistema. Medido no contrato emitido: continha "SUA EMPRESA LTDA", continha
"11.111.111", e **não** continha "JM Store".

E faltavam campos: `empresas` só tinha `cnpj` e `telefone`; o bloco pede e-mail,
endereço completo e quem assina.

**Feito:** migração `empresa_dados_para_o_contrato` (email, cep, endereco, numero,
complemento, bairro, cidade, estado, representante_nome, representante_cpf), os
marcadores correspondentes no catálogo, os campos na tela Minha empresa, e o bloco
da VENDEDORA do modelo trocado por marcadores — backup em
`backup.contrato_modelos_20260818`. **Nenhuma cláusula foi tocada.** Conferido: 12
marcadores da loja, os 11 do cliente preservados, e o endereço **do representante**
intacto (era texto idêntico ao da loja — um replace global trocaria o endereço de
uma pessoa pelo da empresa).

A emissão passou a avisar o que falta na LOJA, não só no cliente — e só do que
aquele modelo usa. Continua texto fixo, de propósito, a qualificação pessoal de
quem assina (nacionalidade, estado civil, profissão, endereço residencial): é dado
de uma pessoa, estável, que o lojista digita uma vez no modelo. Criar oito colunas
no cadastro da empresa para o estado civil do dono seria pior.

## 14. Encomenda aceitava venda de R$ 0,00

O modal exigia cliente e produto, mas não o preço de venda. O teste lançou uma
encomenda com o campo vazio e ela entrou como venda de **R$ 0,00**: o cliente "não
paga nada", o faturamento soma zero e o pedido de compra fica com o custo sozinho
— prejuízo puro no relatório. Agora bloqueia. Diferente do custo (que é só aviso,
porque às vezes só chega com a nota do fornecedor): o preço cobrado é o que a loja
ACABOU de combinar com o cliente.

## 15. Data de coluna `date` voltava um dia

Um pedido criado às 17:41 de 18/08 aparecia na lista de Compras como **17/08**.
Causa: `pedidos_compra.data_pedido` é coluna `date`, e `new Date('2026-08-18')` em
JavaScript é meia-noite **UTC** — no fuso de Brasília volta para 17/08 21:00.

**Feito:** `lib/datas.ts` monta data pura no fuso local e distingue de
`timestamptz` (que não tem o problema — somar horas na mão quebraria o caso que já
funciona). Aplicado em Compras, o caso medido. As seis tabelas com coluna `date`
foram levantadas; o Financeiro já tinha a gambiarra `+ 'T00:00:00'` no lugar certo,
e `chaves_imoveis.devolucao_prevista` fica reportado — é tela da imobiliária.

## Achados 16-20 (os outros da passada)

- **"Converter em cliente"** criava cliente sem CPF nem endereço e respondia
  "convertido em cliente!". Era a origem dos clientes incompletos da JM — os dois
  sem CPF vieram desse caminho, não do cadastro manual. Agora diz o que falta e
  onde completar, sem bloquear.
- **Página pública do orçamento de VENDA** não mostrava o que estava sendo
  vendido: só nome e total. Aprovar cria a venda e baixa a peça do estoque.
- **Venda por link sem lead ficava sem vendedor** — o código só olhava o lead, e
  orçamento criado pela tela de Orçamentos não tem lead. Ranking e comissão saem
  de `vendedor_id`: a venda de R$ 1.500 não era de ninguém.
- **`vendas.unidade_id` só era gravado na entrega pendente**: venda de balcão
  deixava a peça `vendido` sem nada apontando para a venda.
- **O modal de sucesso do PDV** dizia "Total da venda R$ 800,00" numa venda de
  1.200 com 400 em aparelho, contradizendo o próprio carrinho.
- **Entrada de estoque não gravava quem deu entrada**, e a lista tem coluna de
  responsável que por isso nunca preenchia.

## Duas coisas que eu reportei errado e corrigi

- `origem` gravar `'manual'` não é bug: é o valor por trás do rótulo "Loja física"
  em `new-lead-modal.tsx`.
- A observação que "não salvou" no cadastro de lead foi falha da automação do
  teste (`fill` não dispara o `onChange` do React em textarea). Digitada de
  verdade, salva.
