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
    const key = await crypto.subtle.importKey("raw", bytesDaChave(CHANNEL_KEY_RAW), "AES-GCM", false, ["decrypt"]);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, juntos));
  } catch (e) {
    console.error("decifrarToken falhou:", (e as Error).message);
    return null;
  }
}

// Assinatura do webhook: HMAC-SHA256 do corpo CRU com o App Secret.
// Sem isso, quem descobre a URL injeta lead falso.
async function assinaturaValida(req: Request, corpoCru: string): Promise<boolean> {
  if (!APP_SECRET) { console.error("META_APP_SECRET ausente — sem como validar assinatura"); return false; }
  const header = req.headers.get("x-hub-signature-256");
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpoCru));
  const esperado = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = header.slice(7);
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

// ── Resolução do tenant ─────────────────────────────────────────────────────
type Canal = {
  id: number; empresa_id: number; tipo: string; external_id: string;
  waba_id: string | null; token: string | null; coexistencia: boolean;
};
const cache = new Map<string, Canal | null>();

function montar(data: Record<string, unknown>, token: string | null): Canal {
  return {
    id: data.id as number, empresa_id: data.empresa_id as number, tipo: data.tipo as string,
    external_id: String(data.external_id ?? ""), waba_id: (data.waba_id as string | null) ?? null,
    token, coexistencia: !!data.coexistencia,
  };
}

// Mensagem que chega para um identificador que não conhecemos era DESCARTADA em
// silêncio. Cenário real e iminente: ao migrar o número para outra conta da Meta
// ele ganha um `phone_number_id` NOVO, e entre a migração e a reconexão as
// mensagens do cliente sumiriam sem deixar rastro em lugar nenhum.
// Agora sobra registro: fica no log da função e numa linha de diagnóstico, para
// eu conseguir dizer QUANTAS e DE QUAL id se perderam — e reconectar sabendo.
// Nunca quebra o recebimento: falha ao registrar é ignorada de propósito.
async function eventoOrfao(tipo: string, externalId: string | undefined, campo: string | null) {
  console.error(`evento orfao: ${tipo} id=${externalId ?? "(sem id)"} campo=${campo ?? "-"} — nenhum canal conectado com este id`);
  try {
    await db.from("diagnostico_canais").insert({
      etapa: "evento_orfao",
      origem_url: null,
      dados: { tipo, externalId: externalId ?? null, campo },
    });
  } catch { /* diagnóstico nunca pode atrapalhar o recebimento */ }
}

async function canalPorExternalId(tipo: string, externalId: string | undefined): Promise<Canal | null> {
  if (!externalId) return null;
  const chave = `${tipo}:${externalId}`;
  const emCache = cache.get(chave);
  if (emCache !== undefined) return emCache;
  const { data } = await db.from("canais_conectados")
    .select("id, empresa_id, tipo, external_id, waba_id, access_token_enc, coexistencia")
    .eq("tipo", tipo).eq("external_id", String(externalId)).maybeSingle();
  const canal = data ? montar(data, await decifrarToken(data.access_token_enc as string | null)) : null;
  cache.set(chave, canal);
  if (!canal) console.log(`canal desconhecido (${chave}) — evento ignorado, não cria lixo`);
  return canal;
}

// Escolhe o canal de ENVIO da empresa. Uma empresa pode ter mais de um número ou
// página no mesmo canal, então aqui NÃO se usa maybeSingle (que erra com 2 linhas
// e derrubaria o envio) — pega o conectado mais recentemente, de forma determinística.
async function canalPorEmpresa(empresaId: number, tipo: string): Promise<Canal | null> {
  const { data } = await db.from("canais_conectados")
    .select("id, empresa_id, tipo, external_id, waba_id, access_token_enc, coexistencia")
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
 * `markdown` só no WhatsApp: Instagram e Messenger não interpretam `*_..._*` e
 * mostrariam os asteriscos crus para o cliente.
 */
async function assinaturaDe(empresaId: number, nomeUsuario: string, markdown: boolean): Promise<string> {
  try {
    const primeiro = nomeUsuario.split(/\s+/)[0];
    if (!primeiro) return "";
    const { data: cfg } = await db.from("configuracoes_sistema")
      .select("valor").eq("empresa_id", empresaId).eq("chave", "assinatura_atendente").maybeSingle();
    const v = (cfg?.valor ?? {}) as { ativo?: boolean; incluir_empresa?: boolean };
    if (v.ativo === false) return "";

    let quem = primeiro;
    if (v.incluir_empresa !== false) {
      const { data: emp } = await db.from("empresas").select("nome").eq("id", empresaId).maybeSingle();
      const nomeEmp = (emp?.nome as string | null) ?? "";
      if (nomeEmp) quem = `${primeiro} - ${nomeEmp.toUpperCase()}`;
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
const MIDIA_MAX = 20 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm",
  "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav",
};

// Pasta POR EMPRESA (a v26 jogava tudo em "1/"). Falha degrada para placeholder.
async function salvarMidia(empresaId: number, url: string, bearer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
    if (!res.ok) { console.error("midia download:", res.status); return null; }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MIDIA_MAX) { console.log("midia acima do limite:", buf.byteLength); return null; }
    const ct = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    const path = `${empresaId}/${crypto.randomUUID()}.${EXT[ct] ?? "bin"}`;
    const { error } = await db.storage.from("chat-midia").upload(path, buf, { contentType: ct });
    if (error) { console.error("midia upload:", error.message); return null; }
    return db.storage.from("chat-midia").getPublicUrl(path).data.publicUrl;
  } catch (e) { console.error("salvarMidia:", e); return null; }
}

async function salvarMidiaWhatsApp(canal: Canal, mediaId: string | undefined): Promise<string | null> {
  try {
    if (!mediaId || !canal.token) return null;
    const info = await fetch(`https://graph.facebook.com/${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${canal.token}` },
    });
    if (!info.ok) { console.error("WA media info:", await info.text()); return null; }
    const meta = await info.json();
    return meta?.url ? await salvarMidia(canal.empresa_id, meta.url as string, canal.token) : null;
  } catch (e) { console.error("salvarMidiaWhatsApp:", e); return null; }
}

async function extrairMidiaMeta(
  canal: Canal, message: Record<string, unknown> | undefined,
): Promise<{ tipo: string; midiaUrl: string | null; texto: string }> {
  const base = (message?.text as string) || "[midia]";
  try {
    const a = (message?.attachments as Record<string, unknown>[] | undefined)?.[0];
    const aType = a?.type as string | undefined;
    const aUrl = (a?.payload as Record<string, unknown> | undefined)?.url as string | undefined;
    if (a && aType && TIPO_DB[aType] && aUrl) {
      const salvo = await salvarMidia(canal.empresa_id, aUrl);
      if (salvo) return { tipo: TIPO_DB[aType], midiaUrl: salvo, texto: (message?.text as string) || `[${TIPO_DB[aType]}]` };
    }
  } catch (e) { console.error("extrairMidiaMeta:", e); }
  return { tipo: "texto", midiaUrl: null, texto: base };
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

async function fetchProfile(id: string, token: string, fields: string) {
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${id}?fields=${fields}&access_token=${token}`);
    if (!r.ok) { console.error("profile:", id, await r.text()); return null; }
    return await r.json() as Record<string, string>;
  } catch (e) { console.error("fetchProfile:", e); return null; }
}

async function upsertLead(canal: Canal, p: {
  nome: string | null; telefone: string | null; instagramUser: string | null;
  origem: string; origemId: string; texto: string; externalId: string | null;
  tipo?: string; midiaUrl?: string | null; fotoUrl?: string | null;
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
    const { data: novo, error } = await db.from("leads").insert([{
      empresa_id: empresaId, nome: p.nome, telefone: p.telefone, instagram: p.instagramUser,
      origem: p.origem, origem_id: p.origemId, primeira_msg: p.texto,
      kanban_status: "novo", ativo: true, foto_url: p.fotoUrl ?? null,
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
    if (Object.keys(patch).length) await db.from("leads").update(patch).eq("id", leadId);
  }

  const { error: msgErr } = await db.from("lead_mensagens").insert([{
    empresa_id: empresaId, lead_id: leadId, direcao: "recebida", conteudo: p.texto,
    origem: p.origem, lida: false, external_id: p.externalId, tipo, midia_url: midiaUrl,
  }]);
  if (msgErr) { console.log("msg duplicada ignorada:", p.externalId); return leadId; }

  await db.rpc("incrementar_msgs_nao_lidas", { lead_id_param: leadId });
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

// ── Coexistência: histórico de 6 meses ──────────────────────────────────────
// DECISÃO DE PRODUTO: importa mensagem apenas para conversa que JÁ tem lead.
// Criar lead para cada thread de 6 meses jogaria centenas de contatos antigos no
// funil de uma vez. O que sobra é contado no log para decidirmos depois.
async function importarHistorico(canal: Canal, blocos: Record<string, unknown>[]) {
  let importadas = 0, semLead = 0;
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
      const { data: lead } = await db.from("leads").select("id")
        .eq("empresa_id", canal.empresa_id).eq("origem_id", fone).eq("ativo", true).maybeSingle();
      if (!lead?.id) { semLead++; continue; }

      const linhas: Record<string, unknown>[] = [];
      for (const m of (thread.messages as Record<string, unknown>[] ?? [])) {
        const tipoMsg = String(m.type ?? "text");
        const doNegocio = !!m.to; // "to" presente = mensagem que o negócio enviou
        const conteudo = tipoMsg === "text"
          ? ((m.text as Record<string, string> | undefined)?.body ?? "")
          : tipoMsg === "media_placeholder" ? "[midia]" : `[${TIPO_DB[tipoMsg] ?? tipoMsg}]`;
        const linha: Record<string, unknown> = {
          empresa_id: canal.empresa_id, lead_id: lead.id,
          direcao: doNegocio ? "enviada" : "recebida", conteudo, origem: "whatsapp",
          lida: true, external_id: m.id ?? null,
          tipo: TIPO_DB[tipoMsg] ?? "texto", midia_url: null,
        };
        if (m.timestamp) linha.created_at = new Date(Number(m.timestamp) * 1000).toISOString();
        linhas.push(linha);
      }
      if (!linhas.length) continue;
      // O índice único em external_id descarta o que já existe; ignoreDuplicates
      // evita que uma repetida derrube o lote inteiro.
      const { error } = await db.from("lead_mensagens")
        .upsert(linhas, { onConflict: "external_id", ignoreDuplicates: true });
      if (error) console.error("histórico lote:", error.message);
      else importadas += linhas.length;
    }
  }

  const patch: Record<string, unknown> = { sync_historico_em: new Date().toISOString() };
  if (progresso != null) patch.sync_historico_pct = progresso;
  await db.from("canais_conectados").update(patch).eq("id", canal.id);
  console.log(`histórico: ${importadas} mensagens, ${semLead} conversas sem lead (ignoradas), progresso ${progresso ?? "?"}%`);
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
async function enviarWhatsApp(canal: Canal, body: Record<string, unknown>, assinatura = "") {
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
async function enviarModelo(canal: Canal, body: Record<string, unknown>) {
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
      status_entrega: "enviada", status_em: new Date().toISOString(),
    }]);
  }
  return json({ success: true, modelo: nome });
}

async function enviarMeta(canal: Canal, origemId: string, body: Record<string, unknown>, assinatura = "") {
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

  // O envio é sempre pela PÁGINA — inclusive no Instagram. Como o canal do IG
  // guarda o id da CONTA do Instagram, busca-se a Página da mesma empresa.
  let pageId = canal.external_id;
  if (canal.tipo === "instagram") {
    const { data } = await db.from("canais_conectados").select("external_id")
      .eq("empresa_id", canal.empresa_id).eq("tipo", "messenger").maybeSingle();
    if (data?.external_id) pageId = String(data.external_id);
  }

  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${pageId}/messages?access_token=${canal.token}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: origemId }, message, messaging_type: "RESPONSE" }),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message ?? `erro ao enviar pelo ${nomeCanal}`;
    if (data?.error?.code === 190) await marcarErroNoCanal(canal.id, msg, "expirado");
    return json({ error: msg }, r.status);
  }
  await db.from("lead_mensagens").insert([{
    empresa_id: canal.empresa_id, lead_id: leadId, direcao: "enviada",
    conteudo: texto || `[${tipoDb}]`, origem: nomeCanal, lida: true,
    tipo: tipoDb, midia_url: midiaUrl ?? null, external_id: (data?.message_id as string) ?? null,
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

      const { data: lead } = await db.from("leads")
        .select("id, empresa_id, origem_id").eq("id", leadId).maybeSingle();
      if (!lead) return json({ error: "lead não encontrado" }, 404);

      const usuario = await usuarioDoEnvio(req, lead.empresa_id as number);
      if (!usuario) return json({ error: "não autorizado" }, 401);

      if (action === "send_template") {
        const canal = await canalPorEmpresa(lead.empresa_id as number, "whatsapp");
        if (!canal) return json({ error: "WhatsApp não conectado nesta empresa" }, 502);
        return await enviarModelo(canal, body);
      }

      if (action === "send") {
        if (!body.number || (!body.text && !body.midiaUrl)) {
          return json({ error: "number e text ou midiaUrl são obrigatórios" }, 400);
        }
        const canal = (await canalPorEmpresa(lead.empresa_id as number, "whatsapp")) ?? {
          id: 0, empresa_id: lead.empresa_id as number, tipo: "whatsapp",
          external_id: "", waba_id: null, token: null, coexistencia: false,
        };
        return await enviarWhatsApp(canal, body, await assinaturaDe(lead.empresa_id as number, usuario.nome, true));
      }

      const nomeCanal = body.canal as string | undefined;
      if (nomeCanal !== "instagram" && nomeCanal !== "messenger") {
        return json({ error: "canal deve ser instagram ou messenger" }, 400);
      }
      if (!body.texto && !body.midiaUrl) return json({ error: "texto ou midiaUrl" }, 400);
      if (!lead.origem_id) return json({ error: "lead sem origem_id" }, 400);
      const canal = await canalPorEmpresa(lead.empresa_id as number, nomeCanal);
      if (!canal) return json({ error: `${nomeCanal} não conectado nesta empresa` }, 502);
      // Sem markdown: IG e Messenger mostrariam os asteriscos crus.
      return await enviarMeta(canal, String(lead.origem_id), body,
        await assinaturaDe(lead.empresa_id as number, usuario.nome, false));
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
    console.error("assinatura invalida ou ausente — evento recusado");
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
                const alvo = (m.edit as Record<string, unknown> | undefined)?.message_id
                  ?? (m.revoke as Record<string, unknown> | undefined)?.message_id
                  ?? (m.context as Record<string, unknown> | undefined)?.id;
                if (!alvo) { console.log(`${t} sem id da mensagem original — payload:`, JSON.stringify(m).slice(0, 300)); continue; }
                if (t === "revoke") {
                  await db.from("lead_mensagens")
                    .update({ conteudo: "[mensagem apagada]", tipo: "texto", midia_url: null })
                    .eq("empresa_id", canal.empresa_id).eq("external_id", String(alvo));
                } else {
                  const novo = ((m.edit as Record<string, unknown> | undefined)?.text as Record<string, unknown> | undefined)?.body
                    ?? (m.text as Record<string, unknown> | undefined)?.body;
                  if (novo) {
                    await db.from("lead_mensagens").update({ conteudo: String(novo) })
                      .eq("empresa_id", canal.empresa_id).eq("external_id", String(alvo));
                  }
                }
                continue;
              }
              let texto = ((m.text as Record<string, unknown> | undefined)?.body as string)
                || ((m.image as Record<string, unknown> | undefined)?.caption as string) || "[midia]";
              let tipo = "texto";
              let midiaUrl: string | null = null;
              if (t === "image" || t === "video" || t === "audio") {
                const mid = m[t] as Record<string, unknown> | undefined;
                const salvo = await salvarMidiaWhatsApp(canal, mid?.id as string | undefined);
                if (salvo) { tipo = TIPO_DB[t]; midiaUrl = salvo; texto = (mid?.caption as string) || `[${tipo}]`; }
              }
              await upsertLead(canal, {
                nome: ((contatos?.[0]?.profile as Record<string, unknown> | undefined)?.name as string) ?? null,
                telefone: fone, instagramUser: null, origem: "whatsapp", origemId: fone,
                texto, externalId: (m.id as string) ?? null, tipo, midiaUrl,
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
              const t = e.type as string | undefined;
              const conteudo = t === "text"
                ? (((e.text as Record<string, unknown> | undefined)?.body as string) ?? "")
                : `[${TIPO_DB[t ?? ""] ?? "midia"}]`;
              // No echo o cliente é o "to" — o "from" é o número do negócio.
              await registrarEcho(canal, String(e.to ?? "").replace(/\D/g, ""), e.id as string,
                conteudo, "whatsapp", TIPO_DB[t ?? ""] ?? "texto");
            }
          }

          // COEXISTÊNCIA: contatos da agenda do celular
          if (campo === "smb_app_state_sync") {
            await sincronizarContatos(canal, (value?.state_sync as Record<string, unknown>[]) ?? []);
            await db.from("canais_conectados")
              .update({ sync_contatos_em: new Date().toISOString() }).eq("id", canal.id);
          }

          // COEXISTÊNCIA: histórico de 6 meses (pode vir aos milhares por evento)
          if (campo === "history") {
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
            const p = await fetchProfile(remetente, canal.token, campos);
            nome = p?.name || p?.username || p?.first_name || null;
            username = p?.username || null;
            if (p?.profile_pic) fotoUrl = await salvarFotoPerfil(canal, remetente, p.profile_pic);
          }
          await upsertLead(canal, {
            nome, telefone: null, instagramUser: tipo === "instagram" ? username : null,
            origem: tipo, origemId: remetente, texto: midia.texto, externalId: mid ?? null,
            tipo: midia.tipo, midiaUrl: midia.midiaUrl, fotoUrl,
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
