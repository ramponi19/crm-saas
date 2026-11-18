# 09 — Primeiro piloto com empresa terceira: roteiro do primeiro dia

**Empresa:** Aletrini (revenda de veículos), com **portfólio próprio na Meta**. **Situação no Nexus:** Piloto (sem cobrança, sem vencimento de teste, fora do MRR).
**Regra do dia:** nada muda na JM. Tudo o que é da Aletrini nasce na empresa dela; a JM só é olhada para conferir que não mudou.

Preparado em 18/11/2026 (06, seção 55). O que existe e onde: cadastro em `/register` (06 s.53), situação e acompanhamento no superadmin, importação em Configurações → Importar contatos.

---

## 0. Antes do dia (com a Aletrini, por mensagem)

### Na Meta (portfólio da Aletrini, em business.facebook.com)

| Item | Por quê | Como conferir |
|---|---|---|
| **Portfólio próprio, diferente do nosso** | O cadastro incorporado (Embedded Signup) recusa conectar o portfólio dono do app (erro #1690130). O dela é outro: é o caso certo. | Configurações do negócio → Informações da empresa: o ID do portfólio dela. |
| **Administrador do portfólio** na hora da conexão | Só admin compartilha a conta do WhatsApp e a Página com o app. | Quem vai clicar no dia é admin total do portfólio (não só funcionário). |
| **Verificação da empresa** (Central de segurança → Verificação) | Sem ela o número fica no limite inicial de conversas e o nome de exibição pode não ser aprovado. Conecta sem, mas é o primeiro gargalo. | Status "Verificada". Se estiver "Em análise", seguir mesmo assim e anotar. |
| **Forma de pagamento na conta do WhatsApp** (WhatsApp Manager → Configurações de pagamento) | Sem cartão, as conversas **iniciadas pela empresa** (modelos, Transmissão, Automatize com modelo) são bloqueadas (código 141006, o que aconteceu na JM). Responder cliente funciona. | Cartão cadastrado na conta do WhatsApp **dela**, não no nosso portfólio. |
| **O número que vai conectar** | Precisa receber SMS ou ligação para o código. | Ver os três casos abaixo. |
| **Instagram profissional ligado a uma Página do portfólio** | Instagram e Messenger entram pela Página. | Instagram → Configurações → Conta profissional; Página com o Instagram vinculado. |

**O número — três casos:**
1. **Está no app WhatsApp Business** (o mais comum): conectar em **coexistência** — o app no celular continua funcionando e o histórico recente é importado. Não apagar o app.
2. **Está no WhatsApp comum (pessoal)**: não dá coexistência. Ou passa para o WhatsApp Business antes (caso 1), ou usa um número novo.
3. **Já está em outro sistema/API (outro BSP)**: precisa ser desligado lá antes (migração); senão a Meta recusa. Perguntar antes do dia.

### No nosso lado (Lucas)
- App da Meta em modo **Live**, com acesso avançado às permissões de WhatsApp (`whatsapp_business_management`, `whatsapp_business_messaging`) e de Instagram/Página — conferir no painel do app **antes** do dia: cadastro incorporado de portfólio de terceiro depende disso.
- Combinar quantos usuários a Aletrini terá no piloto (o plano base traz 3; o superadmin aumenta em "Uso vs. limites").
- Pedir a planilha de contatos/leads com antecedência (xlsx ou csv, com cabeçalho, telefone em uma coluna).

---

## 1. Cadastro (`/register`)
1. A Aletrini abre `https://crm-saas-beta.vercel.app/register` e faz os 3 passos: **Sua conta** (nome, e-mail, senha, telefone) → **Sua empresa** (nome, CNPJ, nome da loja principal) → **Termos** (aceite de Termos, Privacidade e DPA, versão "minuta").
2. Cai no painel com **Primeiros passos**.
3. **Superadmin → Empresas → Aletrini → Situação → Piloto** (um clique). Confere: badge "Piloto", "Trial termina" = —. Sem isso a empresa ficaria em teste de 14 dias e iria para só leitura no fim.
4. Se combinado, aumentar o limite de usuários no mesmo lugar ("Uso vs. limites" / controle da empresa).

## 2. Canais pelo cadastro incorporado
Em **Configurações → Canais e integrações**, logado como o dono da Aletrini, com o admin do portfólio ao lado:
1. **WhatsApp:** "Conectar WhatsApp" → janela da Meta → escolher **o portfólio da Aletrini** (nunca o nosso) → conta do WhatsApp → número (coexistência, se for o caso 1) → código.
2. **Instagram e Messenger:** conectar pela Página do portfólio dela.
3. Ao terminar, o canal aparece como conectado. Mandar uma mensagem de um celular qualquer para o número e para o Instagram: tem de cair na Comunicação **da Aletrini**.
4. Se o número tiver mais de uma loja combinada, conferir em qual loja o canal ficou (Lojas → canal da loja).

## 3. Equipe por link
**Configurações → Usuários → convidar** (nome, e-mail, papel, loja). Sem provedor de e-mail configurado, o Nexus devolve o **link do convite**: copiar e mandar à pessoa pelo WhatsApp. Ela abre, cria a senha e entra. Conferir em Usuários que ficou ativa.

## 4. Importação
**Configurações → Importar contatos:**
1. Escolher a planilha → conferir o mapeamento (o Nexus sugere pelo cabeçalho; **telefone é obrigatório**).
2. Escolher funil, etapa e responsável (ou deixar na esteira).
3. **Ver prévia** → conferir contatos novos, já existentes, leads a criar e recusadas → **Importar**.
4. Baixar o **relatório das recusadas** (CSV com linha e motivo) e devolver à Aletrini o que precisar corrigir.
5. Os importados ficam com a etiqueta **"importação"** (filtro no funil e na Comunicação). Teto: 5.000 linhas por arquivo; a deduplicação é por telefone, dentro da Aletrini.

## 5. Horário
**Configurações → Horário**: fuso e horário de atendimento da loja (ele decide o "fora do horário" e os prazos de SLA).

## 6. Primeiro funil
**Configurações → Etapas do funil / Funis / Motivos de perda**: as etapas da revenda (ex.: Novo, Em atendimento, Visita/negociação, Proposta, Fechado), motivos de perda reais. Módulos de ramo de veículo (Avaliação, FIPE, Financiamento) ainda estão **em preparação**: o piloto roda com o núcleo (funil, Comunicação, tarefas, Automatize, etiquetas).

---

## 7. Fim do dia — o que conferir

### Mensagens entrando e saindo nos canais dela
- **Superadmin → Empresas → Aletrini → Acompanhamento**: recebidas, enviadas (e quantas pelo CRM), falhas de envio e usuários ativos por dia; cada canal com status, última mensagem e último erro.
- Esperado no primeiro dia: recebidas > 0 em cada canal conectado, ao menos uma enviada **pelo CRM** com status entregue, **0 falhas** (se houver, a lista mostra o erro; 141006 = falta forma de pagamento).

### Isolamento da JM
- Acompanhamento da **JM** igual a um dia normal (recebidas/enviadas na faixa de sempre, canais da JM com última mensagem recente).
- No banco (só leitura), nada da Aletrini com `empresa_id` da JM e vice-versa:
  ```sql
  -- id da Aletrini = A
  select count(*) from contatos where empresa_id = 1 and created_at > now() - interval '1 day' and origem = 'importacao'; -- 0
  select count(*) from canais where empresa_id = A;                -- os dela
  select count(*) from mensagens m join canais c on c.id = m.canal_id
   where m.empresa_id <> c.empresa_id and m.created_at > now() - interval '1 day';               -- 0
  ```
- Um vendedor da JM não vê nada da Aletrini (busca ⌘K pelo nome de um contato importado: nenhum resultado).

### Nenhum erro no Sentry
- Link "Erros da empresa no Sentry" no Acompanhamento (tag `empresa` = nome da empresa, 14 dias): **nenhum evento**.
- Sentry geral do dia: nenhum issue novo depois do cadastro (se houver, ver se é da Aletrini, da JM ou da plataforma).

### Fechamento
- Anotar no 06 (seção do piloto): horário de cada etapa, o que travou, números do Acompanhamento.
- Sair de qualquer empresa impersonada no superadmin e fechar as abas de teste.
