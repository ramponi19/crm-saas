import { rastrDb } from '@/lib/rastreamento/db'

/**
 * Métricas do Analytics do Tracker — cruzam dados reais do CRM (leads,
 * lead_mensagens), o funil (funil_etapas: tipo ganho/perdido) e o rastreamento.
 * Read-only.
 */
export interface Analytics {
  totalConversas: number
  novosLeads: number
  taxaResposta: number
  tempoMedio1oContatoH: number | null
  ganhos: number
  perdidos: number
  taxaGanho: number
  atendimentos: number
  tocados: number
  respondidos: number
  cicloAteGanhoDias: number | null
  porDia: { dia: string; recebidas: number; enviadas: number }[]
  porOrigem: { origem: string; total: number }[]
  funil: { label: string; cor: string; total: number }[]
  funilCoorte: { label: string; alcancaram: number; taxa: number | null }[]
  estoqueFunil: { label: string; cor: string; total: number }[]
  porCampanha: { campanha: string; leads: number }[]
  motivosPerda: { label: string; total: number }[]
  porFonte: { fonte: string; leads: number; ganhos: number; perdidos: number }[]
}

const diaKey = (iso: string) => iso.slice(0, 10)

export async function calcularAnalytics(empresaId: number, dias = 30): Promise<Analytics> {
  const db = rastrDb()
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [{ data: msgs }, { data: leads }, { data: etapas }, { data: visitas }, { data: motivos }] = await Promise.all([
    db.from('lead_mensagens').select('lead_id, direcao, created_at').eq('empresa_id', empresaId).gte('created_at', desde).limit(8000),
    db.from('leads').select('id, origem, kanban_status, motivo_perda_id, created_at').eq('empresa_id', empresaId).eq('ativo', true).limit(2000),
    db.from('funil_etapas').select('slug, label, cor, tipo, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem', { ascending: true }),
    db.from('rastreamento_visitas').select('utm_campaign, lead_id').eq('empresa_id', empresaId).gte('criado_em', desde).limit(4000),
    db.from('motivos_perda').select('id, label').eq('empresa_id', empresaId),
  ])

  const M = (msgs ?? []) as { lead_id: number; direcao: string; created_at: string }[]
  const L = (leads ?? []) as { id: number; origem: string | null; kanban_status: string | null; motivo_perda_id: number | null; created_at: string }[]
  const E = (etapas ?? []) as { slug: string; label: string; cor: string | null; tipo: string | null; ordem: number }[]
  const V = (visitas ?? []) as { utm_campaign: string | null; lead_id: number | null }[]
  const MOT = (motivos ?? []) as { id: number; label: string }[]

  // Séries de conversas por dia.
  const diasArr: string[] = []
  for (let i = dias - 1; i >= 0; i--) diasArr.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  const rec = new Map<string, number>(); const env = new Map<string, number>()
  for (const m of M) { const k = diaKey(m.created_at); if (m.direcao === 'enviada') env.set(k, (env.get(k) ?? 0) + 1); else rec.set(k, (rec.get(k) ?? 0) + 1) }
  const porDia = diasArr.map((d) => ({ dia: d, recebidas: rec.get(d) ?? 0, enviadas: env.get(d) ?? 0 }))

  // Resposta do lead + tempo de 1º contato.
  const pRec = new Map<number, string>(); const pEnv = new Map<number, string>()
  for (const m of M) { if (m.direcao === 'enviada') { if (!pEnv.has(m.lead_id)) pEnv.set(m.lead_id, m.created_at) } else if (!pRec.has(m.lead_id)) pRec.set(m.lead_id, m.created_at) }
  let respondidos = 0; const tempos: number[] = []
  for (const [id, r] of pRec) { const e = pEnv.get(id); if (e && new Date(e) >= new Date(r)) { respondidos++; tempos.push((new Date(e).getTime() - new Date(r).getTime()) / 3600000) } }
  const taxaResposta = pRec.size ? Math.round((respondidos / pRec.size) * 1000) / 10 : 0
  const tempoMedio1oContatoH = tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null

  // Ganho/perdido pelo tipo da etapa.
  const tipoPorSlug = new Map<string, string>()
  for (const e of E) tipoPorSlug.set(e.slug, e.tipo || 'normal')
  let ganhos = 0, perdidos = 0
  for (const l of L) { const t = tipoPorSlug.get(l.kanban_status || ''); if (t === 'ganho') ganhos++; else if (t === 'perdido') perdidos++ }
  const taxaGanho = (ganhos + perdidos) ? Math.round((ganhos / (ganhos + perdidos)) * 1000) / 10 : 0

  // Motivos de perda.
  const labelMotivo = new Map<number, string>(MOT.map((m) => [m.id, m.label]))
  const motMap = new Map<string, number>()
  for (const l of L) { if (l.motivo_perda_id != null) { const lb = labelMotivo.get(l.motivo_perda_id) || 'Outro'; motMap.set(lb, (motMap.get(lb) ?? 0) + 1) } }
  const motivosPerda = [...motMap.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total).slice(0, 8)

  // Origem (novos no período).
  const oMap = new Map<string, number>()
  const novos = L.filter((l) => l.created_at >= desde)
  for (const l of novos) { const o = l.origem || 'manual'; oMap.set(o, (oMap.get(o) ?? 0) + 1) }
  const porOrigem = [...oMap.entries()].map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total).slice(0, 8)

  // Por fonte (todos os leads): leads/ganhos/perdidos por origem.
  const fMap = new Map<string, { leads: number; ganhos: number; perdidos: number }>()
  for (const l of L) {
    const o = l.origem || 'manual'
    const a = fMap.get(o) ?? { leads: 0, ganhos: 0, perdidos: 0 }
    a.leads++
    const t = tipoPorSlug.get(l.kanban_status || ''); if (t === 'ganho') a.ganhos++; else if (t === 'perdido') a.perdidos++
    fMap.set(o, a)
  }
  const porFonte = [...fMap.entries()].map(([fonte, a]) => ({ fonte, ...a })).sort((a, b) => b.leads - a.leads).slice(0, 10)

  // Distribuição no funil (dedup por slug — múltiplos funis repetem os mesmos slugs).
  const cont = new Map<string, number>()
  for (const l of L) { const s = l.kanban_status || ''; cont.set(s, (cont.get(s) ?? 0) + 1) }
  const vistos = new Set<string>()
  const etapasU = E.filter((e) => (vistos.has(e.slug) ? false : (vistos.add(e.slug), true)))
  const funil = etapasU.map((e) => ({ label: e.label, cor: e.cor || '#00a884', total: cont.get(e.slug) ?? 0 }))

  // Estoque atual: negócios abertos (etapas que não são ganho nem perdido).
  const estoqueFunil = etapasU.filter((e) => e.tipo !== 'ganho' && e.tipo !== 'perdido')
    .map((e) => ({ label: e.label, cor: e.cor || '#00a884', total: cont.get(e.slug) ?? 0 }))

  // Funil — onde o lead trava: alcance cumulativo da coorte (exclui perdido).
  const ordem = etapasU.filter((e) => e.tipo !== 'perdido')
  const naEtapa = ordem.map((e) => cont.get(e.slug) ?? 0)
  const funilCoorte = ordem.map((e, i) => {
    const alcancaram = naEtapa.slice(i).reduce((a, b) => a + b, 0)
    const ant = i === 0 ? alcancaram : naEtapa.slice(i - 1).reduce((a, b) => a + b, 0)
    return { label: e.label, alcancaram, taxa: i === 0 ? null : (ant > 0 ? Math.round((alcancaram / ant) * 100) : 0) }
  })

  const atendimentos = pEnv.size

  // Leads rastreados por campanha.
  const cMap = new Map<string, Set<number>>()
  for (const v of V) { if (!v.lead_id) continue; const c = v.utm_campaign || '(sem campanha)'; if (!cMap.has(c)) cMap.set(c, new Set()); cMap.get(c)!.add(v.lead_id) }
  const porCampanha = [...cMap.entries()].map(([campanha, s]) => ({ campanha, leads: s.size })).sort((a, b) => b.leads - a.leads).slice(0, 8)

  return {
    totalConversas: M.length, novosLeads: novos.length, taxaResposta, tempoMedio1oContatoH,
    ganhos, perdidos, taxaGanho, atendimentos, tocados: pRec.size, respondidos, cicloAteGanhoDias: null,
    porDia, porOrigem, funil, funilCoorte, estoqueFunil, porCampanha, motivosPerda, porFonte,
  }
}
