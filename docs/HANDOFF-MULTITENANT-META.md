# Handoff — Multi-tenant Meta (WhatsApp + Instagram + Messenger)

> Documento de passagem de contexto. Escrito em **29/07/2026**, logo após a
> aprovação do App Review da Meta.
>
> Objetivo: qualquer sessão nova (Claude Code no terminal ou pessoa) consegue
> continuar o trabalho sem depender do histórico de conversa.
>
> Complementa `docs/ARQUITETURA-OMNICHANNEL.md` (o plano em 5 fases). Este
> documento traz **o diagnóstico verificado do código atual** e **os requisitos
> reais da Meta**, que não existiam quando aquele doc foi escrito.

---

## 1. Onde estamos

### 1.1 App Review — APROVADO ✅

Submetido em 28/07/2026 21:29 BRT, aprovado integralmente.

**Novas (4):**
| Permissão | Status |
|---|---|
| `whatsapp_business_messaging` | Approved |
| `whatsapp_business_management` | Approved |
| `pages_show_list` | Approved |
| `pages_manage_metadata` | Approved |

**Renovadas (4):** `instagram_basic`, `pages_messaging`,
`instagram_manage_messages`, `public_profile` — todas Renewed.

Isso significa **Advanced access** nas 8. Sem isso o Embedded Signup nem exibe a
permissão para o cliente aceitar.

### 1.2 Identificadores do projeto

| O quê | Valor |
|---|---|
| App Meta | `952241517333998` (JMStoreCRM) |
| WABA (teste) | `1009216938525176` |
| Phone Number ID (teste) | `1268473659671917` |
| Supabase project ref | `guiuzbcqkvelqcuogxtd` |
| Webhook URL | `https://guiuzbcqkvelqcuogxtd.supabase.co/functions/v1/webhook-leads` |
| Site | `https://crm-saas-beta.vercel.app` |
| Login do revisor Meta | `reviewer.meta@jmstore.app` / `MetaReview2026!` |

O login do revisor **precisa continuar funcionando por 1 ano** — a Meta pode
reabrir a revisão. Não apagar essa conta.

### 1.3 O que já foi entregue

- **Fase 0** do doc de arquitetura: envio real de mensagem pelo chat, via Edge
  Function. Em produção.
- `app/privacy/page.tsx` — página pública de política de privacidade (exigência
  do App Review). `middleware.ts` libera a rota sem autenticação.
- Remoção das referências a Evolution API na UI (`configuracoes-view.tsx`), para
  o revisor da Meta não ver solução não-oficial. **O backend ainda usa Evolution
  como fallback** — só a UI foi limpa.

---

## 2. Diagnóstico do código atual (verificado)

> Levantamento feito lendo o repo **e** o banco/Edge Function ao vivo.
> Tudo abaixo foi confirmado, não é suposição.

### 2.1 Bloqueador absoluto do multi-tenant

Na Edge Function `webhook-leads`:

```ts
const EMPRESA_ID = 1;   // constante de módulo
```

Todo insert em `leads` / `lead_mensagens` e todo caminho de storage usa essa
constante. O roteamento de entrada olha só `body.object` para decidir o canal:

- `whatsapp_business_account` → `entry[0].changes[0].value.messages[0]`
- `page` → Messenger, `entry[].messaging[]`
- `instagram` → `entry[0].messaging[]`
- sem `object` mas `event === 'MESSAGES_UPSERT'` → payload Evolution

**`value.metadata.phone_number_id` e `entry[].id` chegam no payload e nunca são
lidos.** Não existe lookup external_id → tenant. Leads de qualquer cliente novo
cairiam todos na empresa 1.

### 2.2 BUG ATIVO — a UI grava numa chave, o webhook lê de outra

Existem dois namespaces paralelos para os mesmos canais e **nada os liga**:

| Canal | UI grava | Webhook lê |
|---|---|---|
| Instagram | `meta_instagram` → campo `access_token` | `instagram` → campo `token` |
| Messenger | `meta_messenger` → campo `access_token` | `messenger` → campo `page_token` |

Consequência: **atualizar o token de Instagram/Messenger pela tela de
Configurações não tem efeito no envio.** Salva, mostra sucesso, e o envio segue
usando a chave antiga.

Isso importa agora porque **há um token que expirou em 30/06/2026**. Corrigir
pela UI não vai resolver enquanto essa divergência existir.

Onde:
- UI escreve em `components/modules/configuracoes/configuracoes-view.tsx`
  (`saveModal()`, ~linhas 208-253), chave `` `meta_${modalCanal.id}` ``
- Edge Function `action=send_meta` e `getChannelToken()` leem `chave =
  'instagram' | 'messenger'`, campos `valor.token || valor.page_token`

Rows que existem hoje em `configuracoes_sistema` (todas `empresa_id = 1`):
`whatsapp_official`, `whatsapp_evolution`, `instagram`, `messenger`,
`meta_instagram`, `meta_messenger`, `whatsapp_zapi_obsoleto`, `sla_atendimento`,
`portal_leads`.

### 2.3 Buracos de segurança

| # | Problema | Onde |
|---|---|---|
| 1 | `?action=send` / `?action=send_meta` sem autenticação real. `verify_jwt: false` + só recebe a anon key, que é **pública** (vai no bundle do front). Qualquer um pode disparar mensagem pela conta do tenant. | Edge Function |
| 2 | Webhook não valida `X-Hub-Signature-256`. Quem descobrir a URL injeta lead falso. | Edge Function, POST sem action |
| 3 | Verify token com fallback hardcoded: `Deno.env.get("WEBHOOK_VERIFY_TOKEN") ?? "jmstore2024"`. Não usa o `webhook_verify_token` por tenant que a UI coleta. | Edge Function, GET |
| 4 | **Todos os tokens em texto puro** no banco. | `configuracoes_sistema.valor` |
| 5 | Rotas `app/api/configuracoes/whatsapp-*/route.ts` fazem upsert do `body` cru, sem validar shape e sem checar se o caller é admin (dependem só da RLS `config_write`). | Next API |

Existe helper de cripto pronto e bem escrito: `lib/payments/crypto.ts`
(AES-256-GCM, chave em `PAYMENT_ENCRYPTION_KEY`). Hoje usado só por
`tenant_payment_config` — **nunca** para canais. É o que a Fase 1 deve reusar.

### 2.4 Nada está versionado

- **Não existe pasta `supabase/`** no repo. Sem `migrations/*.sql`, sem
  `functions/*`. Zero arquivos `.sql` no git.
- A Edge Function `webhook-leads` está na **versão 26**, `ACTIVE`, e existe **só
  no projeto Supabase**. Se for sobrescrita, não há de onde restaurar.
- O schema existe só no banco ao vivo. `types/database.ts` está **desatualizado**:
  declara ~28 tabelas, o banco tem ~70 (`funis`, `tarefas`, `imoveis`,
  `automacoes`, `cadencias`, …). Também omite colunas que já existem em
  `lead_mensagens`: `external_id`, `tipo`, `midia_url`.

### 2.5 Modelo multi-tenant que JÁ funciona (não jogar fora)

- Tabela tenant: **`empresas`** (bigint `id`). Não é `organizacoes`, não é `tenants`.
- Coluna de escopo: **`empresa_id`** (bigint), FK → `empresas(id)`, em
  praticamente toda tabela de domínio.
- Membership: **`empresa_usuarios`** (`usuario_id`, `empresa_id`, `ativo`, `role`
  com `owner`/`admin`).
- RLS ativa em todas as tabelas públicas. Padrão:
  `tenant_isolamento ... using (empresa_id = get_empresa_id())`.
- `get_empresa_id()` — plpgsql STABLE SECURITY DEFINER. Suporta impersonation de
  super admin (`impersonando_empresa_id` + `impersonando_expires_at`).
- `is_empresa_admin(emp)` — super admin OU membership ativa com role owner/admin.
- Espelho server-side: `getEmpresaId()` em `lib/supabase/server.ts:37-70`.
- Escape hatch service-role: `lib/supabase/service.ts`.

**A Edge Function contorna tudo isso** — usa service role key (RLS não aplica) e
hardcoda `empresa_id = 1`.

### 2.6 Outros pontos

- **Não existe nenhuma rota OAuth** de Meta/Facebook. `app/api` tem 20 arquivos,
  nenhum com `auth/callback`, `meta/` ou `facebook/`. Grep por
  `oauth|graph\.facebook|embedded_signup|fb_exchange|app_secret|META_APP` só bate
  em `lib/payments/providers/efibank.ts`.
- `.env.example` **não declara nenhuma variável da Meta** — sem `META_APP_ID`,
  `META_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`.
- Graph API **hardcoded `v19.0`** nos caminhos Meta da Edge Function. A atual é
  `v25.0`.
- URL do webhook hardcoded em **3 lugares**: `configuracoes-view.tsx:24`,
  `official-card.tsx:174`, `evolution-card.tsx:113`.
- `official-card.tsx` e `evolution-card.tsx` existem, POSTam para as API routes,
  mas **não são importados** por `configuracoes-view.tsx`. Código morto.
- Dois caminhos de envio paralelos: Edge Function `?action=send` e
  `app/api/whatsapp/send/route.ts` (este checa `auth.getUser()`).
- Idempotência **já existe** parcialmente: `lead_mensagens.external_id` com
  índice único `lead_mensagens_external_id_uidx`; erro de insert é engolido como
  "duplicada".
- Mídia já funciona: baixa da Graph API e salva no bucket público `chat-midia`,
  path `${EMPRESA_ID}/{uuid}.{ext}`, cap de 20 MB.

---

## 3. Requisitos reais da Meta

> **Ressalva de método:** o ambiente onde esta pesquisa foi feita bloqueia saída
> HTTP para `developers.facebook.com`. As informações vieram de índice de busca
> sobre as páginas oficiais, não da leitura direta. O grosso é sólido e citado;
> os pontos incertos estão marcados **[VERIFICAR]**. Antes de construir sobre um
> item marcado, abra a doc.

### 3.1 Tech Provider — não é solicitação

Não existe botão nem formulário. "Tech Provider" descreve quem cumpriu:

1. Business portfolio na Meta
2. **Business Verification** ← gate duro
3. App com produto WhatsApp
4. **Facebook Login for Business** configurado + Embedded Signup
5. App Review com Advanced access em `whatsapp_business_management` e
   `whatsapp_business_messaging` ← **feito**

Como Business Verification é exigida *antes* do App Review e passamos duas vezes,
ela provavelmente já está feita. **Confirmar em Business Settings → Security
Center.**

O que exige aplicação de verdade é **Tech Partner** — e só acima de 200 clientes
novos/semana.

**Limite de onboarding:** 10 clientes novos por 7 dias corridos. Sobe automático
para **200/7 dias** com Business Verification + App Review + Access Verification.

Doc: [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)

### 3.2 ⚠️ Cobrança — decisão de PRODUTO, não de código

Da doc, sem ambiguidade: **Tech Providers não têm linha de crédito.**

> "clients onboarded by Tech Providers must provide their own payment method
> after onboarding is complete. Meta will then bill these clients for API usage,
> and the Tech Provider will bill for other services."

Ou seja: **cada cliente do CRM precisa cadastrar cartão próprio na WABA dele.**
A Meta cobra o cliente pelo uso da API; a JM Store cobra a mensalidade separado.

Consequência de UX: depois de conectar o WhatsApp, o cliente **ainda não manda
mensagem** até adicionar forma de pagamento. A doc marca isso como ponto comum de
desistência. **Precisa de tela que detecte "conectado mas sem pagamento" e guie o
cliente.**

Compartilhar linha de crédito exige ser **Solution Partner** (BSP) — trilha
separada, por aplicação, exige linha de crédito própria. Não perseguir agora.

Doc: [Solution Partner overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview)

### 3.3 ⏰ Prazo — Embedded Signup v2 morre em 15/10/2026

~2,5 meses. **Construir direto no v4.** Tutoriais e código de referência que se
acha por aí em geral são v2.

Ferramenta útil: **Embedded Signup Integration Helper** no App Dashboard —
dispara o fluxo em várias configurações e mostra os dados retornados. Há também
WABAs sandbox para teste.

Docs: [Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview) ·
[Version 4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) ·
[Implementation](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)

### 3.4 WhatsApp — fluxo e token

**1. Cliente completa Embedded Signup.** O fluxo devolve por `postMessage` no
browser (`type: "WA_EMBEDDED_SIGNUP"`, eventos `FINISH` / `CANCEL` / `ERROR`) o
**WABA ID** e o **phone number ID**. O callback do `FB.login` devolve um
**code trocável**.

**2. Trocar o code por token — server-to-server, nunca no browser:**

```
GET https://graph.facebook.com/v25.0/oauth/access_token
    ?client_id={app-id}
    &client_secret={app-secret}
    &code={code-do-fluxo}
```

Retorna um **Business Integration System User access token**, escopado àquele
cliente específico. Não depende de sessão de humano nem de re-autenticação.

**3. Ler validade e guardar:**

```
GET /debug_token?input_token={business-token}&access_token={app-token}
```

Ler `expires_at` (`0` = nunca) e `data_access_expires_at`. Persistir os dois.

> **[VERIFICAR]** Se o token tem expiração default de 60 dias. Evidência
> conflitante: a Meta descreve tokens dessa classe como long-lived, mas a API de
> system user expõe `set_token_expires_in_60_days` e ao menos um BSP documenta
> 60 dias como default. **Construir assumindo que expira** — ler `expires_at`,
> alertar, e ter fluxo de reconexão. Fica correto nos dois casos.

**4. Assinar o webhook da WABA** (obrigatório, com o business token do tenant):

```
POST https://graph.facebook.com/v25.0/{WABA_ID}/subscribed_apps
  -H 'Authorization: Bearer {BUSINESS_TOKEN}'
```

**Sem corpo** — corpo é opcional e serve para override de callback por WABA.
Sem corpo, roteia para a callback URL do App Dashboard, que é o que queremos num
webhook multi-tenant único. Sem esse passo o cliente conecta e nunca recebe nada.

**5. Registrar o número no Cloud API — prazo de 14 dias:**

```
POST /{phone-number-id}/register
{"messaging_product":"whatsapp","pin":"<6 dígitos>"}
```

O Embedded Signup já adiciona e verifica o número; registrar é o passo que sobra.

**Tratar `OAuthException` code 190 como "re-rodar Embedded Signup para este
tenant".** Construir esse caminho desde o dia 1. Assinar também o webhook
`account_update` da WABA para pegar revogação/desativação. **[VERIFICAR]** nome
exato do campo.

Docs: [Access Tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/) ·
[Registration](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration) ·
[WABA Subscribed Apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api)

### 3.5 Instagram / Messenger — fluxo e token

Trilha: **Facebook Login for Business → Messenger Platform / Instagram Messaging
API**. Exige que a conta Instagram profissional do cliente esteja **vinculada a
uma Página do Facebook**.

1. Criar uma **configuração FLFB** no App Dashboard: tipo de token, assets
   (Pages, contas Instagram) e permissões. Salvar → gera um **`config_id`**.
2. Chamar `FB.login` com esse `config_id`. O cliente escolhe portfolio, Páginas e
   contas IG, e concede as permissões.
3. Enumerar assets com o token do usuário:
   ```
   GET /me/accounts?fields=id,name,access_token,instagram_business_account
   ```
   Devolve **um Page access token por Página** e o ID da conta IG vinculada.

**Guardar o Page access token, NÃO o user access token.** O user token é só meio
para chegar no Page token. Os Page tokens são o que a Messenger e a Instagram
Messaging API autenticam, sobrevivem à sessão do admin, e são o que
`/subscribed_apps` exige.

**Page token expira?** Depende do pai:
- derivado de user token **short-lived** → ~1-2h
- derivado de user token **long-lived** → **Page token long-lived, sem data de
  expiração**

Duas formas de obter o não-expirante:

**(a)** trocar o user token curto por longo, depois buscar os Page tokens:
```
GET /oauth/access_token?grant_type=fb_exchange_token
    &client_id={app-id}&client_secret={app-secret}
    &fb_exchange_token={short-lived-user-token}
```
depois `GET /me/accounts`.

**(b) Preferível para SaaS multi-tenant:** configurar a FLFB para devolver
**business integration system user access token** e derivar os Page tokens dele.
Mesma classe de token do WhatsApp → **modelo uniforme nos dois canais**, e não
pendurado no login de um humano. **[VERIFICAR]** nomes exatos dos campos de
config / `response_type`.

"Sem expiração" ainda é **invalidável**: admin remove o app, troca de senha,
revoga permissão, muda role na Página, ou cliente sai do portfolio. Guardar
criptografado, validar com `debug_token`, manter caminho de reconsentimento para
code 190.

**Assinar o webhook da Página** (usa `pages_manage_metadata`, com o **Page**
token):

```
POST https://graph.facebook.com/v25.0/{page-id}/subscribed_apps
  ?subscribed_fields=messages,messaging_postbacks,messaging_optins,
                     message_reactions,messaging_referrals,messaging_handovers
  &access_token={PAGE_ACCESS_TOKEN}
```

`GET` no mesmo edge para verificar, `DELETE` para desassinar.
**[VERIFICAR]** a lista exata de `subscribed_fields` contra a referência de
webhooks do Messenger.

Para Instagram na trilha Facebook Login, a assinatura é na **Página vinculada**
via `/subscribed_apps`, **mais** adicionar os webhooks do produto Instagram no
App Dashboard (Webhooks → Instagram → callback + verify token → campo `messages`).
**[VERIFICAR]** — essa parte em dois passos é leitura da doc, confiança média.

**Nota estratégica:** existe trilha alternativa — **Instagram API with Instagram
Login** (scopes `instagram_business_basic`, `instagram_business_manage_messages`),
que **não exige Página do Facebook**; tokens long-lived de 60 dias, renováveis.
A direção da Meta em 2026 favorece essa trilha, mas **[VERIFICAR]** — não foi
encontrada data de sunset para a trilha Facebook Login. Não assumir que existe.

Docs: [FLFB](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business) ·
[Pages access tokens](https://developers.facebook.com/docs/pages/access-tokens/) ·
[Long-lived tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived) ·
[Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging)

### 3.6 Outras mudanças de prazo

- **Graph API atual: v25.0** (lançada 18/02/2026). v26.0 esperada ~set/2026.
  O código usa `v19.0` hardcoded.
- As docs de business messaging migraram para
  `developers.facebook.com/documentation/business-messaging/...`. URLs antigas
  `/docs/whatsapp/...` ainda resolvem mas muitas redirecionam.
- **Message tags depreciadas** (`CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`,
  `POST_PURCHASE_UPDATE`) passaram a **falhar com erro 100 em 27/04/2026**.
  Migrar para Utility Templates / Marketing Messages API.

---

## 4. O que precisa construir

### Passo 0 — Versionar e destravar
*Pequeno, reversível, cria rede de segurança antes de mexer em produção.*

- [ ] Criar `supabase/functions/webhook-leads/index.ts` com o **fonte da versão
      26 que está rodando** (baixar do projeto, commitar como baseline).
- [ ] Criar `supabase/migrations/` e um dump do schema atual como baseline.
- [ ] Regenerar `types/database.ts` a partir do banco (hoje: 28 de ~70 tabelas,
      e `lead_mensagens` sem `external_id`/`tipo`/`midia_url`).
- [ ] **Corrigir a divergência de chaves** `meta_instagram`/`instagram` e
      `meta_messenger`/`messenger`, para o token voltar a ser editável pela UI.
      Decidir: unificar num namespace só (preferir o que a Fase 1 vai substituir
      de todo jeito) e migrar as rows existentes.
- [ ] Atualizar o token expirado (venceu 30/06/2026) — só funciona **depois** do
      item acima.
- [ ] Extrair a URL do webhook hardcoded em 3 lugares para uma constante/env.
- [ ] Remover `official-card.tsx` e `evolution-card.tsx` (código morto).

### Fase 1 — Espinha multi-tenant + segurança
*É o que destrava o segundo cliente. Sem isso, nada de multi-tenant funciona.*

- [ ] `canais_conectados` conforme `docs/ARQUITETURA-OMNICHANNEL.md` §4.1, com
      `unique (tipo, external_id)` e `access_token_enc`.
      Reusar `lib/payments/crypto.ts` (AES-256-GCM). Considerar chave própria
      `CHANNEL_ENCRYPTION_KEY` em vez de reusar `PAYMENT_ENCRYPTION_KEY`.
      Adicionar colunas de validade: `token_expira_em`, `data_access_expira_em`.
- [ ] RLS `tenant_isolamento`. **`access_token_enc` nunca exposto ao client** —
      só service role decifra no envio.
- [ ] Backfill a partir de `configuracoes_sistema` (as 6 rows de canal da
      empresa 1).
- [ ] **Roteamento do webhook por `external_id`:** extrair
      `value.metadata.phone_number_id` (WhatsApp) e `entry[].id` (IG/Messenger),
      buscar `empresa_id` em `canais_conectados`, e usar em toda escrita.
      Sem match → ignorar, não criar lixo. **Remover `const EMPRESA_ID = 1`.**
- [ ] Validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com o App Secret)
      antes de processar qualquer POST.
- [ ] **Fechar `?action=send` / `?action=send_meta`** — hoje qualquer um com a
      anon key pública pode disparar mensagem. Exigir JWT do usuário ou mover o
      envio para a Next API (que já checa `auth.getUser()`).
- [ ] Tirar o fallback hardcoded `"jmstore2024"` do verify token.
- [ ] Validar shape e checar admin nas rotas `app/api/configuracoes/whatsapp-*`.
- [ ] Subir Graph API de `v19.0` para `v25.0`.
- [ ] **Teste de aceite: dois tenants provam isolamento ponta a ponta.**

### Fase 2 — Onboarding automático
*Só faz sentido depois da Fase 1 — precisa de `canais_conectados` para gravar.*

- [ ] Declarar no `.env.example`: `META_APP_ID`, `META_APP_SECRET`,
      `META_GRAPH_VERSION`, `WEBHOOK_VERIFY_TOKEN`, `CHANNEL_ENCRYPTION_KEY`,
      `META_FLFB_CONFIG_ID`.
- [ ] Criar configuração FLFB no App Dashboard → obter `config_id`.
- [ ] **WhatsApp — Embedded Signup v4** (não v2, deprecado 15/10/2026):
      JS SDK no front → captura `postMessage` (`WA_EMBEDDED_SIGNUP`) → manda o
      code para rota server-side → troca por business token → `debug_token` →
      grava criptografado em `canais_conectados` → `POST
      /{WABA_ID}/subscribed_apps` (sem corpo) → `POST
      /{phone-number-id}/register` (prazo 14 dias).
- [ ] **Instagram/Messenger — Business Login:** `FB.login` com `config_id` →
      `GET /me/accounts` → grava **Page access token** por Página + IG account id
      → `POST /{page-id}/subscribed_apps` com os `subscribed_fields`.
      Preferir configurar a FLFB para devolver system user token (modelo uniforme
      com o WhatsApp).
- [ ] **Tela de status de pagamento:** detectar cliente conectado sem forma de
      pagamento na WABA e guiar o cadastro. Ponto conhecido de desistência
      (§3.2).
- [ ] Caminho de **reconexão** para `OAuthException` 190 / token expirado.
- [ ] UI de "Canais conectados" por tenant: status ativo/expirado/erro, último
      erro, botão de reconectar.

### Fases 3-5
Seguem `docs/ARQUITETURA-OMNICHANNEL.md`: contato unificado + conversas,
pipeline (`negocios`), robustez (status de entrega, janela 24h, templates), e
aposentar Evolution.

---

## 5. Decisões de produto pendentes

1. **Cobrança da API pelo cliente (§3.2).** Cada cliente paga a Meta direto.
   Como isso entra na proposta comercial e no onboarding? Precisa de tela
   guiando, e provavelmente de texto no material de venda.
2. **Trilha do Instagram:** Facebook Login (atual, exige Página vinculada) vs
   Instagram Login (sem Página, mas outra trilha de permissões e novo App
   Review). As 8 permissões aprovadas são da trilha Facebook Login — mudar
   depois custaria nova submissão.
3. **Evolution API:** manter como fallback ou aposentar? Hoje está escondida da
   UI mas ativa no backend. Com WhatsApp Cloud aprovado, o argumento para manter
   enfraquece — e é risco de ban.
4. **Limite de 10 clientes/7 dias** no início. Se a expectativa de venda for
   maior, correr atrás de Access Verification antes do lançamento.

---

## 6. Ordem recomendada

**Passo 0 primeiro.** Motivo: a Edge Function em produção está recebendo
mensagens e **não tem cópia no Git**. Qualquer mudança na Fase 1 mexe nesse
arquivo. Versionar antes é barato e evita perda irreversível. Além disso o Passo
0 corrige o bug que hoje impede atualizar o token expirado.

Depois Fase 1 inteira, com o teste de dois tenants como critério de pronto.
Só então Fase 2.
