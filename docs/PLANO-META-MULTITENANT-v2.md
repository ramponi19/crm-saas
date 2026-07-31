# Plano Meta multi-tenant — v2 (verificado contra código, banco e Graph API)

> Escrito em **29/07/2026**, depois do merge em produção e da aprovação total do App Review.
> Corrige e substitui o diagnóstico de `HANDOFF-MULTITENANT-META.md` nos pontos marcados.
> Método: leitura do repo, do banco ao vivo (`guiuzbcqkvelqcuogxtd`), da Edge Function v26
> ao vivo e **chamadas reais à Graph API v25.0** com os tokens do banco (read-only).

---

## 1. Correções ao handoff anterior

O handoff foi escrito por uma sessão sem acesso ao disco nem à Graph API. Quatro afirmações
não se sustentam, e o item mais urgente estava fora do radar.

| Afirmação do handoff | Realidade verificada |
|---|---|
| "Não existe pasta `supabase/`; a Edge só existe no Supabase" | **Existe** `supabase/functions/webhook-leads/index.ts` e o conteúdo **é igual à v26 em produção**. O risco de perda irreversível não existe. |
| "`types/database.ts` desatualizado: 28 de ~70 tabelas, sem `external_id`/`tipo`/`midia_url`" | Declara **76 blocos de tabela** (banco tem 68) e **contém** `external_id`, `tipo` e `midia_url`. Está em dia. |
| "Token do Instagram/Messenger expirou em 30/06 e não dá para corrigir pela UI" | Os tokens de IG/Messenger estão **VÁLIDOS** (testados agora: página "Importados JM Store", id 604543449417987). O que expirou é **outro canal** — ver abaixo. |
| "A divergência de chaves impede atualizar o token" | A divergência **existe** (UI grava `meta_*`, Edge lê `instagram`/`messenger`), mas hoje **as 4 rows contêm o mesmo token válido**, então não está causando falha. É dívida latente, não incêndio. |

Confirmado do handoff (tudo verdade): `EMPRESA_ID = 1` fixo, ausência de validação de
`X-Hub-Signature-256`, `?action=send`/`send_meta` sem autenticação, fallback `"jmstore2024"`
no verify token, tokens em texto puro, Graph `v19.0` hardcoded, `canais_conectados` não existe,
**zero migrations versionadas** (0 arquivos `.sql` no git), nenhuma rota OAuth.

---

## 2. WhatsApp: canal ainda não conectado (não é regressão)

```
whatsapp_official → ❌ code 190/467
"The session is invalid because the user logged out."
```

**Contexto dado pelo Matheus (29/07):** o WhatsApp **ainda não foi conectado com o número
correto** — o que está no banco é o resquício do número de **teste** do App Review
(WABA `1009216938525176`, phone `1268473659671917`) com token de **sessão humana**, que morreu
quando o usuário deslogou. Ou seja: a ausência de mensagens desde 30/06 é esperada, não é falha
de código.

Estado real por canal, medido hoje:

| Canal | Token | Último recebimento | Situação |
|---|---|---|---|
| Instagram | ✅ válido | **29/07 12:19 (hoje)** | funcionando |
| Messenger | ✅ válido | 23/07 | funciona, mas sem `message_echoes` |
| WhatsApp | ❌ 190/467 | 30/06 | **nunca conectado com o número real** |

Portanto o WhatsApp não precisa de "conserto": precisa de **primeira conexão feita do jeito
certo**. Duas escolhas, e vale decidir antes de mexer:

- **(a) Conexão manual agora** — número real na WABA + token de **System User** (não expira).
  Rápido, resolve a JM Store hoje, e é o caminho que a UI atual já suporta.
- **(b) Esperar o Embedded Signup v4** (Etapa D) e conectar a JM Store pelo mesmo fluxo dos
  clientes. Mais demorado, mas o onboarding fica testado pelo dono antes de vender.

Recomendação: **(a) agora** — a JM Store é o tenant de produção e serve de referência para
validar a Etapa C. Nunca usar token de sessão humana de novo, em nenhum dos dois caminhos.

### 2.1 Segundo achado no painel da Meta

Os `subscribed_fields` da página são hoje apenas:

```
messages | messaging_postbacks | name
```

Falta **`message_echoes`** — é o campo que faz a mensagem enviada pelo app do Messenger
aparecer no CRM. O código da v26 já trata echo (`registrarEcho`), mas a Meta nunca envia.
No Instagram os echoes chegam dentro de `messages`, por isso IG funciona e Messenger não.

---

## 3. Achados novos que o handoff não pegou

Três problemas que **detonam no exato momento em que o segundo cliente conectar um canal** —
mais graves que o roteamento errado, porque quebram o tenant que já funcionava.

### 3.1 `.single()` sem `empresa_id` — bomba armada

Na Edge Function, toda leitura de config é:

```ts
.from("configuracoes_sistema").select("valor").eq("chave", "whatsapp_official").single()
```

Sem filtro de `empresa_id`. Com dois tenants configurados, a query retorna 2 linhas e
`.single()` **erra** → o envio para de funcionar **para todos**, inclusive para a JM Store.
Mesmo padrão em `getChannelToken()`, `salvarMidiaWhatsApp()` e no `action=send_meta`.

### 3.2 Match de lead sem `empresa_id` — vazamento entre empresas

```ts
.from("leads").select("id, nome, instagram").eq("origem_id", origemId).eq("ativo", true).maybeSingle()
```

Se dois clientes do CRM tiverem o mesmo consumidor (mesmo telefone ou mesmo PSID), a mensagem
entra na conversa **da outra empresa**. Vale para `upsertLead()` e `registrarEcho()`.
Isso é vazamento de dado entre tenants, não só roteamento.

### 3.3 Mídia de todos os tenants num bucket público

`salvarMidia()` grava em `chat-midia` no path `${EMPRESA_ID}/…` — bucket **público**.
Com multi-tenant, a pasta continuaria `1/` para todos e qualquer URL vazada é acessível sem
autenticação. Trocar para path por tenant + bucket privado com URL assinada.

---

## 4. Ordem de execução recomendada

Diferente do handoff: **destravar o WhatsApp vem antes de versionar**, porque o CRM está
operando sem WhatsApp há um mês e a versionagem (o motivo original do "Passo 0 primeiro")
já está feita.

### Etapa A — Conectar o WhatsApp da JM Store (número real) e completar o Messenger
*Não mexe em multi-tenant. Deixa os 3 canais vivos para o dono.*

1. **[Lucas, painel da Meta]** Adicionar o **número real** na WABA da JM Store:
   WhatsApp Manager → *Add phone number* → verificar por SMS/voz.
   (O número não pode estar ativo em app do WhatsApp comum/Business — precisa ser removido de
   lá antes, e a migração apaga o histórico daquele aparelho. Decidir qual número usar.)
2. **[Lucas, painel da Meta]** Gerar token permanente de **System User**:
   Business Settings → Users → System Users → criar/usar um com role sobre o app
   `952241517333998` → *Generate token* → marcar `whatsapp_business_messaging` +
   `whatsapp_business_management` → **desmarcar** a expiração de 60 dias.
3. **[Lucas]** Em Configurações → WhatsApp, colar o token novo + o `phone_number_id` e o
   `waba_id` do número real (a UI grava em `whatsapp_official`, chave que a Edge lê de fato —
   esse caminho está correto).
4. **[código]** Assinar o webhook da WABA: `POST /{WABA_ID}/subscribed_apps` sem corpo —
   sem isso o número não entrega evento nenhum, mesmo com token válido.
5. **[código]** Registrar o número no Cloud API: `POST /{phone_number_id}/register`
   com PIN de 6 dígitos (guardar o PIN).
6. **[Lucas, painel da Meta]** App Dashboard → Webhooks → **Messenger**: adicionar o campo
   `message_echoes`. (IG não precisa — lá o echo vem dentro de `messages`.)
7. **[Lucas]** Cadastrar **forma de pagamento** na WABA — sem cartão o Cloud API não envia
   (a Meta cobra o uso direto do titular da WABA).
8. **[verificar]** Rodar `node scripts/diagnostico-meta.mjs` e confirmar ✅ nos 3 canais;
   depois enviar e receber uma mensagem de teste em cada um.

### Etapa B — Endurecer e unificar (sem mudar comportamento)
*Barato, reversível, remove a dívida que atrapalha a Etapa C.*

6. Unificar as chaves `meta_instagram`/`instagram` e `meta_messenger`/`messenger` num
   namespace só + migrar as rows (hoje duplicadas com o mesmo valor).
7. Validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com o App Secret) antes de
   processar qualquer POST.
8. Fechar `?action=send` / `?action=send_meta`: exigir JWT do usuário ou mover o envio para a
   Next API (que já valida `auth.getUser()`).
9. Remover o fallback hardcoded `"jmstore2024"` do verify token; exigir a env.
10. Subir Graph `v19.0` → `v25.0` (Edge + `configuracoes-view.tsx` + `official-card.tsx`).
11. Extrair a URL do webhook hardcoded em 3 lugares; apagar `official-card.tsx` e
    `evolution-card.tsx` (código morto, não importados).
12. Baseline de migrations em `supabase/migrations/` (dump do schema atual) — o que de fato
    falta versionar.

### Etapa C — Espinha multi-tenant
*O que destrava o segundo cliente. Critério de pronto: dois tenants isolados ponta a ponta.*

13. Tabela `canais_conectados` (`empresa_id`, `tipo`, `external_id`, `access_token_enc`,
    `token_expira_em`, `data_access_expira_em`), `unique (tipo, external_id)`, RLS de tenant,
    token **nunca** exposto ao client. Reusar `lib/payments/crypto.ts` (AES-256-GCM) com chave
    própria `CHANNEL_ENCRYPTION_KEY`.
14. Backfill das rows de canal da empresa 1.
15. **Roteamento por `external_id`:** ler `value.metadata.phone_number_id` (WhatsApp) e
    `entry[].id` (IG/Messenger) → buscar `empresa_id` → usar em toda escrita. Sem match,
    ignorar. Remover `const EMPRESA_ID = 1`.
16. Corrigir os 3 achados da seção 3: filtro `empresa_id` em toda leitura de config
    (`.single()` → `.maybeSingle()` com filtro), `empresa_id` no match de lead/echo, e mídia
    em path por tenant com bucket privado.
17. Teste de aceite: empresa 2 conecta canal próprio, recebe e envia, e **nada** cruza com a
    empresa 1 (nem lead, nem mídia, nem config).

### Etapa D — Onboarding automático (Embedded Signup v4)
*Só depois da Etapa C. Prazo real: v2 morre em 15/10/2026 — construir direto no v4.*

18. `.env.example`: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`,
    `WEBHOOK_VERIFY_TOKEN`, `CHANNEL_ENCRYPTION_KEY`, `META_FLFB_CONFIG_ID`.
19. Configuração FLFB no App Dashboard → `config_id`.
20. WhatsApp: JS SDK → `postMessage WA_EMBEDDED_SIGNUP` → code para rota server → troca por
    business token → `debug_token` → grava cifrado → `POST /{WABA_ID}/subscribed_apps` →
    `POST /{phone_number_id}/register` (prazo de 14 dias).
21. IG/Messenger: `FB.login` com `config_id` → `GET /me/accounts` → guardar **Page token**
    (não o user token) → `POST /{page-id}/subscribed_apps` com os campos, **incluindo
    `message_echoes`**.
22. Tela "Canais conectados" por tenant: ativo/expirado/erro + botão reconectar; tratar
    `OAuthException 190` como "re-rodar signup deste tenant".
23. Tela de **forma de pagamento**: Tech Provider não compartilha linha de crédito — cada
    cliente cadastra cartão na própria WABA, senão conecta e não envia (ponto conhecido de
    desistência).

---

## 5. Decisões de produto ainda abertas

1. **Cobrança da API pela Meta direto no cliente** — como entra na proposta comercial.
2. **Trilha do Instagram:** seguir com Facebook Login (as 8 permissões aprovadas são dessa
   trilha) ou migrar para Instagram Login (sem Página, mas exige nova submissão).
3. ~~**Evolution API:** aposentar agora que o Cloud API está aprovado?~~ **DECIDIDO 31/07/2026:
   removida por inteiro** — código, tela, rota e a linha no banco (que ainda guardava uma API
   key em texto claro). O risco maior não era o número do cliente ser banido, era o app da
   Meta; e a coexistência resolveu o motivo pelo qual o lojista resistia ao caminho oficial.
4. **Limite de 10 clientes novos/7 dias** — sobe para 200 com Access Verification. Correr atrás
   antes do lançamento se a expectativa de venda for maior.

---

## 6. Ferramenta de diagnóstico

Script read-only que testa os tokens contra a Graph API e mostra os `subscribed_fields` de cada
página/WABA **sem imprimir segredos** — usar sempre antes e depois de mexer em canal:

`scripts/diagnostico-meta.mjs` (rodar com `node scripts/diagnostico-meta.mjs`)

Saída de 29/07/2026: IG ✅, Messenger ✅ (sem `message_echoes`), WhatsApp ❌ 190/467.
