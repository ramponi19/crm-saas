/**
 * RECUPERAÇÃO DAS MENSAGENS DO INSTAGRAM PERDIDAS NO INCIDENTE DE 20/10/2026.
 *
 *     npx tsx scripts/recuperar-instagram-20261020.mts              (simula: só lista)
 *     npx tsx scripts/recuperar-instagram-20261020.mts --gravar     (grava o que falta)
 *     npx tsx scripts/recuperar-instagram-20261020.mts --de 2026-10-20T14:06:30Z --ate 2026-10-20T14:10:30Z
 *
 * ══ O QUE ACONTECEU ════════════════════════════════════════════════════════
 *
 * Entre 11:07:53 e 11:09:17 (São Paulo) o PostgREST respondia 503 e a Edge
 * `webhook-leads` não conseguia achar o canal: tratava como canal inexistente,
 * descartava o evento e respondia 200, então a Meta não reenviou. Do Instagram foram
 * 18 eventos, todos da conta @jmstore_importados (canal 26). O conserto da Edge
 * (85250c3) faz o banco fora responder 500; este script repõe o que já se perdeu.
 *
 * ══ COMO ════════════════════════════════════════════════════════════════════
 *
 * Para os dois perfis (canais 25 e 26), pela API do Instagram com o token da
 * própria conta: GET /me/conversations → conversas com movimento na janela →
 * mensagens da janela (padrão 11:06:30–11:10:30, com folga de 30 s nas pontas).
 *
 * - Já existe em `mensagens` com o mesmo `external_id` (mid)? Pula.
 * - Não existe: grava por `mensagem_registrar`, o mesmo caminho da Edge, com o
 *   `created_at` da Meta. Rodar duas vezes não duplica: o RPC ignora external_id
 *   repetido e o script confere antes.
 * - Direção pelo remetente: a própria conta → 'enviada' (resposta pelo celular),
 *   senão 'recebida' (cliente).
 * - Lead: o mesmo critério da Edge (origem_id = id do cliente no Instagram, ativo,
 *   de preferência na loja do canal). Sem lead, NÃO cria: lista para tratar à mão.
 * - Anexo: grava o tipo com texto "[mídia recuperada — ver no Instagram]" e sem URL
 *   (a URL da CDN da Meta expira; a Edge copia para o Storage, este script não).
 *
 * Só leitura na API da Meta. Nada é enviado a cliente nenhum.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
process.env.CHANNEL_ENCRYPTION_KEY = env.CHANNEL_ENCRYPTION_KEY
const { decifrarToken } = await import('../lib/canais/crypto')

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? (process.argv[i + 1] ?? null) : null }
const GRAVAR = process.argv.includes('--gravar')
const DE = new Date(arg('--de') ?? '2026-10-20T14:06:30Z')
const ATE = new Date(arg('--ate') ?? '2026-10-20T14:10:30Z')
const CANAIS = [25, 26]
const GRAPH = `https://graph.instagram.com/${env.META_GRAPH_VERSION || 'v25.0'}`

type Msg = { id: string; created_time: string; from?: { id: string; username?: string }; message?: string; attachments?: { data?: { image_data?: unknown; video_data?: unknown; audio_data?: unknown; file_url?: string }[] } }

async function graph<T>(url: string): Promise<T> {
  const r = await fetch(url)
  const j = await r.json() as T & { error?: { message: string } }
  if (!r.ok || j.error) throw new Error(`Graph ${r.status}: ${j.error?.message ?? 'erro'}`) // sem a URL: ela leva o token
  return j
}

function tipoDoAnexo(m: Msg): string | null {
  const a = m.attachments?.data?.[0]
  if (!a) return null
  if (a.image_data) return 'imagem'
  if (a.video_data) return 'video'
  if (a.audio_data) return 'audio'
  return 'documento'
}

const resumo = { conversas: 0, naJanela: 0, jaGravadas: 0, gravadas: 0, semLead: 0, erros: 0 }
console.log(`janela ${DE.toISOString()} → ${ATE.toISOString()} · ${GRAVAR ? 'GRAVANDO' : 'simulação (use --gravar)'}`)

for (const canalId of CANAIS) {
  const { data: canal, error } = await db.from('canais_conectados')
    .select('id, empresa_id, filial_id, external_id, ig_user_id, nome_exibicao, access_token_enc').eq('id', canalId).single()
  if (error || !canal?.access_token_enc) { console.error(`canal ${canalId}: sem canal ou sem token`); resumo.erros++; continue }
  const token = decifrarToken(canal.access_token_enc as string)
  const proprios = new Set([String(canal.external_id), String(canal.ig_user_id ?? '')])
  console.log(`\n== canal ${canalId} ${canal.nome_exibicao}`)

  // Conversas mais recentes primeiro; para quando a conversa não mexe desde antes da janela.
  let url: string | null = `${GRAPH}/me/conversations?platform=instagram&fields=id,updated_time&limit=50&access_token=${encodeURIComponent(token)}`
  const conversas: string[] = []
  while (url) {
    const pag: { data: { id: string; updated_time: string }[]; paging?: { next?: string } } = await graph(url)
    for (const c of pag.data) if (new Date(c.updated_time) >= DE) conversas.push(c.id)
    url = pag.data.length && new Date(pag.data[pag.data.length - 1].updated_time) >= DE ? (pag.paging?.next ?? null) : null
  }
  resumo.conversas += conversas.length

  for (const conversa of conversas) {
    let murl: string | null = `${GRAPH}/${conversa}?fields=messages.limit(50){id,created_time,from,message,attachments}&access_token=${encodeURIComponent(token)}`
    const daJanela: Msg[] = []
    while (murl) {
      const j: { messages?: { data: Msg[]; paging?: { next?: string } }; data?: Msg[]; paging?: { next?: string } } = await graph(murl)
      const bloco = j.messages ?? { data: j.data ?? [], paging: j.paging }
      for (const m of bloco.data) { const t = new Date(m.created_time); if (t >= DE && t <= ATE) daJanela.push(m) }
      const ultima = bloco.data[bloco.data.length - 1]
      murl = ultima && new Date(ultima.created_time) >= DE ? (bloco.paging?.next ?? null) : null
    }

    for (const m of daJanela.reverse()) {
      resumo.naJanela++
      const { count } = await db.from('mensagens').select('id', { count: 'exact', head: true }).eq('external_id', m.id)
      if (count) { resumo.jaGravadas++; continue }

      const daLoja = proprios.has(String(m.from?.id))
      const cliente = daLoja ? null : String(m.from?.id ?? '')
      // Resposta da loja: o cliente é o outro participante da conversa.
      let clienteId = cliente
      if (daLoja) {
        const p: { participants?: { data: { id: string }[] } } = await graph(`${GRAPH}/${conversa}?fields=participants&access_token=${encodeURIComponent(token)}`)
        clienteId = p.participants?.data.map((x) => String(x.id)).find((id) => !proprios.has(id)) ?? null
      }
      let lead: { id: number } | null = null
      if (clienteId) {
        const { data: leads } = await db.from('leads').select('id, filial_id')
          .eq('empresa_id', canal.empresa_id).eq('origem_id', clienteId).eq('ativo', true).order('id', { ascending: false })
        const lista = (leads ?? []) as { id: number; filial_id: number | null }[]
        lead = lista.find((l) => l.filial_id === canal.filial_id) ?? lista[0] ?? null
      }
      const quando = m.created_time
      const tipo = tipoDoAnexo(m) ?? 'texto'
      const texto = m.message || (tipo !== 'texto' ? '[mídia recuperada — ver no Instagram]' : '')
      const linha = `${quando} ${daLoja ? 'enviada ' : 'recebida'} ${m.id.slice(0, 18)}… cliente ${clienteId ?? '?'}`
      if (!lead) { resumo.semLead++; console.log(`  SEM LEAD  ${linha}`); continue }
      if (!GRAVAR) { console.log(`  faltando  ${linha} → lead ${lead.id}`); continue }

      const dados = daLoja
        ? { lead_id: lead.id, direcao: 'enviada', conteudo: texto, origem: 'instagram', lida: true, tipo, created_at: quando, status_entrega: 'enviada', status_em: quando }
        : { lead_id: lead.id, direcao: 'recebida', conteudo: texto, origem: 'instagram', lida: false, tipo, created_at: quando }
      const { error: e } = await db.rpc('mensagem_registrar', { p_empresa: canal.empresa_id, p_canal_id: canal.id, p_external_id: m.id, p_dados: dados })
      if (e) { resumo.erros++; console.error(`  ERRO      ${linha}: ${e.message}`) } else { resumo.gravadas++; console.log(`  gravada   ${linha} → lead ${lead.id}`) }
    }
  }
}

console.log('\nresumo', resumo)
