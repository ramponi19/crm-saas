# Várias lojas por usuário + distribuição por loja: mapa e desenho (26/11/2026, sem código)

Pedido do Lucas (26/11). Antes de codar: como funciona hoje, onde cada coisa fica no menu e o desenho proposto. A
implementação espera o ok do desenho. Dividido em **5a (lojas que enxerga)** e **5b (configuração da distribuição por loja)**.

## 1. Como funciona hoje

**A loja do vínculo é UM valor:** `empresa_usuarios.filial_id` (ou nulo = "fica na loja principal"). As marcas de
distribuição são **da pessoa, para a empresa inteira** (`participa_roleta`, `conta_servico`, `atende_clientes`,
`ausente`); a loja entra só pelo `filial_id`.

| Onde a loja da pessoa pesa | Regra hoje | Arquivo |
|---|---|---|
| **Visibilidade (RLS)** | `filiais_visiveis()`: com 1 loja, tudo; dono, admin, superadmin ou `lojas.ver_rede`, a loja do topo ou todas; os demais, **só** `coalesce(filial_id, matriz)` (não veem registros sem loja). ~40 tabelas usam `filiais_visiveis() @> array[coalesce(filial_id,0)]` | migração 0700 (1.1b) |
| **Seletor de loja do topo** | só aparece com 2+ lojas; sem `lojas.ver_rede` é só um rótulo com a loja da pessoa; com a permissão, "Rede (todas)" + lojas, grava `usuarios.filial_atual_id` (`/api/filial/selecionar`, sem auditoria) | `components/layout/seletor-filial.tsx` |
| **Loja de gravação** | `filial_gravacao()`: loja do topo → `filial_id` da pessoa → matriz → qualquer ativa (PDV, vendas, metas, comissões nascem assim) | core_v1 |
| **Roleta de leads** | elegíveis: ativo, presente, não conta de serviço, `participa_roleta`, qualquer cargo; com 2+ lojas, `filial_id` = loja do lead (nulo = matriz). Ponteiro `roleta_leads:<loja>` | `lib/roleta.ts`, `core_roleta_leads_proximo` |
| **Regras de distribuição** | `distribuicao_regras` (por origem/canal), da empresa, sem loja; cruza com os elegíveis da loja | `lib/distribuicao.ts` |
| **Liberação diária** | por loja ativa, quem recebe = os elegíveis da roleta da loja (`core_roleta_elegiveis`) | `core_liberar_lote_esteira` |
| **Pós-venda** | vendedor do negócio → responsável padrão **da loja** (config) → roleta da loja (só cargo vendedor + `participa_roleta`) → **administradores da empresa** (sem loja; admins presentes, senão os ausentes, senão os donos). **P1 pendente:** reserva por loja pulando ausentes | `posvenda_resolver_responsavel` |
| **Comissão** | **não há** associação pessoa → loja: metas, vendas e comissões têm a loja de quem gravou; as telas listam por pessoa | `equipe-view.tsx` (Metas/Comissões) |
| **ZapIntel** | reconhece todos com `atende_clientes`, sem loja; o rótulo "loja" da pessoa é o `filial_id` | `zapintel_conversa_calc` |
| **Relatórios e painel** | pela RLS (loja do topo ou loja da pessoa) | `relatorios`, `lib/painel` |

**Achado de segurança (a corrigir na 5a):** a pessoa pode gravar o próprio `usuarios.filial_atual_id` (política
`usuarios_update`; `prevent_privilege_escalation` não protege essa coluna) e a loja de gravação usa a loja do topo antes
da loja da pessoa, sem conferir `lojas.ver_rede`. Um vendedor poderia gravar em outra loja nas tabelas cujo INSERT confere
só a empresa.

**Auditoria hoje:** troca de loja, papel e as três marcas da pessoa **não** vão para a Auditoria (só quando é o superadmin
impersonando, e só os nomes dos campos).

### Onde fica cada tela hoje

| Tela | Caminho no menu |
|---|---|
| Loja da pessoa ("Loja onde trabalha", campo único) e o bloco **"Distribuição e atendimento"** (Recebe leads pela roleta; Conta de serviço; Atende clientes) | Configurações › Área de trabalho › Usuários › editar a pessoa |
| Regras de distribuição (por origem) + Esteira "N sem dono / Distribuir agora" | menu principal › Automações › Distribuição (`/distribuicao`) |
| Roleta por loja | **não tem tela** (sai das marcas da pessoa) |
| Liberação diária | **não tem tela** de configuração; só o botão "Liberar lote do dia" em Leads › Esteira |
| "Sem dono" (esteira ou roleta) | **não tem tela** |
| Devolução em 30 min | Configurações › Vendas e atendimento › SLA de atendimento |
| Responsável padrão do pós-venda por loja | Configurações › Vendas e atendimento › Pós-venda › Parâmetros |

## 2. Desenho proposto

### 5a. "Lojas que enxerga" (tela de Usuários)

- **Dado:** tabela nova `empresa_usuario_lojas (empresa_id, usuario_id, filial_id)` — uma linha por loja que a pessoa
  enxerga. Tabela nova em vez de coluna em `empresa_usuarios` (sem DDL na tabela quente; lição de 25/11).
  `empresa_usuarios.filial_id` continua como **loja principal** (loja de gravação e rótulo), até a 5b.
- **Regra:** `filiais_visiveis()` para quem não tem a rede = as lojas da lista (vazia, no período de transição: a regra
  de hoje). Quem tem `lojas.ver_rede` (dono, admin, ou cargo com a permissão) continua vendo todas sem marcar.
- **Seletor de loja:** quem enxerga 2+ lojas escolhe entre elas (e "Todas as minhas lojas"); a rota aceita só loja da
  lista (ou qualquer, com a rede). Corrige o achado: `filial_atual_id` só aceita loja visível (gatilho na `usuarios`).
- **Tela:** "Lojas que enxerga" com seleção múltipla (uma, várias, todas) no lugar de "Loja onde trabalha"; quem tem a
  rede mostra "Todas (ver a rede)" sem marcar. Grava por `usuario_lojas_salvar(usuario, lojas[])`: recusa marcar loja
  que quem salva não enxerga (`LOJA_NAO_VISIVEL`) e audita (antes → depois).
- **Migração dos dados:** cada vínculo sem a rede ganha a lista `[coalesce(filial_id, matriz)]` (exatamente o que vê
  hoje); quem tem a rede fica sem lista (continua vendo tudo). Prova: matriz de acesso dos 15 vínculos da JM (8 ativos)
  (`filiais_visiveis()` de cada um, simulado) igual antes e depois.

### 5b. Configuração da distribuição POR LOJA (lugar único)

- **Onde:** **Configurações › Vendas e atendimento › Distribuição** (página nova `/configuracoes/distribuicao`). Uma aba
  por loja. As **regras por origem** (Automações › Distribuição) continuam onde estão, com um link de uma para a outra.
- **Por loja, quatro listas:**
  1. **Roleta de leads:** quem participa;
  2. **Liberação diária:** quem recebe (começa igual à roleta, editável à parte);
  3. **Reserva do pós-venda (P1):** lista ordenada; o sistema pula ausentes; sem ninguém presente, cai na regra de hoje
     (administradores da empresa). Fica entre a roleta da loja e os administradores;
  4. **Loja da comissão:** cada pessoa com UMA loja de comissão (onde as vendas dela contam em Metas/Comissões).
  - Só aparece para escolha quem **enxerga** a loja (5a). Ligar e desligar a liberação, o "sem dono" e o lote por pessoa
    ficam na mesma aba (hoje sem tela).
- **Dado:** `distribuicao_participantes (empresa_id, filial_id, usuario_id, lista ∈ {roleta, liberacao, reserva_posvenda}, ordem)`
  e `empresa_usuario_comissao (empresa_id, usuario_id, filial_id)`. Gravação só por função (`distribuicao_salvar`), que
  confere "só quem enxerga a loja", e audita cada mudança.
- **Funções que passam a ler as listas:** `core_roleta_elegiveis` e `lib/roleta.ts` (roleta), `core_liberar_lote_esteira`
  (liberação), `posvenda_vendedores_da_loja` (continua exigindo cargo vendedor, como hoje) e `posvenda_resolver_responsavel`
  (reserva). Ausente continua sendo pulado na hora (é estado, não lista).
- **A tela de Usuários fica só com o que é da pessoa:** lojas que enxerga, conta de serviço e "atende clientes". A marca
  "Recebe leads pela roleta" sai de lá (vira as listas por loja).
- **Migração:** roleta da loja L = quem hoje é elegível em L (ativo, não conta de serviço, `participa_roleta`,
  `coalesce(filial_id, matriz) = L`); liberação = a mesma lista; reserva do pós-venda = os de hoje
  (`posvenda_administradores`, na mesma ordem); comissão = `coalesce(filial_id, matriz)`.
  - **Prova:** matriz de distribuição dos 15 vínculos da JM (8 ativos) (por loja: roleta, liberação, roleta do pós-venda, reserva e
    comissão) igual antes e depois, e as rodadas reais seguintes de liberação e pós-venda ok na página Rotinas.

### Cuidados

- Tudo compatível com o app no ar: tabelas novas + funções que leem lista **ou** a regra antiga enquanto a lista estiver
  vazia; o app novo passa a gravar as listas; só então a regra antiga sai.
- Depois do deploy, **ninguém da JM é alterado** pela sessão: o Lucas ajusta lojas e listas pelas telas.
- Testes: RLS (a pessoa não vê loja que não marcou; o seletor só oferece as dela); roleta e liberação só para quem está
  na lista da loja; reserva pulando ausentes; "ninguém marca loja que não enxerga"; auditoria de cada mudança.

## 3. Perguntas antes de codar

1. A "loja da comissão" muda só **onde a pessoa aparece** em Metas/Comissões, ou também a loja das vendas que ela grava?
   (Proposta: só onde conta; a loja da venda continua sendo a do caixa onde foi feita.)
2. A liberação diária com lista própria (proposta) ou sempre igual à roleta?
3. A reserva do pós-venda por loja substitui os administradores ou fica antes deles (proposta: antes, com eles como
   última reserva)?
4. Quem enxerga 2+ lojas sem a rede: o seletor oferece "Todas as minhas lojas" (proposta) ou só uma por vez?

## 4. Respostas do Lucas (26/11) e o que foi feito

Respostas às 4 perguntas: (1) a loja da comissão muda só onde a pessoa aparece em Metas e Comissões; a venda fica com a
loja em que foi feita. (2) Liberação diária com lista própria, começando igual à roleta. (3) Reserva do pós-venda por loja
ANTES dos administradores e Donos (eles ficam como última reserva), pulando ausentes (resolve a P1). (4) "Todas as minhas
lojas" no seletor só para VER; gravar é sempre numa loja específica.

### 4.1 Correção de segurança (em produção em 26/11, 18:16 UTC banco; app 5179ee9f às 18:19)

- Migrações 0900 (funções `filiais_atuacao_de`/`filiais_atuacao`, `filial_atual` só aceita loja de atuação, gatilho
  `zy_loja_atuacao_confere` em 9 tabelas) e 0910 (loja do topo em `usuarios` só de atuação), separadas.
- Servidor: `exigirLojaDeAtuacao` (lib/sessao) em /api/clientes (o furo real: `filial_id` do corpo gravado com a chave de
  serviço por qualquer papel), estoque/transferir, canais/[id] e filial/selecionar. Seletor lista `filiais_atuacao()`.
- Levantamento de 30 dias antes: só a Milena aparece gravando na loja 3 até 25/11 — o vínculo dela era nulo (= matriz) e
  foi trocado para a loja 6 em 26/11 (sem auditoria). Nenhuma gravação fora da loja de atuação.
- Prova: matriz de acesso dos 15 vínculos da JM (8 ativos) com visão e loja de gravação idênticas antes e depois
  (conciliacao-pedidos/etapa-5a-20261126/, fora do git); smoke na Demonstração (403 para loja de outra empresa, grava na
  dela); logs de 15 min limpos (nenhum erro do app, nenhum 5xx, nenhuma recusa de usuário real).
- Descoberto: o navegador não tem UPDATE em `usuarios` (só a rota grava a loja do topo); o gatilho da 0910 protege o
  caminho da rota e de scripts.

### 4.2 5a — Lojas que enxerga (migrações 1000/1010)

Como no desenho §2, com: a principal sempre conta entre as que enxerga; a semente só cria lista para vínculo ativo sem a
rede em empresa de 2+ lojas; "vê a rede" na tela vem do CARGO (sistema ou `lojas.ver_rede`), sem checagem de papel nova.
Voltas: supabase/scripts/volta/volta-lojas-que-enxerga.sql.

### 4.3 5b — Distribuição por loja (migrações 1100/1110)

- Configurações › Vendas e atendimento › Distribuição (`/configuracoes/distribuicao`): uma aba por loja com Roleta,
  Liberação diária (ligar, negócios por pessoa, dias de conversa, pular o 1º dia, quem recebe), Reserva do pós-venda
  (ordenada). Link de/para Automações › Distribuição (regras por origem). (A "loja da comissão" que entrou aqui saiu em
  26/11: ver §4.4.)
- Banco: `distribuicao_listas` (cabeçalho = lista configurada) + `distribuicao_participantes` + `empresa_usuario_comissao`.
  `core_roleta_elegiveis`, `core_roleta_leads_proximo`, `core_liberacao_elegiveis` (nova), `core_liberar_lote_esteira`,
  `posvenda_vendedores_da_loja` e `posvenda_resolver_responsavel` leem a lista; sem cabeçalho, a regra antiga.
  `lib/roleta.ts` passou a ler `core_roleta_elegiveis` (uma regra só para o app e o banco).
- Reserva: pula excluído, ausente (hoje) e quem está no teto do dia; origem nova `reserva_loja` no acompanhamento.
- **Diferença do desenho:** a reserva começa VAZIA (e não com os administradores): a reserva é por prioridade e os
  administradores são por rodízio; semear com eles mudaria o comportamento em empresa com 2+ administradores. Vazia =
  vai direto aos administradores e Donos, exatamente como antes.
- Pessoa nova ou readmitida entra na roleta e na liberação da loja principal (`distribuicao_incluir_pessoa`), como
  acontecia antes. A marca "Recebe leads pela roleta" saiu da tela de Usuários (vale só em loja sem lista).
- Volta: supabase/scripts/volta/volta-distribuicao-por-loja.sql (listas viram "não configuradas"; nada é apagado).

### 4.4 Correção de 26/11: comissão é da PESSOA (migrações 1400 e 1410)

A 5b tinha posto cada pessoa numa "loja da comissão". Errado: cada venda conta para quem vendeu, em qualquer loja; a
faixa soma todas as vendas concluídas da pessoa no período; a meta da loja conta pela loja da venda; a meta pessoal é da
pessoa, sem loja. Regra registrada em `docs/pdv-v2-especificacao.md` (§H, "Comissão é da PESSOA").
- 1400 (antes do app): `metas_comissoes` e `vendas_comissoes` sem recorte pela loja do topo (antes, com uma loja
  escolhida, a meta e o pagamento gravados em outra loja sumiam — risco de pagar duas vezes; as duas tabelas estavam
  vazias na produção); `vendas_da_equipe(inicio, fim)` devolve as vendas concluídas de todas as lojas, com a loja de
  cada uma e a marca de retida.
- App: Comissões e Metas somam por pessoa todas as lojas e mostram quanto foi em cada loja; o campo some da
  Distribuição, de Usuários e de Metas. O painel já estava certo: em "Rede" cada pessoa aparece uma vez com o total;
  com uma loja escolhida, as vendas feitas nela.
- 1410 (depois do app): backup e remoção de `empresa_usuario_comissao` e `comissao_loja_salvar` (só tinha a semente).

### 4.5 Registros (26/11)

- A reserva do pós-venda começa **vazia** em todas as lojas (vai direto para administradores e Donos, como antes). O
  Lucas configura pela tela de Distribuição.
- A JM tem **15 vínculos (8 ativos)**; as referências a "18" foram corrigidas.
- A troca de loja da Milena (vínculo nulo = matriz loja 3 até 25/11; loja 6 em 26/11, sem auditoria) foi **anterior à
  5a**, quando a tela de Usuários ainda não auditava loja: **explicada**. Desde a 5a a mudança de lojas é auditada
  (`usuario_lojas`).
