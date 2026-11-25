import type { SupabaseClient } from '@supabase/supabase-js'
import { decifrarToken } from '@/lib/canais/crypto'

/**
 * RESGATE DAS MÍDIAS PENDENTES DO WHATSAPP (25/11/2026; plano em docs/midia-resgate-plano.md).
 *
 * Quando a Edge não consegue gravar uma mídia por falha passageira (Storage 5xx, 429, tempo esgotado, mesmo
 * depois das novas tentativas), a mensagem nasce com o tipo certo e `midia_status = 'pendente'`, com o id da
 * mídia na Meta (`midia_ref`) e o prazo (`midia_expira_em` = mensagem + 7 dias: é o tempo que a Meta deixa
 * baixar mídia recebida por webhook).
 *
 * Esta rotina (pg_cron `resgatar-midias`, a cada 15 min, só quando há pendente → /api/cron/resgatar-midias):
 *   1. vencido o prazo → `indisponivel` (a bolha diz "arquivo indisponível");
 *   2. senão, pede à Meta uma URL nova (vale 5 min), baixa e grava no MESMO caminho determinístico que a Edge
 *      usaria (`<empresa>/m/wa-<id>.<ext>`, com upsert: nunca duplica arquivo) e preenche `midia_url`;
 *   3. a Meta dizendo que a mídia não existe mais (400/404) → `indisponivel`; falha passageira → tenta de novo
 *      na próxima rodada, até o prazo.
 * O chat escuta UPDATE em mensagens: a bolha troca sozinha de "sendo recuperado" para o arquivo.
 */

/** Igual ao `EXT` da Edge (supabase/functions/webhook-leads/index.ts), para o caminho ser o mesmo. */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'application/msword': 'doc', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
}
/** O mesmo teto da Edge (MIDIA_MAX). Acima dele a Edge nem marca pendente; aqui é só a guarda. */
export const MIDIA_MAX = 20 * 1024 * 1024
const POR_RODADA = 20

/** O caminho que a Edge usa (`caminhoDaMidia`): `<empresa>/m/<chave limpa>.<ext>`. */
export function caminhoDaMidia(empresaId: number, chave: string, ext: string): string {
  const limpa = chave.replace(/[^A-Za-z0-9_-]/g, '').slice(-100)
  return `${empresaId}/m/${limpa}.${ext}`
}

export interface Pendente {
  id: number; empresa_id: number; canal_id: number | null; midia_ref: string | null
  midia_tentativas: number | null; midia_expira_em: string | null
}

export interface ResultadoResgate { expiradas: number; resgatadas: number; indisponiveis: number; adiadas: number }

export interface Dependencias {
  fetch?: typeof fetch
  agora?: Date
  decifrar?: (cifrado: string) => string
  graph?: string
}

type Passo = { ok: true; url: string } | { ok: false; definitivo: boolean; motivo: string }

/** Uma mensagem: Meta → download → Storage. Não grava na mensagem (quem chama decide). */
async function buscarUma(
  db: SupabaseClient, p: Pendente, token: string, dep: Required<Pick<Dependencias, 'fetch' | 'graph'>>,
): Promise<Passo> {
  const info = await dep.fetch(`https://graph.facebook.com/${dep.graph}/${p.midia_ref}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!info.ok) {
    // 400/404: a Meta não tem mais a mídia (ou o id não vale) — não adianta insistir.
    const definitivo = info.status === 400 || info.status === 404
    return { ok: false, definitivo, motivo: `Meta HTTP ${info.status}` }
  }
  const meta = await info.json() as { url?: string; mime_type?: string }
  if (!meta?.url) return { ok: false, definitivo: true, motivo: 'a Meta não devolveu URL' }

  const res = await dep.fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return { ok: false, definitivo: res.status === 404, motivo: `download HTTP ${res.status}` }
  const ct = (res.headers.get('content-type') ?? meta.mime_type ?? 'application/octet-stream').split(';')[0].trim()
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MIDIA_MAX) return { ok: false, definitivo: true, motivo: 'acima do limite' }

  const caminho = caminhoDaMidia(p.empresa_id, `wa-${p.midia_ref}`, EXT[ct] ?? 'bin')
  const { error } = await db.storage.from('chat-midia').upload(caminho, buf, { contentType: ct, upsert: true })
  if (error) return { ok: false, definitivo: false, motivo: `upload: ${error.message}` }
  return { ok: true, url: db.storage.from('chat-midia').getPublicUrl(caminho).data.publicUrl }
}

export async function resgatarMidiasPendentes(db: SupabaseClient, dep: Dependencias = {}): Promise<ResultadoResgate> {
  const agora = (dep.agora ?? new Date()).toISOString()
  const f = dep.fetch ?? fetch
  const decifrar = dep.decifrar ?? decifrarToken
  const graph = dep.graph ?? process.env.META_GRAPH_VERSION ?? 'v25.0'
  const r: ResultadoResgate = { expiradas: 0, resgatadas: 0, indisponiveis: 0, adiadas: 0 }

  // 1. Prazo da Meta vencido: indisponível.
  const { data: vencidas, error: eV } = await db.from('mensagens')
    .update({ midia_status: 'indisponivel' })
    .eq('midia_status', 'pendente').lte('midia_expira_em', agora)
    .select('id')
  if (eV) throw eV
  r.expiradas = vencidas?.length ?? 0

  // 2. As pendentes dentro do prazo, as que vencem primeiro antes.
  const { data, error } = await db.from('mensagens')
    .select('id, empresa_id, canal_id, midia_ref, midia_tentativas, midia_expira_em')
    .eq('midia_status', 'pendente').gt('midia_expira_em', agora)
    .order('midia_expira_em', { ascending: true }).limit(POR_RODADA)
  if (error) throw error
  const pendentes = (data ?? []) as Pendente[]
  if (!pendentes.length) return r

  const canalIds = [...new Set(pendentes.map((p) => p.canal_id).filter((x): x is number => x != null))]
  const { data: canais } = canalIds.length
    ? await db.from('canais').select('id, access_token_enc').in('id', canalIds)
    : { data: [] }
  const tokens = new Map<number, string | null>()
  for (const c of (canais ?? []) as { id: number; access_token_enc: string | null }[]) {
    let t: string | null = null
    try { t = c.access_token_enc ? decifrar(c.access_token_enc) : null } catch { t = null }
    tokens.set(c.id, t)
  }

  for (const p of pendentes) {
    const tentativas = (p.midia_tentativas ?? 0) + 1
    const token = p.canal_id != null ? tokens.get(p.canal_id) ?? null : null
    let passo: Passo
    if (!p.midia_ref) passo = { ok: false, definitivo: true, motivo: 'sem id da mídia' }
    else if (!token) passo = { ok: false, definitivo: false, motivo: 'canal sem token' }
    else {
      try { passo = await buscarUma(db, p, token, { fetch: f, graph }) }
      catch (e) { passo = { ok: false, definitivo: false, motivo: e instanceof Error ? e.message : String(e) } }
    }

    // Só mexe na linha que continua pendente (outra rodada ou a Edge podem ter resolvido antes).
    if (passo.ok) {
      await db.from('mensagens').update({ midia_url: passo.url, midia_status: null, midia_tentativas: tentativas })
        .eq('id', p.id).eq('midia_status', 'pendente')
      r.resgatadas++
    } else if (passo.definitivo) {
      await db.from('mensagens').update({ midia_status: 'indisponivel', midia_tentativas: tentativas })
        .eq('id', p.id).eq('midia_status', 'pendente')
      console.error('[resgatar-midias] indisponível:', p.id, passo.motivo)
      r.indisponiveis++
    } else {
      await db.from('mensagens').update({ midia_tentativas: tentativas }).eq('id', p.id).eq('midia_status', 'pendente')
      console.error('[resgatar-midias] adiada:', p.id, passo.motivo)
      r.adiadas++
    }
  }
  return r
}
