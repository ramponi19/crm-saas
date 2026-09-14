// ============================================================================
// webhook-leads v27 — recebimento e envio Meta MULTI-TENANT
//
// O que muda em relação à v26 (single-tenant):
//   1. Não existe mais `EMPRESA_ID = 1`. A empresa é descoberta pelo identificador
//      que a Meta já manda em cada evento e que a v26 ignorava:
//        WhatsApp  → value.metadata.phone_number_id
//        Messenger → entry[].id  (id da Página)
//        Instagram → entry[].id  (id da CONTA DO INSTAGRAM — não é o da Página!)
//      A tradução identificador → empresa vive em `canais_conectados`.
//   2. Webhook sem `X-Hub-Signature-256` válida é recusado (403).
//   3. `action=send` / `send_meta` exigem JWT de usuário e conferem se ele é da
//      empresa dona do lead. Antes bastava a anon key, que é pública.
//   4. Toda leitura/gravação é escopada por empresa: config, match de lead e echo.
//   5. Token do canal vem cifrado do banco (AES-256-GCM) e é decifrado aqui.
//   6. Mídia vai para pasta por empresa.
//   7. Coexistência: `smb_message_echoes` (enviada pelo celular),
//      `smb_app_state_sync` (contatos) e `history` (6 meses) são processados.
//   8. `account_update` marca o canal como desconectado em vez de morrer calado.
//
// Deploy: `supabase functions deploy webhook-leads --no-verify-jwt`
//   verify_jwt PRECISA ser false — a Meta não manda JWT. A autenticação do envio
//   é feita à mão dentro da função.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const GRAPH = Deno.env.get("META_GRAPH_VERSION") ?? "v25.0";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
/**
 * Segredo do app do INSTAGRAM — outro par, nao o do Facebook.
 *
 * A Meta assina o webhook com o segredo do app QUE ORIGINOU a assinatura. O
 * conector "Instagram API with Instagram Login" tem app id e app secret proprios
 * (aba Instagram do mesmo app na Meta), entao o webhook dele chega assinado com
 * ESTE segredo. Validar so com o do Facebook recusava tudo com 403 — foi o que
 * aconteceu em 27/08/2026: a Meta entregava, o log dizia "assinatura invalida" e a
 * mensagem nunca virava lead.
 */
const INSTAGRAM_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WEBHOOK_VERIFY_TOKEN") ?? "";
const CHANNEL_KEY_RAW = Deno.env.get("CHANNEL_ENCRYPTION_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ok = () => new Response("ok", { status: 200, headers: cors });

// ── Cripto ──────────────────────────────────────────────────────────────────
function bytesDaChave(raw: string): Uint8Array {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const b = new Uint8Array(32);
    for (let i = 0; i < 32; i++) b[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
    return b;
  }
  return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
}

// Decifra o formato de lib/canais/crypto.ts: base64(iv).base64(tag).base64(ct).
// O Web Crypto espera ciphertext||tag concatenados — daí a junção.
async function decifrarToken(cifrado: string | null): Promise<string | null> {
  try {
    if (!cifrado || !CHANNEL_KEY_RAW) return null;
    const [ivB64, tagB64, ctB64] = cifrado.split(".");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(tagB64), (c) => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    const juntos = new Uint8Array(ct.length + tag.length);
    juntos.set(ct); juntos.set(tag, ct.length);
    /**
     * O `as BufferSource` é variância de TIPO, não conserto de comportamento.
     *
     * Nas versões novas do TS, `Uint8Array` é genérico no buffer:
     * `Uint8Array.from(...)` produz `Uint8Array<ArrayBufferLike>`, e
     * `BufferSource` exige `ArrayBufferView<ArrayBuffer>` — daí a reclamação de
     * que `SharedArrayBuffer` não serviria. Aqui não pode ser um: o buffer é
     * construído duas linhas acima, dentro de `bytesDaChave`.
     *
     * Anotação em vez de mexer no corpo de `bytesDaChave` de propósito: esta
     * função decifra o token de TODOS os canais, e uma anotação é apagada na
     * compilação — não muda um byte do que roda.
     */
    const key = await crypto.subtle.importKey(
      "raw", bytesDaChave(CHANNEL_KEY_RAW) as BufferSource, "AES-GCM", false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, juntos));
  } catch (e) {
    console.error("decifrarToken falhou:", (e as Error).message);
    return null;
  }
}

/** Confere a assinatura contra UM segredo. Comparacao em tempo constante. */
async function assinaturaConfere(segredo: string, recebido: string, corpoCru: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpoCru));
  const esperado = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

/**
 * Assinatura do webhook: HMAC-SHA256 do corpo CRU com o App Secret.
 * Sem isso, quem descobre a URL injeta lead falso.
 *
 * ACEITA DOIS SEGREDOS, e isso NAO afrouxa nada: os dois sao nossos, do mesmo app
 * na Meta. A Meta assina com o segredo do app que originou a assinatura do webhook —
 * o do Facebook para WhatsApp, Pagina e Instagram-via-Pagina; o do Instagram para o
 * conector com login do Instagram. Como `object=instagram` chega pelos DOIS
 * caminhos, nao da para escolher o segredo pelo tipo do evento: tenta um, tenta o
 * outro. Quem nao tem nenhum dos dois continua sendo recusado.
 */
async function assinaturaValida(req: Request, corpoCru: string): Promise<boolean> {
  if (!APP_SECRET && !INSTAGRAM_APP_SECRET) {
    console.error("nenhum app secret configurado — sem como validar assinatura");
    return false;
  }
  const header = req.headers.get("x-hub-signature-256");
  if (!header || !header.startsWith("sha256=")) return false;
  const recebido = header.slice(7);

  if (APP_SECRET && await assinaturaConfere(APP_SECRET, recebido, corpoCru)) return true;
  if (INSTAGRAM_APP_SECRET && await assinaturaConfere(INSTAGRAM_APP_SECRET, recebido, corpoCru)) return true;
  return false;
}

// ── Resolução do tenant ─────────────────────────────────────────────────────
type Canal = {
  id: number; empresa_id: number; tipo: string; external_id: string;
  waba_id: string | null; token: string | null; coexistencia: boolean;
  /**
   * Como o canal foi conectado. Decide o ENVIO:
   *   'pagina'    → graph.facebook.com/{id da Pagina}/messages, token da Pagina
   *   'instagram' → graph.instagram.com/{id da conta}/messages, token da conta
   *
   * Existe porque uma Pagina do Facebook aceita UM Instagram profissional, e a
   * loja que so tem Instagram (ou a segunda loja da rede) precisa do caminho do
   * "Instagram API with Instagram Login", que dispensa Pagina.
   */
  via: string;
  /** Loja que o canal atende. Nulo = da rede. Usado para achar a Pagina certa. */
  filial_id: number | null;
  /**
   * Nome da conta/pagina como o lojista a conhece ("@jmstore_jaguariuna").
   *
   * Entra por causa da mensagem de erro: dizer "a conta X nao conhece esta
   * conversa" e o que permite ao vendedor entender que a resposta saiu pela
   * conta da outra loja. Sem o nome, o erro nao aponta para nada.
   */
  nome_exibicao: string | null;
};
const cache = new Map<string, Canal | null>();

function montar(data: Record<string, unknown>, token: string | null): Canal {
  return {
    id: data.id as number, empresa_id: data.empresa_id as number, tipo: data.tipo as string,
    external_id: String(data.external_id ?? ""), waba_id: (data.waba_id as string | null) ?? null,
    token, coexistencia: !!data.coexistencia,
    via: (data.via as string | null) ?? "pagina",
    filial_id: (data.filial_id as number | null) ?? null,
    nome_exibicao: (data.nome_exibicao as string | null) ?? null,
  };
}

// Mensagem que chega para um identificador que não conhecemos era DESCARTADA em
// silêncio. Cenário real e iminente: ao migrar o número para outra conta da Meta
// ele ganha um `phone_number_id` NOVO, e entre a migração e a reconexão as
// mensagens do cliente sumiriam sem deixar rastro em lugar nenhum.
// Agora sobra registro: fica no log da função e numa linha de diagnóstico, para
// eu conseguir dizer QUANTAS e DE QUAL id se perderam — e reconectar sabendo.
// Nunca quebra o recebimento: falha ao registrar é ignorada de propósito.
// `campo` aceita `undefined` porque é o que os chamadores têm: ele sai de um
// campo opcional do payload do webhook. Declarado só como `string | null`, o
// `deno check` reclamava — e a conversão no chamador seria mentira, porque o
// valor realmente pode não vir.
async function eventoOrfao(tipo: string, externalId: string | undefined, campo: string | null | undefined) {
  console.error(`evento orfao: ${tipo} id=${externalId ?? "(sem id)"} campo=${campo ?? "-"} — nenhum canal conectado com este id`);
  try {
    await db.from("diagnostico_canais").insert({
      etapa: "evento_orfao",
      origem_url: null,
      dados: { tipo, externalId: externalId ?? null, campo },
    });
  } catch { /* diagnóstico nunca pode atrapalhar o recebimento */ }
}

/** Colunas que `montar` espera. Uma lista so, para os dois caminhos de busca. */
const COLUNAS = "id, empresa_id, tipo, external_id, waba_id, access_token_enc, coexistencia, via, filial_id, nome_exibicao";

async function canalPorExternalId(tipo: string, externalId: string | undefined): Promise<Canal | null> {
  if (!externalId) return null;
  const chave = `${tipo}:${externalId}`;
  const emCache = cache.get(chave);
  if (emCache !== undefined) return emCache;

  let { data } = await db.from("canais_conectados")
    .select(COLUNAS)
    .eq("tipo", tipo).eq("external_id", String(externalId)).maybeSingle();

  /**
   * SEGUNDA TENTATIVA PELO `ig_user_id`, e ela nao e paranoia.
   *
   * A Meta tem DOIS ids para a mesma conta do Instagram, e o `GET /me` do login do
   * Instagram devolve os dois: `id` (escopo do app) e `user_id` (conta
   * profissional). Qual deles vem como `entry[].id` no webhook e a unica coisa que
   * a documentacao nao diz com clareza. Gravamos os dois e procuramos pelos dois:
   * assim o lead entra independente da resposta, em vez de virar evento orfao.
   *
   * Duas consultas em vez de um `.or()` de proposito: o id vem do payload da Meta,
   * e interpolar isso na sintaxe de filtro do PostgREST seria abrir uma porta.
   */
  if (!data) {
    const alt = await db.from("canais_conectados")
      .select(COLUNAS)
      .eq("tipo", tipo).eq("ig_user_id", String(externalId)).maybeSingle();
    data = alt.data;
  }

  const canal = data ? montar(data, await decifrarToken(data.access_token_enc as string | null)) : null;
  cache.set(chave, canal);
  if (!canal) console.log(`canal desconhecido (${chave}) — evento ignorado, não cria lixo`);
  return canal;
}

// Escolhe o canal de ENVIO da empresa. Uma empresa pode ter mais de um número ou
// página no mesmo canal, então aqui NÃO se usa maybeSingle (que erra com 2 linhas
// e derrubaria o envio) — pega o conectado mais recentemente, de forma determinística.
/**
 * O CANAL PELO QUAL RESPONDER — o da LOJA do lead, não "o mais recente".
 *
 * ══ O BUG QUE ISTO CONSERTA (04/09/2026) ═══════════════════════════════════
 *
 * Isto era `canalPorEmpresa(empresaId, tipo)`: filtrava empresa + tipo e pegava
 * `order by conectado_em desc limit 1`. Com UMA loja funciona. Com duas, sempre
 * devolve o canal conectado por último — para TODOS os leads da empresa.
 *
 * A JM tem dois Instagram: `@jmstore_importados` (Mogi, filial 3, conectado
 * 27/08 17:30) e `@jmstore_jaguariuna` (Jaguariúna, filial 6, conectado 28/08
 * 11:28). Desde 28/08 11:28 toda resposta de Instagram saía pela conta de
 * Jaguariúna — inclusive para os 104 leads de Mogi.
 *
 * E o IGSID/PSID do destinatário é escopado à CONTA que recebeu a conversa.
 * Mandar o id de um lead de Mogi pela conta de Jaguariúna faz a Meta responder
 * `(#100) No matching user found` — que em pt-BR chega como
 * **"Não foi possível encontrar o usuário solicitado"**, o erro que o vendedor
 * viu hoje às 09:12 tentando responder a lead 2239.
 *
 * Ficou 7 dias invisível porque a equipe responde quase tudo pelo celular:
 * 1.631 mensagens de Instagram pelo aparelho contra 73 pelo CRM em Mogi. A
 * última que saiu do CRM em Jaguariúna é de 28/08 11:29 — um minuto depois de o
 * canal ser conectado.
 *
 * ══ A REGRA ════════════════════════════════════════════════════════════════
 *
 * Prefere o canal da loja do lead. Sem canal naquela loja, cai no mais recente
 * da empresa — que é o comportamento antigo, e é o certo para quem tem uma loja
 * só ou um canal sem loja definida (o Messenger da JM é `filial_id` nulo).
 *
 * Vale para WhatsApp também. Hoje a JM tem só o número de Mogi, então lá não
 * quebra — mas quebraria igual no dia em que Jaguariúna ganhar o seu.
 */
async function canalDaLoja(empresaId: number, tipo: string, filialId: number | null): Promise<Canal | null> {
  if (filialId != null) {
    const { data } = await db.from("canais_conectados")
      .select(COLUNAS)
      .eq("empresa_id", empresaId).eq("tipo", tipo).eq("status", "ativo")
      .eq("filial_id", filialId)
      .order("conectado_em", { ascending: false }).limit(1);
    const daLoja = data?.[0];
    if (daLoja) return montar(daLoja, await decifrarToken(daLoja.access_token_enc as string | null));
  }
  const { data } = await db.from("canais_conectados")
    .select(COLUNAS)
    .eq("empresa_id", empresaId).eq("tipo", tipo).eq("status", "ativo")
    .order("conectado_em", { ascending: false }).limit(1);
  const linha = data?.[0];
  return linha ? montar(linha, await decifrarToken(linha.access_token_enc as string | null)) : null;
}

async function marcarErroNoCanal(canalId: number, erro: string, status = "erro") {
  if (!canalId) return;
  await db.from("canais_conectados")
    .update({ status, ultimo_erro: erro.slice(0, 500), ultimo_erro_em: new Date().toISOString() })
    .eq("id", canalId);
}

// ── Autenticação do envio ───────────────────────────────────────────────────
// Antes: qualquer um com a anon key (pública, vai no bundle do front) enviava.
// Agora: exige JWT de usuário e confere vínculo com a empresa dona do lead.
// Devolve QUEM está enviando, não só se pode. O nome é o que assina a mensagem
// no aparelho do cliente — a API do WhatsApp manda tudo pelo número da loja, sem
// identidade por atendente, então o prefixo no texto é o único jeito de o
// cliente saber com quem está falando.
async function usuarioDoEnvio(req: Request, empresaId: number): Promise<{ id: string; nome: string } | null> {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!jwt || jwt === ANON_KEY || !ANON_KEY) return null;
    const cliente = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data, error } = await cliente.auth.getUser();
    if (error || !data.user) return null;
    const { data: vinculo } = await db.from("empresa_usuarios")
      .select("id").eq("empresa_id", empresaId).eq("usuario_id", data.user.id).eq("ativo", true).maybeSingle();
    if (!vinculo) return null;
    const { data: u } = await db.from("usuarios").select("nome").eq("id", data.user.id).maybeSingle();
    return { id: data.user.id, nome: ((u?.nome as string | null) ?? "").trim() };
  } catch (e) { console.error("usuarioDoEnvio:", e); return null; }
}

/**
 * Prefixo de assinatura: "Thomas - JM STORE:" na frente do que o CRM envia.
 *
 * Configurável por empresa em `configuracoes_sistema`, chave
 * `assinatura_atendente`: { ativo, incluir_empresa }. Sem linha configurada,
 * assina — é o comportamento pedido, e uma loja que não queira desliga na tela.
 *
 * A marcação `*_..._*` (negrito + itálico) vale nos TRÊS canais. Eu tinha
 * deixado Instagram e Messenger em texto puro achando que mostrariam os
 * asteriscos crus; teste do dono no app do Instagram mostrou que renderiza
 * igual ao WhatsApp.
 */
async function assinaturaDe(
  empresaId: number, nomeUsuario: string, markdown: boolean, filialId?: number | null,
): Promise<string> {
  try {
    const primeiro = nomeUsuario.split(/\s+/)[0];
    if (!primeiro) return "";
    const { data: cfg } = await db.from("configuracoes_sistema")
      .select("valor").eq("empresa_id", empresaId).eq("chave", "assinatura_atendente").maybeSingle();
    const v = (cfg?.valor ?? {}) as { ativo?: boolean; incluir_empresa?: boolean };
    if (v.ativo === false) return "";

    let quem = primeiro;
    if (v.incluir_empresa !== false) {
      /**
       * QUEM ASSINA E A LOJA, quando o canal e de uma.
       *
       * Antes lia sempre `empresas.nome`, e o resultado apareceu no primeiro Direct
       * real da Jaguariuna: a resposta chegou assinada "JM STORE IMPORTADOS", que e
       * o nome de Mogi. O cliente da loja nova recebia o nome da loja errada — e ele
       * nem sabe que existe outra.
       *
       * Canal da rede (sem filial) segue com o nome da empresa, que e o certo para o
       * canal da marca.
       */
      let nomeAssina = "";
      if (filialId != null) {
        const { data: fil } = await db.from("filiais").select("nome").eq("id", filialId).maybeSingle();
        nomeAssina = (fil?.nome as string | null) ?? "";
      }
      if (!nomeAssina) {
        const { data: emp } = await db.from("empresas").select("nome").eq("id", empresaId).maybeSingle();
        nomeAssina = (emp?.nome as string | null) ?? "";
      }
      if (nomeAssina) quem = `${primeiro} - ${nomeAssina.toUpperCase()}`;
    }
    return markdown ? `*_${quem}:_*\n` : `${quem}:\n`;
  } catch (e) {
    // Assinatura é enfeite: falhar aqui não pode impedir a resposta ao cliente.
    console.error("assinaturaDe:", e);
    return "";
  }
}

// ── Mídia ───────────────────────────────────────────────────────────────────
const TIPO_DB: Record<string, string> = { image: "imagem", video: "video", audio: "audio" };

/**
 * Tipos do WhatsApp cujo arquivo pode ser resgatado com o token do canal.
 *
 * Figurinha é imagem (webp) e documento ganhou tipo próprio, porque o chat
 * mostra nome e link em vez de tentar tocar/exibir. Antes desta lista só os três
 * primeiros eram baixados: comprovante em PDF, figurinha e localização entravam
 * no chat como o texto cru "[midia]" — o vendedor via um código, não a mensagem.
 */
const BAIXAVEIS: Record<string, string> = {
  image: "imagem", video: "video", audio: "audio", sticker: "imagem", document: "documento",
};

/**
 * FOTO E VÍDEO QUE A PRÓPRIA LOJA MANDOU NÃO SÃO GUARDADOS.
 *
 * ══ O QUE A MEDIÇÃO MOSTROU (14/09/2026) ═══════════════════════════════════
 *
 * 81% de toda a mídia do bucket é a JM ENVIANDO, não o cliente mandando — e
 * 100% disso saiu do celular da equipe (`usuario_id` nulo), nunca do CRM. Só em
 * vídeo são 623 MB contra 95 MB recebidos. O CRM guardava uma segunda cópia,
 * para sempre, de arquivo que já está no aparelho de quem enviou.
 *
 * ══ O QUE FICA E O QUE SAI ═════════════════════════════════════════════════
 *
 * SAI: imagem e vídeo de eco. São ilustração — o aparelho, a peça, a vitrine —
 * e a loja os tem na origem. Fica o registro: "Vídeo enviado pelo celular".
 *
 * FICA: **áudio**, porque é a VOZ DO VENDEDOR respondendo. Sem ele a conversa
 * fica com um lado só — o cliente pergunta e o histórico não responde. E
 * **documento**, que é contrato e comprovante: peso irrisório, valor de registro
 * alto.
 *
 * FICA TAMBÉM tudo o que o CLIENTE manda, em qualquer formato. Esse é o
 * princípio: o que o cliente envia é dele e se preserva; o que a loja envia é
 * reproduzível.
 *
 * ⚠️ A PERDA, dita na cara: quem abrir o CRM não vê mais a foto nem o vídeo que
 * a equipe mandou. Em disputa ("não é o aparelho que vocês mostraram"), a prova
 * passa a existir só no celular de quem enviou — e celular de vendedor não é
 * arquivo da empresa. Decisão consciente do dono em 14/09/2026, tomada com esse
 * risco na mesa.
 */
const ECO_NAO_GUARDA = new Set(["imagem", "video"]);

/** O que a bolha mostra no lugar do arquivo. "pelo celular" explica sozinho. */
function rotuloEco(tipoDb: string): string {
  return tipoDb === "video" ? "Vídeo enviado pelo celular" : "Foto enviada pelo celular";
}

/**
 * O que escrever quando a mensagem NÃO tem arquivo para baixar.
 *
 * Localização, contato e reação existem na conversa e precisam ser legíveis; o
 * nome técnico do tipo ("[errors]", "[edit]") é lixo interno vazando na tela de
 * quem atende.
 */
function descreverSemArquivo(t: string, m: Record<string, unknown>): string {
  const bloco = m[t] as Record<string, unknown> | undefined;
  switch (t) {
    case "location": {
      const partes = [bloco?.name, bloco?.address].filter(Boolean).map(String);
      return `📍 Localização${partes.length ? `: ${partes.join(" — ")}` : ""}`;
    }
    case "contacts": {
      const c = (m.contacts as Record<string, unknown>[] | undefined)?.[0];
      const nome = (c?.name as Record<string, unknown> | undefined)?.formatted_name;
      return `👤 Contato${nome ? `: ${String(nome)}` : ""}`;
    }
    case "reaction": return `reagiu ${String(bloco?.emoji ?? "")}`.trim();
    case "button": case "interactive":
      return String(bloco?.text ?? bloco?.title ?? "resposta de botão");
    // O texto novo vem em edit.message.text.body — NÃO em edit.text.body. Eu
    // errei o caminho e o chat mostrava "mensagem editada" tendo o texto em mãos.
    case "edit":
      return String(
        ((bloco?.message as Record<string, unknown> | undefined)?.text as Record<string, unknown> | undefined)?.body
        ?? (bloco?.text as Record<string, unknown> | undefined)?.body
        ?? (m.text as Record<string, unknown> | undefined)?.body
        ?? "mensagem editada",
      );
    // Código 131051 ("Message type unknown"): a Meta não manda o conteúdo, só o
    // erro. Não há texto para recuperar — o melhor possível é dizer o que houve.
    case "errors": case "unsupported":
      return "mensagem que o WhatsApp não envia ao CRM (enquete, chamada ou visualização única)";
    case "media_placeholder": return "[midia]";
    default: return "[midia]";
  }
}

/**
 * Traduz UMA mensagem do WhatsApp — recebida do cliente ou eco do celular — em
 * {tipo, conteudo, midiaUrl}. Existe para os dois caminhos usarem o MESMO
 * tradutor: foi justamente a lógica duplicada que deixou o eco sem baixar mídia
 * durante todo o primeiro dia de uso.
 */
async function traduzirWhatsApp(
  canal: Canal, m: Record<string, unknown>, ehEco = false,
): Promise<{ tipo: string; conteudo: string; midiaUrl: string | null }> {
  const t = String(m.type ?? "text");

  if (t === "text") {
    return { tipo: "texto", conteudo: String((m.text as Record<string, unknown> | undefined)?.body ?? ""), midiaUrl: null };
  }

  const tipoDb = BAIXAVEIS[t];
  if (!tipoDb) return { tipo: "texto", conteudo: descreverSemArquivo(t, m), midiaUrl: null };

  const bloco = m[t] as Record<string, unknown> | undefined;
  const legenda = bloco?.caption ? String(bloco.caption) : "";
  const nome = bloco?.filename ? String(bloco.filename) : "";

  // Foto e vídeo que a loja mandou pelo celular: fica o registro, não o arquivo.
  // A legenda é preservada — ela é do vendedor e não existe em outro lugar.
  if (ehEco && ECO_NAO_GUARDA.has(tipoDb)) {
    return { tipo: "texto", midiaUrl: null, conteudo: legenda || rotuloEco(tipoDb) };
  }

  const url = await salvarMidiaWhatsApp(canal, bloco?.id as string | undefined);

  if (!url) {
    // O ID da mídia vive 30 dias na Meta: com o bruto guardado o anexo ainda pode
    // ser resgatado depois. Sem o cofre ele se perde para sempre.
    await guardarBruto(canal, "midia_sem_arquivo", m);
    return { tipo: "texto", conteudo: legenda || nome || `[${tipoDb}]`, midiaUrl: null };
  }
  return { tipo: tipoDb, conteudo: legenda || nome || `[${tipoDb}]`, midiaUrl: url };
}
const MIDIA_MAX = 20 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm",
  "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav",
  // Documento que o cliente manda no chat. Sem estes o arquivo era salvo como
  // ".bin" e o navegador não sabia abrir: 31 PDFs reais da JM estão assim.
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/msword": "doc", "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
};

/**
 * PÁGINA NÃO É ANEXO.
 *
 * Quando a URL do anexo exige sessão (story e reel do Instagram, principalmente),
 * a Meta não devolve erro: devolve **200 com a página de login**. O código olhava
 * só o `res.ok` e guardava 640 kB de HTML da Instagram como se fosse o arquivo do
 * cliente — 62 vezes, 38 MB, e no chat do vendedor aparecia um "documento" que
 * não abre.
 *
 * Recusar aqui faz a mensagem cair no caminho de sempre (`guardarBruto` + rótulo
 * "publicação compartilhada"), que é honesto: não temos o arquivo.
 */
const MIME_NAO_E_MIDIA = /^(text\/html|application\/xhtml)/i;

/**
 * O REEL: a página que a Meta devolve VALE, só não como arquivo.
 *
 * Ela traz em `og:` quem postou, a legenda e o link. Guardamos esse texto (uns
 * 200 bytes) e o chat mostra o reel pelo embed oficial, que é público.
 *
 * ⚠️ NÃO guardar a capa (`og:image`): é URL de CDN e expira em dias — a capa
 * salva em 10/09 já devolvia 403 em 11/09. O embed busca a dele na hora.
 *
 * Espelha `lib/reel-instagram.ts`. São dois mundos (Deno aqui, Node no app) e a
 * Edge Function não importa de `lib/` — se mexer em um, mexa no outro.
 */
function desescaparHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function extrairReel(html: string): { shortcode: string; autor: string | null; legenda: string | null; url: string } | null {
  const meta = (p: string) => {
    const m = new RegExp(`property="${p}"\\s+content="([^"]*)"`, "i").exec(html);
    return m?.[1] ? desescaparHtml(m[1]) : null;
  };
  const url = meta("og:url");
  if (!url) return null;
  const m = /instagram\.com\/(?:([^/]+)\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  const t = /^(.*?)\s+on Instagram:\s*"?([\s\S]*?)"?$/.exec(meta("og:title") ?? "");
  return {
    shortcode: m[2],
    autor: t?.[1]?.trim() || m[1] || null,
    legenda: (t?.[2] ?? meta("og:description") ?? "").trim() || null,
    url: `https://www.instagram.com/reel/${m[2]}/`,
  };
}

/**
 * NOME ESTÁVEL PARA A MESMA MÍDIA — a peça que impede a cópia no reenvio.
 *
 * ══ O QUE ACONTECIA ════════════════════════════════════════════════════════
 *
 * O arquivo era salvo com `crypto.randomUUID()` ANTES de a mensagem ser gravada.
 * A Meta reenvia o webhook sempre que não recebe o 200 depressa — e é exatamente
 * o que acontece enquanto o CRM baixa um vídeo de 13 MB. No reenvio o fluxo
 * baixava tudo de novo, sorteava outro UUID, e só então o índice único recusava
 * a mensagem (`msg duplicada ignorada`). O arquivo ficava, para sempre.
 *
 * O ciclo se retroalimentava: quanto maior o vídeo, mais lento o download, mais
 * provável o reenvio. Medido em 11/09/2026 na JM: 1.454 arquivos órfãos (259 MB)
 * e 434 cópias byte a byte de arquivos em uso (331 MB) — 39% do bucket. O vídeo
 * de 13,4 MB estava lá 4 vezes; um de 7 MB, 7 vezes.
 *
 * ══ A CORREÇÃO ═════════════════════════════════════════════════════════════
 *
 * O caminho passa a vir do id que a Meta dá à mídia (WhatsApp) ou à mensagem
 * (Instagram/Messenger) — o MESMO em todos os reenvios. Então:
 *
 *  · já existe → devolve a URL e NÃO BAIXA NADA. Além de não duplicar, isto
 *    responde o webhook em milissegundos, o que corta o próprio reenvio que
 *    causava o problema.
 *  · não existe → baixa e grava com `upsert`. Se dois reenvios correrem juntos,
 *    os dois escrevem no mesmo caminho e sobra um arquivo, não dois.
 *
 * Sem chave (origem que não identifica a mídia) o comportamento antigo continua:
 * melhor um arquivo repetido do que mensagem sem anexo.
 */
function caminhoDaMidia(empresaId: number, chave: string, ext: string): string {
  const limpa = chave.replace(/[^A-Za-z0-9_-]/g, "").slice(-100);
  return `${empresaId}/m/${limpa}.${ext}`;
}

/**
 * Procura a mídia já salva desta chave. Null = ainda não existe.
 *
 * Isto é ECONOMIA, não a garantia: quem impede a duplicata é o `upsert` no
 * caminho determinístico logo abaixo. Se esta busca falhar, o pior que acontece
 * é baixar o arquivo de novo e sobrescrever o mesmo caminho — desperdício de
 * banda, nunca um arquivo a mais. Por isso ela nunca interrompe o fluxo.
 *
 * ⚠️ A BARRA FINAL NO PREFIXO É OBRIGATÓRIA. `list()` manda o caminho cru para
 * `storage.search()`, que casa por prefixo literal: "1/m" não encontra nada e
 * "1/m/" encontra tudo. Medido no banco de produção antes de subir — sem a
 * barra, a busca devolveria vazio para sempre, calada.
 */
async function midiaJaSalva(
  empresaId: number, chave: string,
): Promise<{ url: string; mime: string } | null> {
  try {
    const limpa = chave.replace(/[^A-Za-z0-9_-]/g, "").slice(-100);
    const { data, error } = await db.storage.from("chat-midia")
      .list(`${empresaId}/m/`, { search: limpa, limit: 20 });
    if (error || !data?.length) return null;
    // `search` é "contém", não "igual": uma chave pode aparecer dentro de outra,
    // então o nome certo é procurado na lista em vez de assumir o primeiro.
    const achado = data.find((o) => o.name.startsWith(limpa + "."));
    if (!achado) return null;
    const mime = (achado.metadata as Record<string, unknown> | null)?.mimetype as string | undefined;
    return {
      url: db.storage.from("chat-midia").getPublicUrl(`${empresaId}/m/${achado.name}`).data.publicUrl,
      mime: mime ?? "application/octet-stream",
    };
  } catch (e) { console.error("midiaJaSalva:", e); return null; }
}

// Pasta POR EMPRESA (a v26 jogava tudo em "1/"). Falha degrada para placeholder.
// Devolve o MIME junto porque no Instagram o tipo do anexo não diz o que é: um
// "share" pode ser foto, vídeo ou reel, e quem sabe de verdade é o arquivo.
type Baixado = {
  /** Nulo quando o que veio foi um reel: o cartão é o conteúdo, não há arquivo. */
  url: string | null;
  mime: string;
  reel: { shortcode: string; autor: string | null; legenda: string | null; url: string } | null;
};

async function baixarParaStorage(
  empresaId: number, url: string, chave?: string | null, bearer?: string,
): Promise<Baixado | null> {
  try {
    // Antes de gastar banda: esta mídia já veio num reenvio anterior?
    if (chave) {
      const existente = await midiaJaSalva(empresaId, chave);
      if (existente) { console.log("midia reaproveitada:", chave); return { ...existente, reel: null }; }
    }

    const res = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
    if (!res.ok) { console.error("midia download:", res.status); return null; }
    const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MIDIA_MAX) { console.log("midia acima do limite:", buf.byteLength); return null; }

    /**
     * VEIO PÁGINA, NÃO ARQUIVO — e às vezes a página é o conteúdo.
     *
     * Reel compartilhado: a Meta responde 200 com o HTML do post. Guardar isso
     * como anexo custava 640 kB e entregava um "documento" que não abre. Agora
     * vira cartão (autor, legenda, link) e o chat mostra pelo embed oficial.
     *
     * HTML que não é post (erro, login) continua recusado: nada no Storage.
     */
    if (MIME_NAO_E_MIDIA.test(ct)) {
      const reel = extrairReel(new TextDecoder().decode(buf));
      if (reel) { console.log("reel identificado:", reel.shortcode); return { url: null, mime: ct, reel }; }
      console.error("midia recusada, veio pagina sem post:", ct);
      return null;
    }

    const path = chave
      ? caminhoDaMidia(empresaId, chave, EXT[ct] ?? "bin")
      : `${empresaId}/${crypto.randomUUID()}.${EXT[ct] ?? "bin"}`;
    const { error } = await db.storage.from("chat-midia")
      .upload(path, buf, { contentType: ct, upsert: !!chave });
    if (error) { console.error("midia upload:", error.message); return null; }
    return { url: db.storage.from("chat-midia").getPublicUrl(path).data.publicUrl, mime: ct, reel: null };
  } catch (e) { console.error("baixarParaStorage:", e); return null; }
}

/** Só a URL — para quem já sabe o tipo (WhatsApp diz no payload). */
async function salvarMidia(
  empresaId: number, url: string, chave?: string | null, bearer?: string,
): Promise<string | null> {
  return (await baixarParaStorage(empresaId, url, chave, bearer))?.url ?? null;
}

/** Quem manda é o arquivo: "share" do Instagram pode ser foto, vídeo ou reel. */
function tipoPorMime(mime: string): string {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

/**
 * Anexos do Instagram/Messenger que não são foto/vídeo/áudio simples.
 *
 * Cliente que compartilha uma publicação, responde um story ou manda um reel
 * caía tudo em "[midia]" — 263 mensagens assim desde junho, na conversa de quem
 * atende. Agora o arquivo é baixado quando há URL, e o rótulo diz o que é.
 */
const ROTULO_ANEXO: Record<string, string> = {
  share: "publicação compartilhada",
  story_mention: "menção em story",
  ig_reel: "reel",
  reel: "reel",
  file: "arquivo",
  template: "mensagem com botões",
  fallback: "anexo",
  location: "📍 localização",
};

async function salvarMidiaWhatsApp(canal: Canal, mediaId: string | undefined): Promise<string | null> {
  try {
    if (!mediaId || !canal.token) return null;
    const info = await fetch(`https://graph.facebook.com/${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${canal.token}` },
    });
    if (!info.ok) { console.error("WA media info:", await info.text()); return null; }
    const meta = await info.json();
    // `mediaId` é o id que a Meta dá ao ARQUIVO: o mesmo em todos os reenvios,
    // e o mesmo quando o histórico é reprocessado. É a chave perfeita.
    return meta?.url
      ? await salvarMidia(canal.empresa_id, meta.url as string, `wa-${mediaId}`, canal.token)
      : null;
  } catch (e) { console.error("salvarMidiaWhatsApp:", e); return null; }
}

async function extrairMidiaMeta(
  canal: Canal, message: Record<string, unknown> | undefined,
): Promise<{ tipo: string; midiaUrl: string | null; texto: string }> {
  const texto = (message?.text as string) || "";
  let rotulo = "";
  try {
    const a = (message?.attachments as Record<string, unknown>[] | undefined)?.[0];
    const aType = (a?.type as string | undefined) ?? "";
    const aUrl = (a?.payload as Record<string, unknown> | undefined)?.url as string | undefined;
    rotulo = ROTULO_ANEXO[aType] ?? "";

    /**
     * STORY NÃO VIRA ARQUIVO — nem o que a loja postou, nem o que marcou a loja.
     *
     * ══ O QUE CUSTAVA ══════════════════════════════════════════════════════
     *
     * 287 MB, 21% do bucket inteiro, medido em 11/09/2026. Quando a JM publica
     * um story e marca contatos chega um echo POR MENÇÃO, e cada um baixava o
     * mesmo vídeo: 80 arquivos para 38 vídeos. As cinco cópias de um deles
     * nasceram entre 11:18:24 e 11:18:26 — três segundos.
     *
     * ══ POR QUE NÃO BAIXAR NADA ════════════════════════════════════════════
     *
     * Story expira em 24h no Instagram, e — diferente do reel — NÃO TEM
     * permalink: a URL que a Meta manda é de CDN e morre em dias. Não há cartão
     * com link a oferecer, então a escolha real é guardar o vídeo para sempre ou
     * guardar o fato.
     *
     * O fato é o que vale daqui a seis meses: "Fulano marcou a loja em 09/09 às
     * 18:50" fica na conversa, com nome e horário. O vídeo vale 24 horas — e
     * nessas 24 horas a menção está na caixa do Instagram da loja, que é onde o
     * vendedor já responde.
     *
     * ⚠️ A PERDA, dita na cara: quem abrir só o CRM não vê o que o cliente
     * postou. Foi uma escolha consciente do dono (11/09/2026), não um descuido.
     */
    /**
     * Eco de foto/vídeo no Instagram e Messenger — mesma regra do WhatsApp.
     *
     * Aqui o tipo vem do anexo (`aType`), não do arquivo. Quando ele não diz
     * ("share", "fallback"), o download acontece: é raro, e errar para o lado de
     * guardar é melhor do que descartar mídia do cliente por engano.
     */
    if (message?.is_echo && ECO_NAO_GUARDA.has(TIPO_DB[aType] ?? "")) {
      const t = TIPO_DB[aType];
      return { tipo: "texto", midiaUrl: null, texto: texto || rotuloEco(t) };
    }

    if (aType === "story_mention") {
      return {
        tipo: "texto",
        midiaUrl: null,
        texto: texto || (message?.is_echo
          ? "Contato marcado no story da loja"
          : "Marcou a loja no story do Instagram"),
      };
    }

    // BAIXA QUALQUER ANEXO COM URL — antes só image/video/audio passavam, e todo
    // o resto (share, story, reel) virava "[midia]" sem arquivo nenhum.
    if (aUrl) {
      // No Instagram/Messenger o anexo não tem id próprio, mas a MENSAGEM tem
      // (`mid`) — e é ele que o reenvio repete. Um anexo por mensagem aqui
      // (lemos `attachments[0]`), então o `mid` identifica a mídia sem ambiguidade.
      const mid = message?.mid as string | undefined;
      const salvo = await baixarParaStorage(canal.empresa_id, aUrl, mid ? `ig-${mid}` : null);
      // Reel: o CONTEÚDO é o cartão. Mesmo desenho do card de anúncio — tipo
      // próprio e JSON no texto —, e o chat sabe renderizar (`ReelChat`).
      if (salvo?.reel) {
        return { tipo: "reel", midiaUrl: null, texto: JSON.stringify(salvo.reel) };
      }
      if (salvo?.url) {
        const tipo = TIPO_DB[aType] ?? tipoPorMime(salvo.mime);
        return { tipo, midiaUrl: salvo.url, texto: texto || rotulo || `[${tipo}]` };
      }
      // URL da Meta é de CDN e expira: registrar ajuda a entender a falha depois.
      await guardarBruto(canal, "anexo_meta_sem_arquivo", message ?? {});
    }
  } catch (e) { console.error("extrairMidiaMeta:", e); }
  return { tipo: "texto", midiaUrl: null, texto: texto || rotulo || "[midia]" };
}

// ── Persistência ────────────────────────────────────────────────────────────
// Copia a foto de perfil para o Storage. A URL que a Meta devolve é de CDN e
// EXPIRA — guardá-la direto no banco daria foto quebrada em pouco tempo.
// Caminho por empresa. Qualquer falha devolve null: foto é enfeite, não pode
// atrapalhar o recebimento da mensagem.
async function salvarFotoPerfil(canal: Canal, origemId: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3 * 1024 * 1024) return null; // avatar não precisa ser grande
    const ct = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    // Nome estável por contato: refazer o upload substitui a foto antiga em vez
    // de acumular arquivo a cada mensagem.
    const path = `${canal.empresa_id}/avatares/${canal.tipo}-${origemId}.${EXT[ct] ?? "jpg"}`;
    const { error } = await db.storage.from("chat-midia")
      .upload(path, buf, { contentType: ct, upsert: true });
    if (error) { console.error("foto upload:", error.message); return null; }
    return db.storage.from("chat-midia").getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error("salvarFotoPerfil:", e); return null; }
}

/**
 * Perfil de quem enviou. O HOST depende de como o canal foi conectado.
 *
 * Token de conta do Instagram nao vale em graph.facebook.com: a resposta e
 * "Invalid OAuth access token - Cannot parse access token" (codigo 190), e o lead
 * entra SEM NOME. Foi o que aconteceu no primeiro Direct real da Jaguariuna, em
 * 27/08/2026 — a mensagem chegou, o nome nao.
 */
async function fetchProfile(id: string, token: string, fields: string, viaInstagram = false) {
  const base = viaInstagram ? "https://graph.instagram.com" : "https://graph.facebook.com";
  try {
    const r = await fetch(`${base}/${GRAPH}/${id}?fields=${fields}&access_token=${token}`);
    if (!r.ok) { console.error("profile:", id, await r.text()); return null; }
    return await r.json() as Record<string, string>;
  } catch (e) { console.error("fetchProfile:", e); return null; }
}

/**
 * O anúncio que trouxe o cliente, normalizado.
 *
 * Quem clica num anúncio do Facebook/Instagram e cai no WhatsApp chega com um
 * bloco `referral`; no Instagram e no Messenger o mesmo dado vem com OUTRO nome
 * (`ads_context_data`, `ad_id`). O CRM jogava tudo fora: o vendedor recebia
 * "Quero saber quais iPhones novos lacrados tem disponível" e não sabia de qual
 * campanha veio nem o que a pessoa tinha acabado de ler no anúncio.
 */
export interface AnuncioOrigem {
  titulo: string | null; corpo: string | null; url: string | null;
  midia: string | null; anuncio_id: string | null; plataforma: string | null;
  em: string;
}

function extrairAnuncio(m: Record<string, unknown>): AnuncioOrigem | null {
  const r = (m.referral ?? (m.message as Record<string, unknown> | undefined)?.referral) as Record<string, unknown> | undefined;
  if (!r) return null;
  const ctx = r.ads_context_data as Record<string, unknown> | undefined;

  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const anuncio: AnuncioOrigem = {
    titulo: texto(r.headline) ?? texto(ctx?.ad_title),
    corpo: texto(r.body),
    url: texto(r.source_url),
    midia: texto(r.image_url) ?? texto(r.thumbnail_url) ?? texto(ctx?.photo_url) ?? texto(ctx?.video_url),
    anuncio_id: texto(r.source_id) ?? texto(r.ad_id) ?? texto(ctx?.post_id),
    plataforma: texto(r.source_type) ?? texto(r.source) ?? null,
    em: new Date().toISOString(),
  };
  // Sem nenhuma informação útil não vale poluir a conversa com um card vazio.
  return (anuncio.titulo || anuncio.corpo || anuncio.url || anuncio.anuncio_id) ? anuncio : null;
}

async function upsertLead(canal: Canal, p: {
  nome: string | null; telefone: string | null; instagramUser: string | null;
  origem: string; origemId: string; texto: string; externalId: string | null;
  tipo?: string; midiaUrl?: string | null; fotoUrl?: string | null;
  anuncio?: AnuncioOrigem | null;
}) {
  const empresaId = canal.empresa_id;
  const tipo = p.tipo ?? "texto";
  const midiaUrl = p.midiaUrl ?? null;

  // TODA busca de lead filtra empresa_id. Sem isso (v26), dois clientes com o
  // mesmo consumidor tinham a conversa misturada — vazamento entre empresas.
  const { data: byId } = await db.from("leads")
    .select("id, nome, instagram, foto_url")
    .eq("empresa_id", empresaId).eq("origem_id", p.origemId).eq("ativo", true).maybeSingle();
  let existente = byId as { id: number; nome: string | null; instagram: string | null; foto_url?: string | null } | null;

  // Lead criado à mão tem telefone e origem_id nulo — casa pelos últimos 8 dígitos.
  if (!existente && p.origem === "whatsapp") {
    const last8 = p.origemId.replace(/\D/g, "").slice(-8);
    if (last8.length >= 8) {
      const { data: cands } = await db.from("leads")
        .select("id, nome, instagram, telefone")
        .eq("empresa_id", empresaId).eq("ativo", true)
        .is("origem_id", null).ilike("telefone", `%${last8}%`).limit(20);
      const match = (cands ?? []).find((l) => {
        const d = (l.telefone || "").replace(/\D/g, "");
        return d === p.origemId || d.slice(-8) === last8;
      });
      if (match) {
        existente = { id: match.id, nome: match.nome, instagram: match.instagram };
        await db.from("leads").update({ origem_id: p.origemId }).eq("id", match.id);
      }
    }
  }

  let leadId: number | null = existente?.id ?? null;
  if (!leadId) {
    /**
     * O LEAD NASCE NA LOJA DO CANAL.
     *
     * Sem isto o gatilho do banco decide, e ele nao tem sessao para consultar:
     * cai na matriz. Resultado observado no primeiro Direct real da Jaguariuna —
     * a mensagem entrou, mas o lead ficou em Mogi, e com a Jaguariuna selecionada
     * no topo ele era INVISIVEL para o dono. Mensagem que chega e ninguem ve e
     * pior do que mensagem que nao chega, porque ninguem vai investigar.
     *
     * Canal da rede (filial nula) continua caindo no gatilho, que manda para a
     * matriz — o certo para o canal da marca, que atende todas as lojas.
     */
    const { data: novo, error } = await db.from("leads").insert([{
      empresa_id: empresaId, nome: p.nome, telefone: p.telefone, instagram: p.instagramUser,
      origem: p.origem, origem_id: p.origemId, primeira_msg: p.texto,
      kanban_status: "novo", ativo: true, foto_url: p.fotoUrl ?? null,
      anuncio: p.anuncio ?? null,
      ...(canal.filial_id != null ? { filial_id: canal.filial_id } : {}),
    }]).select("id").single();
    if (error) {
      const { data: again } = await db.from("leads").select("id")
        .eq("empresa_id", empresaId).eq("origem_id", p.origemId).eq("ativo", true).maybeSingle();
      leadId = (again?.id as number | undefined) ?? null;
      if (!leadId) { console.error("criar lead:", error.message); return null; }
    } else leadId = novo.id as number;
  } else {
    const patch: Record<string, unknown> = {};
    if (p.nome && !existente?.nome) patch.nome = p.nome;
    if (p.instagramUser && !existente?.instagram) patch.instagram = p.instagramUser;
    // A foto SEMPRE atualiza quando vem: a pessoa pode ter trocado o avatar, e o
    // arquivo é sobrescrito no mesmo caminho (não acumula lixo no Storage).
    if (p.fotoUrl) patch.foto_url = p.fotoUrl;
    // Cliente que volta por OUTRA campanha: vale o anúncio mais recente, que é o
    // que explica esta conversa. O histórico de cada entrada fica no chat.
    if (p.anuncio) patch.anuncio = p.anuncio;
    if (Object.keys(patch).length) await db.from("leads").update(patch).eq("id", leadId);
  }

  // O ANÚNCIO ENTRA NA CONVERSA, antes da mensagem — como o cliente vê no
  // aparelho dele. Assim o vendedor lê o que a pessoa acabou de ver, e o
  // histórico guarda CADA entrada por campanha (o campo no lead só tem a última).
  // `external_id` derivado do id da mensagem: se a Meta reenviar o webhook, o
  // índice único impede um segundo card.
  if (p.anuncio) {
    await db.from("lead_mensagens").insert([{
      empresa_id: empresaId, lead_id: leadId, direcao: "recebida",
      conteudo: JSON.stringify(p.anuncio), origem: p.origem, lida: false,
      external_id: p.externalId ? `anuncio:${p.externalId}` : null,
      tipo: "anuncio", midia_url: p.anuncio.midia,
    }]);
  }

  const { error: msgErr } = await db.from("lead_mensagens").insert([{
    empresa_id: empresaId, lead_id: leadId, direcao: "recebida", conteudo: p.texto,
    origem: p.origem, lida: false, external_id: p.externalId, tipo, midia_url: midiaUrl,
  }]);
  if (msgErr) { console.log("msg duplicada ignorada:", p.externalId); return leadId; }

  /**
   * O contador de nao lidas NAO e somado aqui — quem mantem e o gatilho
   * `nao_lidas_sincroniza`, disparado pelo insert acima.
   *
   * Somar aqui era uma das tres maos que mexiam no mesmo numero, e o resultado
   * era ele derivar sem volta. O RPC `incrementar_msgs_nao_lidas` foi mantido no
   * banco como no-op justamente para esta chamada poder sair sem pressa: se uma
   * versao antiga desta funcao ainda estiver no ar, ela nao quebra nem
   * atrapalha. Ver a migracao `contador_de_nao_lidas_vira_espelho`.
   */
  await db.from("leads").update({ ultima_mensagem_at: new Date().toISOString() }).eq("id", leadId);
  await db.from("canais_conectados").update({ ultima_msg_em: new Date().toISOString() }).eq("id", canal.id);
  return leadId;
}

// Echo: mensagem enviada FORA do CRM. Nunca cria lead; só anexa a existente.
async function registrarEcho(
  canal: Canal, destinatario: string | undefined, mid: string | undefined,
  texto: string, origem: string, tipo = "texto", midiaUrl: string | null = null,
) {
  try {
    if (!destinatario || !mid) return;
    const { data: lead } = await db.from("leads").select("id")
      .eq("empresa_id", canal.empresa_id).eq("origem_id", destinatario).eq("ativo", true).maybeSingle();
    if (!lead?.id) return;
    const { error } = await db.from("lead_mensagens").insert([{
      empresa_id: canal.empresa_id, lead_id: lead.id, direcao: "enviada", conteudo: texto,
      origem, lida: true, external_id: mid, tipo, midia_url: midiaUrl,
      // Echo = a mensagem comprovadamente saiu (foi enviada pelo app do celular).
      // Sem isto ela ficava sem tique nenhum no chat, parecendo não enviada.
      status_entrega: "enviada", status_em: new Date().toISOString(),
    }]);
    if (error) { console.log("echo duplicado ignorado:", mid); return; }

    // A lista de leads é ordenada por `ultima_mensagem_at`. O recebimento já
    // atualizava; o echo não — então responder pelo CRM subia a conversa e
    // responder PELO CELULAR não, e ela afundava na lista mesmo tendo acabado
    // de ser atendida. Só depois de gravar: echo repetido não mexe na ordem.
    await db.from("leads").update({ ultima_mensagem_at: new Date().toISOString() }).eq("id", lead.id);
  } catch (e) { console.error("registrarEcho:", e); }
}

// ── Coexistência: contatos do celular ───────────────────────────────────────
// Só ATUALIZA nome de lead existente. Não cria lead a partir de contato: a agenda
// do lojista tem gente que não é lead, e criar todos entupiria o funil.
async function sincronizarContatos(canal: Canal, lista: Record<string, unknown>[]) {
  for (const item of lista) {
    try {
      const c = item.contact as Record<string, string> | undefined;
      const fone = (c?.phone_number ?? "").replace(/\D/g, "");
      const nome = c?.full_name || c?.first_name;
      if (!fone || item.action === "remove" || !nome) continue;
      const last8 = fone.slice(-8);
      const { data: leads } = await db.from("leads").select("id, nome, telefone")
        .eq("empresa_id", canal.empresa_id).eq("ativo", true)
        .or(`origem_id.eq.${fone},telefone.ilike.%${last8}%`).limit(5);
      for (const l of leads ?? []) {
        if (!l.nome || l.nome === l.telefone) await db.from("leads").update({ nome }).eq("id", l.id);
      }
    } catch (e) { console.error("contato:", e); }
  }
}

// Cofre do dado de tiro único: o payload cru entra em historico_bruto ANTES de
// qualquer processamento. Falha aqui não pode derrubar o recebimento — mas é
// logada alto, porque perder o bruto é perder a rede de segurança.
async function guardarBruto(canal: Canal, tipo: string, value: unknown) {
  try {
    const { error } = await db.from("historico_bruto").insert({
      empresa_id: canal.empresa_id, canal_id: canal.id, tipo, payload: value ?? {},
    });
    if (error) console.error("ALERTA historico_bruto NAO GRAVADO:", error.message);
  } catch (e) { console.error("ALERTA historico_bruto NAO GRAVADO:", (e as Error).message); }
}

// ── Coexistência: histórico de 6 meses ──────────────────────────────────────
// LIÇÃO DE 12/08/2026, quando o tiro único de 473 conversas rendeu ZERO:
//   1. O upsert assumia um índice único em external_id que NUNCA EXISTIU — o
//      Postgres recusava o lote inteiro ("no unique or exclusion constraint").
//      O índice agora existe (migração add_lead_mensagens_external_id_unique).
//   2. Conversa sem lead ativo era DESCARTADA ("para decidirmos depois") — mas o
//      histórico é de tiro único: descartar aqui é perder para sempre. Agora
//      TODA conversa vira lead: reativa o inativo se houver, cria se não houver.
//      O lead criado recebe ultima_mensagem_at da última mensagem REAL, então
//      conversa antiga afunda na lista e não atropela o atendimento do dia.
async function importarHistorico(canal: Canal, blocos: Record<string, unknown>[]) {
  let importadas = 0, criados = 0, reativados = 0, falhas = 0;
  let progresso: number | null = null;

  for (const bloco of blocos) {
    const erros = bloco.errors as Record<string, unknown>[] | undefined;
    if (erros && erros.length) {
      const cod = (erros[0] as { code?: number }).code;
      console.log(`histórico não compartilhado pelo cliente (código ${cod})`);
      await db.from("canais_conectados")
        .update({ sync_historico_em: new Date().toISOString(), sync_historico_pct: 100 })
        .eq("id", canal.id);
      continue;
    }
    const meta = bloco.metadata as Record<string, unknown> | undefined;
    if (meta && meta.progress != null) progresso = Number(meta.progress);

    for (const thread of (bloco.threads as Record<string, unknown>[] ?? [])) {
      const fone = String(thread.id ?? "").replace(/\D/g, "");
      if (!fone) continue;

      // Monta as linhas primeiro: a primeira/última mensagem também alimentam o
      // lead (primeira_msg, ultima_mensagem_at).
      const linhas: Record<string, unknown>[] = [];
      let ultimaEm: string | null = null;
      let primeiraTexto = "";
      for (const m of (thread.messages as Record<string, unknown>[] ?? [])) {
        const tipoMsg = String(m.type ?? "text");
        const doNegocio = !!m.to; // "to" presente = mensagem que o negócio enviou
        // O histórico não traz arquivo (vem depois, por outro evento), mas o rótulo
        // precisa ser legível: `[${tipo}]` cru virava "[errors]" e "[edit]" no chat
        // — nome interno do payload da Meta na cara de quem atende.
        const conteudo = tipoMsg === "text"
          ? ((m.text as Record<string, string> | undefined)?.body ?? "")
          : TIPO_DB[tipoMsg] ? `[${TIPO_DB[tipoMsg]}]` : descreverSemArquivo(tipoMsg, m);
        const linha: Record<string, unknown> = {
          empresa_id: canal.empresa_id,
          direcao: doNegocio ? "enviada" : "recebida", conteudo, origem: "whatsapp",
          lida: true, external_id: m.id ?? null,
          tipo: TIPO_DB[tipoMsg] ?? "texto", midia_url: null,
        };
        if (m.timestamp) {
          const iso = new Date(Number(m.timestamp) * 1000).toISOString();
          linha.created_at = iso;
          if (!ultimaEm || iso > ultimaEm) ultimaEm = iso;
        }
        if (!primeiraTexto && !doNegocio && conteudo) primeiraTexto = conteudo;
        linhas.push(linha);
      }
      if (!linhas.length) continue;

      // 1º lead ativo pelo origem_id; 2º lead criado à mão (origem_id nulo, casa
      // pelos últimos 8 dígitos — mesma regra do recebimento normal); 3º lead
      // INATIVO pelo origem_id, que é REATIVADO (o zerar do funil não pode
      // significar perder o histórico de quem volta); 4º cria.
      let leadId: number | null = null;
      const { data: ativo } = await db.from("leads").select("id")
        .eq("empresa_id", canal.empresa_id).eq("origem_id", fone).eq("ativo", true).maybeSingle();
      leadId = (ativo?.id as number | undefined) ?? null;

      if (!leadId) {
        const last8 = fone.slice(-8);
        if (last8.length >= 8) {
          const { data: cands } = await db.from("leads").select("id, telefone")
            .eq("empresa_id", canal.empresa_id).eq("ativo", true)
            .is("origem_id", null).ilike("telefone", `%${last8}%`).limit(20);
          const match = (cands ?? []).find((l) => {
            const d = (l.telefone || "").replace(/\D/g, "");
            return d === fone || d.slice(-8) === last8;
          });
          if (match) {
            leadId = match.id as number;
            await db.from("leads").update({ origem_id: fone }).eq("id", leadId);
          }
        }
      }

      if (!leadId) {
        const { data: inativo } = await db.from("leads").select("id")
          .eq("empresa_id", canal.empresa_id).eq("origem_id", fone).eq("ativo", false)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (inativo?.id) {
          leadId = inativo.id as number;
          await db.from("leads").update({ ativo: true }).eq("id", leadId);
          reativados++;
        }
      }

      if (!leadId) {
        const { data: novo, error } = await db.from("leads").insert([{
          empresa_id: canal.empresa_id, nome: fone, telefone: fone,
          origem: "whatsapp", origem_id: fone,
          primeira_msg: primeiraTexto || null,
          kanban_status: "novo", ativo: true,
          ...(ultimaEm ? { ultima_mensagem_at: ultimaEm } : {}),
        }]).select("id").single();
        if (error) { console.error("histórico criar lead:", fone, error.message); falhas++; continue; }
        leadId = novo.id as number;
        criados++;
      }

      for (const l of linhas) l.lead_id = leadId;
      const { error } = await db.from("lead_mensagens")
        .upsert(linhas, { onConflict: "external_id", ignoreDuplicates: true });
      if (error) { console.error("histórico lote:", error.message); falhas++; continue; }
      importadas += linhas.length;
      // ultima_mensagem_at REAL da conversa: histórico velho não pode passar na
      // frente do atendimento de hoje na ordenação da lista.
      if (ultimaEm) {
        await db.from("leads").update({ ultima_mensagem_at: ultimaEm }).eq("id", leadId)
          .or(`ultima_mensagem_at.is.null,ultima_mensagem_at.lt.${ultimaEm}`);
      }
    }
  }

  const patch: Record<string, unknown> = { sync_historico_em: new Date().toISOString() };
  if (progresso != null) patch.sync_historico_pct = progresso;
  await db.from("canais_conectados").update(patch).eq("id", canal.id);
  console.log(`histórico: ${importadas} mensagens, ${criados} leads criados, ${reativados} reativados, ${falhas} falhas, progresso ${progresso ?? "?"}%`);
}

// A mídia do histórico chega DEPOIS, num aviso separado que usa a chave "messages"
// em vez de "threads" — e só para mensagens dos últimos 14 dias. A mensagem já
// existe como placeholder "[midia]"; aqui ela é enriquecida com o arquivo.
// Só ATUALIZA (nunca insere): sem o destinatário no payload, inserir arriscaria
// pendurar a mídia na conversa errada.
async function enriquecerMidiaDoHistorico(canal: Canal, mensagens: Record<string, unknown>[]) {
  let enriquecidas = 0, semPlaceholder = 0;
  for (const m of mensagens) {
    try {
      const tipoMsg = String(m.type ?? "");
      const tipoDb = TIPO_DB[tipoMsg];
      const externalId = m.id as string | undefined;
      if (!tipoDb || !externalId) continue;

      const midia = m[tipoMsg] as Record<string, unknown> | undefined;
      const url = await salvarMidiaWhatsApp(canal, midia?.id as string | undefined);
      if (!url) continue;

      const legenda = midia?.caption as string | undefined;
      const { data } = await db.from("lead_mensagens")
        .update({ tipo: tipoDb, midia_url: url, ...(legenda ? { conteudo: legenda } : {}) })
        .eq("empresa_id", canal.empresa_id).eq("external_id", externalId)
        .select("id");
      if (data?.length) enriquecidas++; else semPlaceholder++;
    } catch (e) { console.error("midia do histórico:", e); }
  }
  console.log(`mídia do histórico: ${enriquecidas} anexada(s), ${semPlaceholder} sem mensagem correspondente`);
}

// ── Envio ───────────────────────────────────────────────────────────────────
async function enviarWhatsApp(canal: Canal, body: Record<string, unknown>, assinatura = "", usuarioId: string | null = null) {
  const number = body.number as string;
  const text = body.text as string | undefined;
  const leadId = body.leadId as string | undefined;
  const midiaUrl = body.midiaUrl as string | undefined;
  const tipoMidia = body.tipoMidia as "image" | "video" | "audio" | undefined;

  const comMidia = !!(midiaUrl && tipoMidia);
  const tipoDb = comMidia ? TIPO_DB[tipoMidia!] : "texto";
  // Gravado SEM a assinatura: no CRM a autoria já aparece na própria bolha, e
  // repetir "Fulano - LOJA:" em toda linha só sujaria a conversa.
  const conteudo = text || (comMidia ? `[${tipoDb}]` : "");
  const textoEnviado = text ? assinatura + text : text;
  const num = number.replace(/\D/g, "");
  const destino = num.startsWith("55") ? num : "55" + num;

  if (canal.token && canal.external_id) {
    const payload = comMidia
      ? {
          messaging_product: "whatsapp", recipient_type: "individual", to: destino, type: tipoMidia,
          [tipoMidia!]: tipoMidia === "audio"
            ? { link: midiaUrl }
            : (text ? { link: midiaUrl, caption: textoEnviado } : { link: midiaUrl }),
        }
      : { messaging_product: "whatsapp", recipient_type: "individual", to: destino, type: "text", text: { body: textoEnviado } };
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${canal.external_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.token}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      const cod = data?.error?.code as number | undefined;
      let msg = data?.error?.message ?? "erro ao enviar pelo WhatsApp";
      if (cod === 190) {
        await marcarErroNoCanal(canal.id, msg, "expirado");
      } else if (cod === 131042) {
        // A Meta cobra o uso da API do titular da conta. Sem cartão cadastrado
        // ela recusa o envio — e o erro cru não diz isso a ninguém.
        msg = "O WhatsApp está conectado, mas a conta da Meta não tem forma de pagamento. "
            + "Cadastre um cartão no WhatsApp Manager para conseguir enviar mensagens.";
        await marcarErroNoCanal(canal.id, msg, "erro");
      } else if (cod === 131047 || cod === 131051) {
        msg = "Faz mais de 24 horas desde a última mensagem do cliente. "
            + "Nesse caso o WhatsApp só permite responder por modelo aprovado.";
      }
      return json({ error: msg }, r.status);
    }
    if (leadId) {
      await db.from("lead_mensagens").insert([{
        empresa_id: canal.empresa_id, lead_id: leadId, direcao: "enviada", conteudo,
        origem: "whatsapp", lida: true, tipo: tipoDb, midia_url: midiaUrl ?? null,
        external_id: (data?.messages?.[0]?.id as string) ?? null,
        usuario_id: usuarioId,
        // Primeiro estado; o webhook depois promove para entregue/lida.
        status_entrega: "enviada", status_em: new Date().toISOString(),
      }]);
    }
    return json({ success: true, provider: "oficial", data });
  }

  // Sem token oficial não há por onde enviar. A Evolution era o fallback daqui
  // até 31/07/2026 e foi aposentada: ela usa o WhatsApp por dentro, fora dos
  // termos, e o número do cliente pode ser banido sem recurso. O motivo de
  // existir era o lojista não querer perder o WhatsApp do celular — e a
  // coexistência, aprovada agora, resolve isso pelo caminho oficial.
  return json({ error: "WhatsApp não conectado nesta empresa. Conecte em Administração > Canais." }, 502);
}

// Envio por MODELO APROVADO. É o único caminho aceito pela Meta quando passaram
// 24h sem o cliente escrever. O texto que fica gravado na conversa é o corpo do
// modelo já com as variáveis trocadas — senão o histórico mostraria "{{1}}".
async function enviarModelo(canal: Canal, body: Record<string, unknown>, usuarioId: string | null = null) {
  const number = String(body.number ?? '')
  const leadId = body.leadId as string | undefined
  const nome = String(body.modelo ?? '')
  const idioma = String(body.idioma ?? 'pt_BR')
  const params = (body.parametros as string[] | undefined) ?? []
  const previa = body.previa as string | undefined

  if (!canal.token || !canal.external_id) {
    return json({ error: 'WhatsApp sem token válido nesta empresa. Reconecte em Canais.' }, 502);
  }
  if (!nome || !number) return json({ error: "modelo e number são obrigatórios" }, 400);

  const num = number.replace(/\D/g, "");
  const destino = num.startsWith("55") ? num : "55" + num;

  const componentes = params.length
    ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p) })) }]
    : undefined;

  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${canal.external_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: destino,
      type: "template",
      template: { name: nome, language: { code: idioma }, ...(componentes ? { components: componentes } : {}) },
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    const cod = data?.error?.code as number | undefined;
    let msg = data?.error?.message ?? "erro ao enviar o modelo";
    if (cod === 132001) msg = "Este modelo não está aprovado (ou o idioma não bate). Confira em Modelos.";
    if (cod === 132000) msg = "O número de variáveis não bate com o modelo aprovado.";
    if (cod === 190) await marcarErroNoCanal(canal.id, msg, "expirado");
    if (cod === 131042) {
      msg = "A conta da Meta não tem forma de pagamento. Cadastre um cartão no WhatsApp Manager para enviar.";
      await marcarErroNoCanal(canal.id, msg, "erro");
    }
    return json({ error: msg }, r.status);
  }

  if (leadId) {
    await db.from("lead_mensagens").insert([{
      empresa_id: canal.empresa_id, lead_id: leadId, direcao: "enviada",
      conteudo: previa || `[modelo: ${nome}]`, origem: "whatsapp", lida: true,
      tipo: "texto", external_id: (data?.messages?.[0]?.id as string) ?? null,
      usuario_id: usuarioId,
      status_entrega: "enviada", status_em: new Date().toISOString(),
    }]);
  }
  return json({ success: true, modelo: nome });
}

async function enviarMeta(canal: Canal, origemId: string, body: Record<string, unknown>, assinatura = "", usuarioId: string | null = null) {
  const leadId = body.leadId as string;
  const texto = body.texto as string | undefined;
  const nomeCanal = body.canal as string;
  const midiaUrl = body.midiaUrl as string | undefined;
  const tipoMidia = body.tipoMidia as "image" | "video" | "audio" | undefined;

  if (!canal.token) return json({ error: `${nomeCanal} sem token válido. Reconecte em Configurações.` }, 502);
  const comMidia = !!(midiaUrl && tipoMidia);
  const tipoDb = comMidia ? TIPO_DB[tipoMidia!] : "texto";
  // A Send API não aceita texto + anexo na mesma mensagem.
  const message = comMidia
    ? { attachment: { type: tipoMidia, payload: { url: midiaUrl, is_reusable: true } } }
    : { text: texto ? assinatura + texto : texto };

  /**
   * DOIS CAMINHOS DE ENVIO, e o canal diz qual.
   *
   * Instagram conectado pelo login do Instagram (sem Pagina) fala com
   * graph.instagram.com usando o token da PROPRIA CONTA, e o id da URL e o da conta.
   * Instagram conectado pela Pagina fala com graph.facebook.com usando o token da
   * Pagina, e o id da URL e o da PAGINA — e o canal do IG guarda o id da conta,
   * entao a Pagina precisa ser encontrada.
   */
  let destinoUrl: string;
  if (canal.tipo === "instagram" && canal.via === "instagram") {
    /**
     * `/me/messages`, e nao `/{id}/messages`.
     *
     * O token E da conta, entao `me` a identifica sem ambiguidade — e a Meta tem
     * dois ids para a mesma conta, o do escopo do app e o da conta profissional.
     * Usar `me` tira a duvida de qual deles a API de envio espera.
     */
    destinoUrl = `https://graph.instagram.com/${GRAPH}/me/messages?access_token=${canal.token}`;
  } else {
    let pageId = canal.external_id;
    if (canal.tipo === "instagram") {
      /**
       * Acha a Pagina da MESMA LOJA, e nunca com maybeSingle.
       *
       * A versao anterior usava `maybeSingle()`: com duas Paginas na mesma empresa
       * — o que acontece assim que a rede tem duas lojas — a consulta ERRA e o envio
       * inteiro cai. E, mesmo funcionando, escolher "a Pagina da empresa" com duas
       * lojas era escolher no escuro. A loja do canal desempata; sem loja, vale a
       * conectada mais recentemente, de forma deterministica.
       */
      let q = db.from("canais_conectados").select("external_id")
        .eq("empresa_id", canal.empresa_id).eq("tipo", "messenger").eq("via", "pagina");
      if (canal.filial_id != null) q = q.eq("filial_id", canal.filial_id);
      const { data } = await q.order("conectado_em", { ascending: false }).limit(1);
      const achado = data?.[0]?.external_id;
      if (achado) pageId = String(achado);
    }
    destinoUrl = `https://graph.facebook.com/${GRAPH}/${pageId}/messages?access_token=${canal.token}`;
  }

  /**
   * `messaging_type` e da Send API da Pagina e NAO existe no caminho do Instagram
   * Login — a doc de mensagens de la descreve apenas `recipient` e `message`.
   * Mandar campo que a API nao conhece e pedir recusa por um motivo que nao tem
   * nada a ver com a mensagem.
   */
  const viaInstagram = canal.tipo === "instagram" && canal.via === "instagram";
  const corpoEnvio = viaInstagram
    ? { recipient: { id: origemId }, message }
    : { recipient: { id: origemId }, message, messaging_type: "RESPONSE" };

  const r = await fetch(destinoUrl, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpoEnvio),
  });
  const data = await r.json();
  if (!r.ok) {
    const cod = data?.error?.code as number | undefined;
    const cru = data?.error?.message ?? `erro ao enviar pelo ${nomeCanal}`;
    let msg = cru;

    /**
     * ESTE ERRO FICOU 7 DIAS INVISÍVEL. Não repetir a omissão.
     *
     * O caminho de falha só fazia `return json({error})` — sem log. Resultado:
     * de 28/08 a 04/09 toda resposta de Instagram a lead de Mogi falhou, e não
     * havia uma linha em log nenhum. O que apareceu foi o vendedor avisando.
     */
    console.error("envio_meta_falhou", JSON.stringify({
      canal: canal.id, tipo: canal.tipo, via: canal.via, filial: canal.filial_id,
      lead: leadId, destinatario: origemId, http: r.status, codigo: cod, meta: cru,
    }));

    if (cod === 190) await marcarErroNoCanal(canal.id, msg, "expirado");

    /**
     * `(#100) No matching user found` — em pt-BR "Não foi possível encontrar o
     * usuário solicitado". O id do destinatário é escopado à CONTA que recebeu
     * a conversa: este erro significa que a mensagem saiu pela conta errada, ou
     * que a pessoa apagou/bloqueou o perfil.
     *
     * A mensagem crua da Meta não diz nada disso a quem está no balcão. Trocada
     * por uma que diz o que fazer — e que nomeia a conta usada, porque foi
     * exatamente essa informação que faltou para achar o problema hoje.
     */
    if (cod === 100) {
      msg = `A ${nomeCanal === "instagram" ? "conta" : "página"} "${canal.nome_exibicao ?? canal.external_id}" `
          + "não conhece esta conversa. Ou ela pertence a outra loja, ou a pessoa apagou/bloqueou o perfil. "
          + "Se a loja tem mais de uma conta conectada, confira em Canais qual está ligada a esta loja.";
    }

    return json({ error: msg }, r.status);
  }
  await db.from("lead_mensagens").insert([{
    empresa_id: canal.empresa_id, lead_id: leadId, direcao: "enviada",
    conteudo: texto || `[${tipoDb}]`, origem: nomeCanal, lida: true,
    tipo: tipoDb, midia_url: midiaUrl ?? null, external_id: (data?.message_id as string) ?? null,
    usuario_id: usuarioId,
    status_entrega: "enviada", status_em: new Date().toISOString(),
  }]);
  return json({ success: true });
}

// ── HTTP ────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Handshake da Meta. Sem fallback chumbado: env ausente = recusa.
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (!VERIFY_TOKEN) { console.error("WEBHOOK_VERIFY_TOKEN ausente"); return new Response("nao configurado", { status: 500 }); }
    if (modo === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
    return new Response("token invalido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

  // Corpo CRU: a assinatura é sobre os bytes exatos, antes de qualquer parse.
  const corpoCru = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(corpoCru); } catch { return json({ error: "JSON inválido" }, 400); }

  const action = url.searchParams.get("action");

  // ── Envio pelo CRM ────────────────────────────────────────────────────────
  if (action === "send" || action === "send_meta" || action === "send_template") {
    try {
      const leadId = body.leadId as string | undefined;
      if (!leadId) return json({ error: "leadId obrigatório" }, 400);

      // `filial_id` do lead entra no SELECT: é ele que diz por qual conta
      // responder. Sem ele, a escolha do canal caía no "conectado por último".
      const { data: lead } = await db.from("leads")
        .select("id, empresa_id, origem_id, filial_id").eq("id", leadId).maybeSingle();
      if (!lead) return json({ error: "lead não encontrado" }, 404);

      const usuario = await usuarioDoEnvio(req, lead.empresa_id as number);
      if (!usuario) return json({ error: "não autorizado" }, 401);

      const empresaId = lead.empresa_id as number;
      const lojaDoLead = (lead.filial_id as number | null) ?? null;

      if (action === "send_template") {
        const canal = await canalDaLoja(empresaId, "whatsapp", lojaDoLead);
        if (!canal) return json({ error: "WhatsApp não conectado nesta empresa" }, 502);
        return await enviarModelo(canal, body, usuario.id);
      }

      if (action === "send") {
        if (!body.number || (!body.text && !body.midiaUrl)) {
          return json({ error: "number e text ou midiaUrl são obrigatórios" }, 400);
        }
        /**
         * Canal "vazio" quando a empresa não tem WhatsApp conectado.
         *
         * `enviarWhatsApp` sabe lidar com isso (sem token ele devolve a
         * orientação de conectar). O objeto precisa estar COMPLETO: faltavam
         * `via` e `filial_id`, e a linha seguinte lê `canal.filial_id` — que
         * chegava `undefined` na assinatura. Passou porque esta função fica
         * FORA do `tsc` do projeto (só o Deno a compila, no deploy).
         */
        const canal: Canal = (await canalDaLoja(empresaId, "whatsapp", lojaDoLead)) ?? {
          id: 0, empresa_id: empresaId, tipo: "whatsapp",
          external_id: "", waba_id: null, token: null, coexistencia: false,
          via: "pagina", filial_id: lojaDoLead, nome_exibicao: null,
        };
        return await enviarWhatsApp(canal, body, await assinaturaDe(empresaId, usuario.nome, true, canal.filial_id), usuario.id);
      }

      const nomeCanal = body.canal as string | undefined;
      if (nomeCanal !== "instagram" && nomeCanal !== "messenger") {
        return json({ error: "canal deve ser instagram ou messenger" }, 400);
      }
      if (!body.texto && !body.midiaUrl) return json({ error: "texto ou midiaUrl" }, 400);
      if (!lead.origem_id) return json({ error: "lead sem origem_id" }, 400);
      const canal = await canalDaLoja(empresaId, nomeCanal, lojaDoLead);
      if (!canal) return json({ error: `${nomeCanal} não conectado nesta empresa` }, 502);
      return await enviarMeta(canal, String(lead.origem_id), body,
        await assinaturaDe(empresaId, usuario.nome, true, canal.filial_id), usuario.id);
    } catch (e) {
      console.error("envio:", e);
      return json({ error: (e as Error).message }, 500);
    }
  }

  // ── Recebimento ───────────────────────────────────────────────────────────
  const objeto = body?.object as string | undefined;

  // Sem `object` não é a Meta. Era por aqui que entrava o webhook da Evolution,
  // aposentada em 31/07/2026 — e aquele payload não era assinado por ninguém, o
  // que fazia deste o único caminho de entrada sem verificação de origem.
  // Agora quem não se identifica como Meta é simplesmente ignorado.
  if (!objeto) return ok();

  // Daqui para baixo é Meta: assinatura obrigatória.
  if (!(await assinaturaValida(req, corpoCru))) {
    // IDENTIFICA quem foi recusado. Antes o log dizia só "assinatura inválida",
    // e o resultado era ~2.000 recusas por dia sem nome: impossível saber se era
    // ataque, app Meta a mais apontando para esta URL, ou segredo trocado. Com o
    // `object` e o id da conta dá para achar a origem no painel da Meta.
    //
    // Só metadado de roteamento — nada do conteúdo da mensagem vai para o log.
    const entrada = (body.entry as Record<string, unknown>[] | undefined)?.[0];
    const contas = (body.entry as Record<string, unknown>[] | undefined)
      ?.map((e) => e?.id).filter(Boolean).slice(0, 5);
    console.error(
      "assinatura invalida — recusado |",
      `object=${objeto}`,
      `contas=${JSON.stringify(contas ?? [])}`,
      `campos=${JSON.stringify(((entrada?.changes as Record<string, unknown>[] | undefined) ?? []).map((c) => c?.field))}`,
      `temAssinatura=${!!req.headers.get("x-hub-signature-256")}`,
      // Os DOIS, porque "segredoConfigurado=true" com o segredo errado foi
      // exatamente o que me fez procurar no lugar errado.
      `segredoFacebook=${!!APP_SECRET}`,
      `segredoInstagram=${!!INSTAGRAM_APP_SECRET}`,
    );
    return new Response("assinatura invalida", { status: 403, headers: cors });
  }

  try {
    if (objeto === "whatsapp_business_account") {
      for (const entry of (body.entry as Record<string, unknown>[] ?? [])) {
        for (const ch of (entry.changes as Record<string, unknown>[] ?? [])) {
          const campo = ch.field as string | undefined;
          const value = ch.value as Record<string, unknown> | undefined;
          const meta = value?.metadata as Record<string, unknown> | undefined;
          const canal = await canalPorExternalId("whatsapp", meta?.phone_number_id as string | undefined);
          if (!canal) { await eventoOrfao("whatsapp", meta?.phone_number_id as string | undefined, campo); continue; }

          // Mensagem recebida do cliente final
          if (campo === "messages" || (!campo && value?.messages)) {
            const msgs = value?.messages as Record<string, unknown>[] | undefined;
            const contatos = value?.contacts as Record<string, unknown>[] | undefined;
            for (const m of msgs ?? []) {
              const fone = m.from as string;
              const t = m.type as string | undefined;

              // Sob coexistência o app ganha editar e apagar mensagem, e isso
              // chega como tipo de mensagem. Tratado de forma defensiva: a doc
              // não fecha o formato do payload, então tenta os caminhos
              // conhecidos e REGISTRA quando não reconhece — assim o tráfego
              // real nos ensina o formato em vez de falhar calado.
              if (t === "edit" || t === "revoke") {
                // `original_message_id` é o nome que o tráfego real usa (visto no
                // histórico da JM); `message_id` fica como alternativa.
                const alvo = (m.edit as Record<string, unknown> | undefined)?.original_message_id
                  ?? (m.edit as Record<string, unknown> | undefined)?.message_id
                  ?? (m.revoke as Record<string, unknown> | undefined)?.original_message_id
                  ?? (m.revoke as Record<string, unknown> | undefined)?.message_id
                  ?? (m.context as Record<string, unknown> | undefined)?.id;
                if (!alvo) { console.log(`${t} sem id da mensagem original — payload:`, JSON.stringify(m).slice(0, 300)); continue; }
                if (t === "revoke") {
                  await db.from("lead_mensagens")
                    .update({ conteudo: "[mensagem apagada]", tipo: "texto", midia_url: null })
                    .eq("empresa_id", canal.empresa_id).eq("external_id", String(alvo));
                } else {
                  const bloco = m.edit as Record<string, unknown> | undefined;
                  const novo = ((bloco?.message as Record<string, unknown> | undefined)?.text as Record<string, unknown> | undefined)?.body
                    ?? (bloco?.text as Record<string, unknown> | undefined)?.body
                    ?? (m.text as Record<string, unknown> | undefined)?.body;
                  if (novo) {
                    await db.from("lead_mensagens").update({ conteudo: String(novo) })
                      .eq("empresa_id", canal.empresa_id).eq("external_id", String(alvo));
                  }
                }
                continue;
              }
              const { tipo, conteudo: texto, midiaUrl } = await traduzirWhatsApp(canal, m);
              await upsertLead(canal, {
                nome: ((contatos?.[0]?.profile as Record<string, unknown> | undefined)?.name as string) ?? null,
                telefone: fone, instagramUser: null, origem: "whatsapp", origemId: fone,
                texto, externalId: (m.id as string) ?? null, tipo, midiaUrl,
                anuncio: extrairAnuncio(m),
              });
            }
          }

          // Confirmação de entrega: enviada → entregue → lida, ou falhou com motivo.
          // ATENÇÃO: NÃO existe campo "statuses" para assinar. A Meta manda isto no
          // MESMO campo `messages`, com um bloco `statuses` no lugar de `messages`
          // (confirmado na referência oficial do webhook). Por isso a condição olha
          // o CONTEÚDO e não o nome do campo — checar o nome deixaria isto morto.
          if (value?.statuses) {
            for (const s of (value?.statuses as Record<string, unknown>[] ?? [])) {
              const id = s.id as string | undefined;
              if (!id) continue;
              const bruto = String(s.status ?? "");
              const mapa: Record<string, string> = {
                sent: "enviada", delivered: "entregue", read: "lida", failed: "falhou",
              };
              const status = mapa[bruto];
              if (!status) continue;

              const erro = (s.errors as Record<string, unknown>[] | undefined)?.[0];
              const patch: Record<string, unknown> = {
                status_entrega: status,
                status_em: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString(),
              };
              if (status === "falhou" && erro) {
                const cod = Number(erro.code);
                // Traduz os motivos que o lojista vê com mais frequência; o resto
                // usa o texto da própria Meta.
                const conhecidos: Record<number, string> = {
                  131049: "Não entregue: a Meta limitou o envio para proteger o ecossistema. Espere o cliente responder.",
                  131047: "Fora da janela de 24h — só modelo aprovado é aceito.",
                  131026: "Número não tem WhatsApp ou não pode receber mensagem.",
                  131042: "A conta da Meta está sem forma de pagamento.",
                  470: "Fora da janela de 24h — use um modelo aprovado.",
                };
                patch.erro_envio = (conhecidos[cod]
                  ?? String(erro.title ?? erro.message ?? "falha no envio")).slice(0, 300);
              }
              await db.from("lead_mensagens").update(patch)
                .eq("empresa_id", canal.empresa_id).eq("external_id", id);
            }
          }

          // COEXISTÊNCIA: o vendedor respondeu pelo app do celular
          if (campo === "smb_message_echoes") {
            for (const e of (value?.message_echoes as Record<string, unknown>[] ?? [])) {
              /**
               * O ECO PASSA PELO MESMO TRADUTOR DO RECEBIMENTO — era o que faltava.
               *
               * Antes o eco só montava "[audio]" e nunca resgatava o arquivo, então
               * áudio e foto que o vendedor mandava PELO CELULAR entravam no chat
               * como texto cru: bolha sem player, sem anexo, sem aviso. No Instagram
               * não aparecia porque lá o eco traz a URL direta no attachment; no
               * WhatsApp vem um ID que precisa ser trocado pelo arquivo com o token.
               */
              // `true`: e eco, a loja que mandou. Foto e video viram registro, nao arquivo.
              const { tipo, conteudo, midiaUrl } = await traduzirWhatsApp(canal, e, true);
              // No echo o cliente é o "to" — o "from" é o número do negócio.
              await registrarEcho(canal, String(e.to ?? "").replace(/\D/g, ""), e.id as string,
                conteudo, "whatsapp", tipo, midiaUrl);
            }
          }

          // COEXISTÊNCIA: contatos da agenda do celular
          if (campo === "smb_app_state_sync") {
            await guardarBruto(canal, "smb_app_state_sync", value);
            await sincronizarContatos(canal, (value?.state_sync as Record<string, unknown>[]) ?? []);
            await db.from("canais_conectados")
              .update({ sync_contatos_em: new Date().toISOString() }).eq("id", canal.id);
          }

          // COEXISTÊNCIA: histórico de 6 meses (pode vir aos milhares por evento)
          if (campo === "history") {
            // BRUTO ANTES DE PROCESSAR — sempre. O sync é de tiro único: em
            // 12/08/2026 um bug no processamento queimou 473 conversas porque o
            // corpo do webhook não existia em lugar nenhum para reprocessar.
            await guardarBruto(canal, "history", value);
            const h = value?.history as Record<string, unknown>[] | undefined;
            if (h) await importarHistorico(canal, h);
            // Mesmo campo "history", outra forma: aviso só com as mídias.
            const soltas = value?.messages as Record<string, unknown>[] | undefined;
            if (soltas?.length) await enriquecerMidiaDoHistorico(canal, soltas);
          }

          // Canal caiu: marca em vez de morrer calado
          if (campo === "account_update") {
            const evt = String(value?.event ?? "");
            if (/OFFBOARD|PARTNER_REMOVED|DISCONNECT|DOWNGRADE/i.test(evt)) {
              await marcarErroNoCanal(canal.id, `Meta informou: ${evt}`, "desconectado");
              console.log(`canal ${canal.id} desconectado (${evt})`);
            } else if (/RECONNECT/i.test(evt)) {
              await db.from("canais_conectados")
                .update({ status: "ativo", ultimo_erro: null }).eq("id", canal.id);
            }
          }
        }
      }
    }

    else if (objeto === "page" || objeto === "instagram") {
      const tipo = objeto === "page" ? "messenger" : "instagram";
      for (const entry of (body.entry as Record<string, unknown>[] ?? [])) {
        const canal = await canalPorExternalId(tipo, entry?.id as string | undefined);
        if (!canal) { await eventoOrfao(tipo, entry?.id as string | undefined, null); continue; }
        for (const m of (entry.messaging as Record<string, unknown>[] ?? [])) {
          // IG/Messenger confirmam entrega e leitura em eventos próprios, que
          // trazem a lista de ids (delivery) ou um marco de tempo (read).
          const entrega = m.delivery as Record<string, unknown> | undefined;
          if (entrega?.mids) {
            for (const mid of (entrega.mids as string[])) {
              await db.from("lead_mensagens")
                .update({ status_entrega: "entregue", status_em: new Date().toISOString() })
                .eq("empresa_id", canal.empresa_id).eq("external_id", mid);
            }
            continue;
          }
          const leitura = m.read as Record<string, unknown> | undefined;
          if (leitura) {
            // Só há o "até quando" foi lido: marca como lidas as enviadas ao
            // cliente até esse instante, que é a semântica do evento.
            const cliente = (m.sender as Record<string, unknown> | undefined)?.id as string | undefined;
            const ate = leitura.watermark ? new Date(Number(leitura.watermark)).toISOString() : null;
            if (cliente && ate) {
              const { data: lead } = await db.from("leads").select("id")
                .eq("empresa_id", canal.empresa_id).eq("origem_id", cliente).eq("ativo", true).maybeSingle();
              if (lead?.id) {
                await db.from("lead_mensagens")
                  .update({ status_entrega: "lida", status_em: new Date().toISOString() })
                  .eq("lead_id", lead.id).eq("direcao", "enviada").lte("created_at", ate)
                  .in("status_entrega", ["enviada", "entregue"]);
              }
            }
            continue;
          }

          const message = m.message as Record<string, unknown> | undefined;
          const mid = message?.mid as string | undefined;
          const midia = await extrairMidiaMeta(canal, message);

          if (message?.is_echo) {
            await registrarEcho(canal, (m.recipient as Record<string, unknown> | undefined)?.id as string | undefined,
              mid, midia.texto, tipo, midia.tipo, midia.midiaUrl);
            continue;
          }
          const remetente = (m.sender as Record<string, unknown> | undefined)?.id as string | undefined;
          if (!remetente) continue;

          let nome: string | null = null;
          let username: string | null = null;
          let fotoUrl: string | null = null;
          if (canal.token) {
            // profile_pic vem em IG e Messenger; a URL é de CDN e EXPIRA, por isso
            // a imagem é copiada para o Storage logo abaixo.
            const campos = tipo === "instagram" ? "name,username,profile_pic" : "name,first_name,profile_pic";
            const p = await fetchProfile(remetente, canal.token, campos, canal.via === "instagram");
            nome = p?.name || p?.username || p?.first_name || null;
            username = p?.username || null;
            if (p?.profile_pic) fotoUrl = await salvarFotoPerfil(canal, remetente, p.profile_pic);
          }
          await upsertLead(canal, {
            nome, telefone: null, instagramUser: tipo === "instagram" ? username : null,
            origem: tipo, origemId: remetente, texto: midia.texto, externalId: mid ?? null,
            tipo: midia.tipo, midiaUrl: midia.midiaUrl, fotoUrl,
            // No IG/Messenger o anúncio vem no evento (m.referral) ou dentro da
            // própria mensagem — extrairAnuncio cobre os dois formatos.
            anuncio: extrairAnuncio(m),
          });
        }
      }
    }
  } catch (e) {
    // 200 mesmo em erro: 5xx faz a Meta reenviar em loop, e um evento problemático
    // não pode travar a fila dos outros.
    console.error("processamento:", e);
  }

  return ok();
});
