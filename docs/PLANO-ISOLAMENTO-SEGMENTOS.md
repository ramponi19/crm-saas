# Isolamento por segmento — plano de arquitetura

> Escrito em 15/08/2026, a pedido do dono, depois de uma auditoria completa do
> código e do banco. **Nada foi implementado**: este documento existe para a
> decisão ser tomada com número, não com intuição.

## Contexto: a pergunta que originou isto

O CRM é multi-tenant e será dividido por segmentos. Hoje o foco é **varejo** (JM
Store); **imobiliária** já começou, e vêm **veículos** e **clínicas**. A
preocupação do dono, nas palavras dele:

> "estamos usando um banco de dados para centralizar tudo, ou seja, tabela leads
> se mexe voltado para imóveis mexe em todos segmentos. Não é possível ter um
> banco separado para cada segmento? Copia essa tabela e renomeia como
> imobiliária, isolando cada movimentação."

O risco que ele sentiu é **real**. A causa que ele apontou **não é** — e essa
diferença muda completamente o que fazer.

## O que a auditoria encontrou

### O banco já está isolado (a premissa do "copia e renomeia" não se sustenta)

| tabela do núcleo | colunas de UM segmento só |
|---|---|
| `leads` (32 colunas) | **nenhuma** |
| `clientes` (26) | nenhuma |
| `lead_mensagens` (15) | nenhuma |
| `orcamentos` (28), `produtos` (17), `propostas` (10) | nenhuma |
| `inventario_unidades` (37) | `placa`, `chassi`, `renavam` |
| `tarefas` (12) | `imovel_id` |
| `vendas` (26) | `comanda` |

- **83 tabelas**, **73 com `empresa_id`** — o isolamento por empresa já funciona.
- Cada vertical já tem tabelas PRÓPRIAS: imobiliária tem 5 (`imoveis`,
  `proprietarios`, `chaves_imoveis`, `visitas`, `lead_perfil_busca`),
  concessionária 3, food 2.
- **Mexer em imóveis não toca em `leads`.** O isolamento existe, e do jeito certo:
  tabela nova por vertical, não cópia da mesma tabela.

### O risco real: 23 decisões por segmento no código do NÚCLEO

São os pontos onde um arquivo compartilhado sabe quem é a imobiliária. É aqui que
"mexer no imobiliário quebra o varejo" acontece.

| arquivo | decisões | o que decide |
|---|---|---|
| `components/modules/leads/lead-modal.tsx` | **5** | rótulo do campo de interesse; quais painéis de vertical aparecem |
| `components/modules/configuracoes/configuracoes-view.tsx` | **4** | quais abas a tela mostra |
| `app/(dashboard)/estoque/components/estoque-view.tsx` | 1 | `isVeiculo` |
| `app/(dashboard)/pdv/components/pdv-view.tsx` | 1 | `isFood` (comanda) |
| `app/(dashboard)/agenda/agenda-view.tsx` | 1 | `isSaude` |
| `app/(dashboard)/dashboard/page.tsx` | 1 | escolhe o dashboard da imobiliária |
| `app/(dashboard)/relatorios/page.tsx` | 1 | escolhe o relatório da imobiliária |
| `app/(dashboard)/orcamentos/orcamentos-view.tsx` | 1 | **bug**: ternário que devolve o mesmo valor nos dois lados |
| `app/admin/page.tsx` e `app/admin/integracoes/integracoes-view.tsx` | 2 | `isImob` |
| `components/modules/leads/lead-acoes-panel.tsx` | 1 | `isImob` |
| `components/modules/configuracoes/automacoes-card.tsx` | 1 | bloco de concessionária |
| `app/api/match/lead/[id]/route.ts` | 1 | match de veículo vs imóvel |
| `app/entrar/page.tsx` | 1 | saúde entra em `/agenda` |
| `app/api/orcamento/[token]/route.ts` e `app/orcamento/[token]/orcamento-view.tsx` | 2 | tipo de orçamento — **não é segmento**, é tipo de documento; ficam fora do escopo |

**Ressalva de método:** o primeiro levantamento acusou 42 arquivos. Refinado, caiu
para 16 — a maioria era a palavra "assistência" (o MÓDULO de reparo), não o
segmento. O número que vale é **23 decisões em 16 arquivos**, e 2 dessas nem são
sobre segmento.

### Evidência de que o risco não é teórico

Na semana de 13/08 duas frentes trabalharam em paralelo (varejo e imobiliária) e
colidiram em `lead-modal.tsx`, `cliente-modal.tsx`, `equipe-view.tsx` e
`lib/empresa-context.tsx`. Uma alteração de varejo foi commitada dentro de um
commit da imobiliária; se o merge tivesse sido resolvido às pressas, o modal de
perda abriria vazio em produção **sem erro nenhum na tela**.

## Decisão recomendada: isolar por CÓDIGO, não por banco

### Por que NÃO separar o banco

1. **Custo × 7.** Sete projetos Supabase, sete faturas, sete backups, sete
   conjuntos de chaves.
2. **Cada correção feita sete vezes.** O bug do áudio do WhatsApp exigiria sete
   migrações. Na terceira alguém esquece uma, os bancos divergem, e o MESMO código
   passa a rodar contra estruturas diferentes — origem do bug que não se reproduz.
3. **Uma empresa não é de um segmento só.** A JM vende celular E faz assistência.
   Cliente e histórico ficariam partidos em dois bancos, sem ver a mesma pessoa.
4. **Perde a visão de plataforma.** `/superadmin` mostra todas as empresas,
   faturamento e uso do assistente; viraria consolidação de sete origens.
5. **Copiar tabela é a pior duplicação.** `leads` e `leads_imobiliaria` começam
   iguais e divergem devagar. Em seis meses uma tem coluna que a outra não tem, e
   ninguém lembra por quê.

> **Se um dia a separação física for exigida** (cliente grande querendo ambiente
> próprio), o caminho é **um banco por CLIENTE**, não por segmento — e o desenho
> atual (`empresa_id` em tudo) já é o que permite essa migração.

### Três camadas

1. **Núcleo genérico** — `leads`, `clientes`, mensagens, usuários, PDV, estoque.
   **Nunca cita segmento pelo nome.**
2. **Módulos de vertical** — tabelas e telas próprias (como `imoveis` já é).
   Mexer neles não abre arquivo do núcleo.
3. **Contrato entre os dois** — `lib/segmentos.ts` (já existe, 132 linhas). O
   núcleo *pergunta* ao contrato; não testa quem é o segmento.

## Execução, em ordem de dor

### Fase 0 — a trava (fazer PRIMEIRO, ~2 h)

Sem isto a lista volta a crescer enquanto o resto é discutido — há três verticais
no forno.

- Criar `scripts/check-nucleo.mjs`: falha quando um arquivo de núcleo **compara o
  segmento** com um nome — o padrão `segmento === '…'` e variantes
  (`normalizarSegmento(...) === '…'`, `segmento !== '…'`).

  **A regra NÃO pode procurar o nome do segmento solto.** Medido no código:
  `'assistencia'` aparece **14 vezes fora de qualquer contexto de segmento** — é
  status de estoque ("Em reparo") e tipo de orçamento. Uma regra ingênua daria 14
  falsos positivos no primeiro dia, e regra que grita errado é regra que a equipe
  desliga. O padrão seguro tem 21 ocorrências no projeto inteiro.
- Lista de exceções **explícita** com os 16 arquivos atuais, cada um com o motivo
  em comentário. A lista só pode diminuir: nada novo entra sem tirar outro.
- Entra no `npm run check` (o projeto ainda não tem esse script em `main`) e no
  build.

**Por que exceção explícita e não "corrigir tudo agora":** parar as entregas do
varejo para refatorar 16 arquivos é pior que a dívida. A trava impede piorar; as
fases seguintes reduzem.

### Fase 1 — `lead-modal.tsx` + `configuracoes-view.tsx` (9 das 23, ~1 dia)

Os dois arquivos mais disputados entre frentes.

**`lead-modal.tsx`** hoje decide painel por painel:

    {segmento === 'imobiliaria' && <LeadMatchPanel …/>}
    {segmento === 'concessionaria' && <LeadInteressePanel …/>}
    {segmento === 'concessionaria' && <LeadFinanciamentoPanel …/>}

Depois: o contrato ganha `paineisDoLead: string[]` e o modal renderiza por
registro (um mapa `nome → componente`). Acrescentar vertical deixa de exigir
editar o modal — que é exatamente o arquivo onde as duas frentes colidiram.

Os painéis já existem isolados em `components/modules/leads/` (`lead-match-panel`,
`lead-interesse-panel`, `lead-financiamento-panel`), então é ligação, não reescrita.

**`configuracoes-view.tsx`**: a cascata de 4 `if` vira `abasPorSegmento` no
contrato.

Também acrescentar `interesseLabel` ao contrato, eliminando as linhas 1017-1018
(rótulo "Veículo interessado" / "Imóvel interessado"). Esse campo existia na branch
apagada e vale reescrever.

### Fase 2 — resto do núcleo (14 decisões, ~1 dia)

`isVeiculo`, `isFood`, `isSaude` e `isImob` viram **capacidades** no contrato:
`usaPlaca`, `usaComanda`, `agendaPrimeiro`, `dashboardProprio`. O nome do segmento
sai do núcleo; fica a pergunta sobre o que ele *faz*.

Corrigir no caminho o ternário inútil de `orcamentos-view.tsx:31`.

### Fase 3 — as 5 colunas de vertical no banco (~meio dia, baixa urgência)

`placa`, `chassi` e `renavam` saem de `inventario_unidades` para uma tabela
`veiculo_dados` (1:1); `tarefas.imovel_id` idem. Dívida pequena hoje, que cresce a
cada vertical.

**Requer migração de dados** — só depois das fases 1 e 2, e com backup.

## Como verificar

- `npm run check` falha ao introduzir citação nova no núcleo. Teste real:
  acrescentar `segmento === 'imobiliaria'` em `pdv-view.tsx` de propósito e ver o
  build quebrar.
- `npx tsc --noEmit` e `npm run build` limpos.
- No navegador, **como JM Store (varejo)**: kanban, PDV, estoque, configurações e
  modal do lead **sem mudança visível** — refatoração não muda comportamento.
- **Como imobiliária** (empresa 3): imóveis, proprietários, chaves e o dashboard
  próprio continuam funcionando.
- Sentry sem erro novo em 24 h.

## O que NÃO fazer

- Não separar banco por segmento.
- Não copiar `leads` para `leads_imobiliaria`.
- Não refatorar tudo de uma vez com a JM em produção: fase por fase, com deploy e
  validação entre elas.
