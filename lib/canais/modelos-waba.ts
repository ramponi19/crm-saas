import type { SupabaseClient } from '@supabase/supabase-js'
import { decifrarToken } from '@/lib/canais/crypto'
import { apagarModelo, criarModelo, ehErro, listarModelos, statusDoModelo } from '@/lib/canais/meta'

/**
 * MODELO APROVADO É POR NÚMERO (11/11/2026).
 *
 * A Meta aprova cada modelo dentro de UMA conta de WhatsApp (WABA). Empresa com uma WABA por
 * loja (a JM: Mogi e Jaguariúna) tem um status por número — guardado em
 * `modelos_mensagem_wabas`. `modelos_mensagem.status` fica como RESUMO para a tela de modelos
 * (o melhor entre os números). Quem ENVIA (Transmissão, Automatize, Edge) olha o status do
 * número da loja, nunca o resumo.
 *
 * Tudo aqui roda com o cliente de serviço: o token do canal nunca sai do servidor.
 */
type Db = SupabaseClient

export interface NumeroWhatsApp {
  wabaId: string
  token: string
  /** Lojas cujo canal de WhatsApp está nesta WABA (nulo = canal da empresa inteira). */
  filiais: (number | null)[]
  /** Os canais (ids) desta WABA — para ligar uma mensagem ao número. */
  canais: number[]
}

/** As WABAs de WhatsApp da empresa (canais ativos com token), uma entrada por WABA. */
export async function numerosWhatsApp(svc: Db, empresaId: number): Promise<NumeroWhatsApp[]> {
  const { data } = await svc.from('canais')
    .select('id, waba_id, filial_id, access_token_enc, conectado_em')
    .eq('empresa_id', empresaId).eq('tipo', 'whatsapp').eq('status', 'ativo')
    .order('conectado_em', { ascending: false })
  const porWaba = new Map<string, NumeroWhatsApp>()
  for (const c of (data ?? []) as { id: number; waba_id: string | null; filial_id: number | null; access_token_enc: string | null }[]) {
    const waba = (c.waba_id ?? '').trim()
    if (!waba || !c.access_token_enc) continue
    const ja = porWaba.get(waba)
    if (ja) { ja.filiais.push(c.filial_id); ja.canais.push(Number(c.id)); continue }
    let token: string
    try { token = decifrarToken(c.access_token_enc) } catch { continue }
    porWaba.set(waba, { wabaId: waba, token, filiais: [c.filial_id], canais: [Number(c.id)] })
  }
  return [...porWaba.values()]
}

const PESO: Record<string, number> = { aprovado: 5, pendente: 4, pausado: 3, rejeitado: 2, desativado: 1, rascunho: 0 }

/** O resumo de cada modelo da empresa = o melhor status entre os números. */
async function recalcularResumo(svc: Db, empresaId: number, modeloIds?: number[]): Promise<void> {
  let q = svc.from('modelos_mensagem_wabas').select('modelo_id, status, motivo_recusa').eq('empresa_id', empresaId)
  if (modeloIds?.length) q = q.in('modelo_id', modeloIds)
  const { data } = await q
  const melhor = new Map<number, { status: string; motivo: string | null }>()
  for (const r of (data ?? []) as { modelo_id: number; status: string; motivo_recusa: string | null }[]) {
    const atual = melhor.get(r.modelo_id)
    if (!atual || (PESO[r.status] ?? 0) > (PESO[atual.status] ?? 0)) melhor.set(r.modelo_id, { status: r.status, motivo: r.motivo_recusa })
  }
  const agora = new Date().toISOString()
  for (const [id, m] of melhor) {
    await svc.from('modelos_mensagem').update({ status: m.status, motivo_recusa: m.status === 'aprovado' ? null : m.motivo, updated_at: agora } as never)
      .eq('id', id).eq('empresa_id', empresaId)
  }
}

/**
 * Confere na Meta o estado de cada modelo EM CADA número e grava. Um número que falha não
 * apaga nada dele (a Meta pode só estar fora); o que some da lista de um número que respondeu
 * deixa de existir nele.
 */
export async function sincronizarModelos(svc: Db, empresaId: number): Promise<{ numeros: number; erros: string[] }> {
  const numeros = await numerosWhatsApp(svc, empresaId)
  const erros: string[] = []
  const agora = new Date().toISOString()
  for (const n of numeros) {
    const naMeta = await listarModelos(n.wabaId, n.token)
    if (ehErro(naMeta)) { erros.push(`WABA …${n.wabaId.slice(-4)}: ${naMeta.erro}`); continue }
    const vistos: number[] = []
    for (const t of naMeta.modelos) {
      // Corpo e categoria vêm da Meta (ela pode ajustar); casa por (empresa, nome, idioma).
      const { data: m, error } = await svc.from('modelos_mensagem').upsert({
        empresa_id: empresaId, nome: t.nome, idioma: t.idioma,
        categoria: t.categoria || 'UTILITY', corpo: t.corpo,
        status: statusDoModelo(t.status), meta_id: t.metaId, ultima_sync_em: agora, updated_at: agora,
      } as never, { onConflict: 'empresa_id,nome,idioma' }).select('id').single()
      if (error || !m) { erros.push(`${t.nome}: ${error?.message ?? 'não gravou'}`); continue }
      const modeloId = (m as { id: number }).id
      vistos.push(modeloId)
      await svc.from('modelos_mensagem_wabas').upsert({
        modelo_id: modeloId, empresa_id: empresaId, waba_id: n.wabaId,
        status: statusDoModelo(t.status), motivo_recusa: t.motivo, meta_id: t.metaId,
        ultima_sync_em: agora, updated_at: agora,
      } as never, { onConflict: 'modelo_id,waba_id' })
    }
    // Sumiu deste número na Meta: não existe mais nele.
    let apagar = svc.from('modelos_mensagem_wabas').delete().eq('empresa_id', empresaId).eq('waba_id', n.wabaId)
    if (vistos.length) apagar = apagar.not('modelo_id', 'in', `(${vistos.join(',')})`)
    await apagar
  }
  await recalcularResumo(svc, empresaId)
  return { numeros: numeros.length, erros }
}

/** Cria o modelo em TODOS os números da empresa (cada loja precisa dele aprovado no seu). */
export async function criarEmTodosOsNumeros(svc: Db, empresaId: number, modelo: {
  nome: string; idioma: string; categoria: string; corpo: string; exemplos?: string[]; variaveis?: string[]
}): Promise<{ id: number; status: string; erros: string[] } | { erro: string }> {
  const numeros = await numerosWhatsApp(svc, empresaId)
  if (!numeros.length) return { erro: 'Conecte o WhatsApp em Canais antes de criar modelos — é a Meta que aprova cada um.' }
  const agora = new Date().toISOString()
  const criados: { wabaId: string; status: string; metaId: string | null }[] = []
  const erros: string[] = []
  for (const n of numeros) {
    const r = await criarModelo(n.wabaId, n.token, { nome: modelo.nome, idioma: modelo.idioma, categoria: modelo.categoria, corpo: modelo.corpo, exemplos: modelo.exemplos })
    if (ehErro(r)) erros.push(`WABA …${n.wabaId.slice(-4)}: ${r.erro}`)
    else criados.push({ wabaId: n.wabaId, status: statusDoModelo(r.status), metaId: r.metaId ?? null })
  }
  if (!criados.length) return { erro: erros.join(' · ') || 'A Meta recusou o modelo.' }
  const { data, error } = await svc.from('modelos_mensagem').upsert({
    empresa_id: empresaId, nome: modelo.nome, idioma: modelo.idioma, categoria: modelo.categoria, corpo: modelo.corpo,
    variaveis: modelo.variaveis ?? [], status: criados[0].status, meta_id: criados[0].metaId,
    ultima_sync_em: agora, updated_at: agora, motivo_recusa: null,
  } as never, { onConflict: 'empresa_id,nome,idioma' }).select('id').single()
  if (error || !data) return { erro: error?.message ?? 'não gravou' }
  const id = (data as { id: number }).id
  for (const c of criados) {
    await svc.from('modelos_mensagem_wabas').upsert({
      modelo_id: id, empresa_id: empresaId, waba_id: c.wabaId, status: c.status, meta_id: c.metaId,
      motivo_recusa: null, ultima_sync_em: agora, updated_at: agora,
    } as never, { onConflict: 'modelo_id,waba_id' })
  }
  await recalcularResumo(svc, empresaId, [id])
  const { data: m } = await svc.from('modelos_mensagem').select('status').eq('id', id).maybeSingle()
  return { id, status: (m as { status: string } | null)?.status ?? criados[0].status, erros }
}

/**
 * Apaga o modelo nos números onde ele existe (os que têm linha em modelos_mensagem_wabas; sem
 * nenhuma, tenta em todos). Devolve os avisos de onde a Meta não confirmou.
 */
export async function apagarEmTodosOsNumeros(svc: Db, empresaId: number, modeloId: number, nome: string): Promise<string[]> {
  const avisos: string[] = []
  const { data: onde } = await svc.from('modelos_mensagem_wabas').select('waba_id').eq('empresa_id', empresaId).eq('modelo_id', modeloId)
  const wabas = new Set(((onde ?? []) as { waba_id: string }[]).map((r) => r.waba_id))
  for (const n of await numerosWhatsApp(svc, empresaId)) {
    if (wabas.size && !wabas.has(n.wabaId)) continue
    try {
      const r = await apagarModelo(n.wabaId, n.token, nome)
      if (ehErro(r)) avisos.push(`WABA …${n.wabaId.slice(-4)}: ${r.erro}`)
    } catch {
      avisos.push(`WABA …${n.wabaId.slice(-4)}: sem confirmação da Meta`)
    }
  }
  return avisos
}

/** filial (ou 'null') → ids dos modelos aprovados no número dela. */
export async function aprovadosPorLoja(svc: Db, empresaId: number): Promise<Map<string, Set<number>>> {
  const { data } = await svc.rpc('modelos_aprovados_por_loja', { p_empresa: empresaId })
  const mapa = new Map<string, Set<number>>()
  for (const r of (data ?? []) as { filial_id: number | null; modelo_id: number }[]) {
    const k = String(r.filial_id ?? 'null')
    if (!mapa.has(k)) mapa.set(k, new Set())
    mapa.get(k)!.add(Number(r.modelo_id))
  }
  return mapa
}

/**
 * Envio MANUAL de modelo (Comunicação e card do lead, 11/11/2026): o número que envia pela loja do
 * negócio — a mesma regra do canalDaLoja da Edge (o da loja; sem ele, o último de qualquer loja) — e
 * os modelos aprovados NELE. A Edge confere de novo (aprovadoNoNumero).
 */
export async function aprovadosNoNumeroDaLoja(svc: Db, empresaId: number, filialId: number | null): Promise<{ wabaId: string | null; ids: number[] }> {
  const { data: waba, error } = await svc.rpc('whatsapp_waba_da_loja', { p_empresa: empresaId, p_filial: filialId, p_qualquer_loja: true } as never)
  if (error) throw new Error(`whatsapp_waba_da_loja: ${error.message}`)
  const wabaId = (waba as string | null) ?? null
  if (!wabaId) return { wabaId: null, ids: [] }
  const { data } = await svc.from('modelos_mensagem_wabas').select('modelo_id')
    .eq('empresa_id', empresaId).eq('waba_id', wabaId).eq('status', 'aprovado')
  return { wabaId, ids: ((data ?? []) as { modelo_id: number }[]).map((r) => Number(r.modelo_id)) }
}

/** Aprovado no número que envia pela loja (p_qualquer_loja = a regra do Automatize). */
export async function aprovadoNaLoja(svc: Db, empresaId: number, modeloId: number, filialId: number | null, qualquerLoja = false): Promise<boolean> {
  const { data, error } = await svc.rpc('modelo_aprovado_na_loja', {
    p_empresa: empresaId, p_modelo: modeloId, p_filial: filialId, p_qualquer_loja: qualquerLoja,
  } as never)
  if (error) throw new Error(`modelo_aprovado_na_loja: ${error.message}`)
  return data === true
}
