import { trackerEmpresa } from '@/lib/tracker/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { Inbox } from '@/components/tracker/inbox'

export const metadata = { title: 'Conversas · Tracker Ads' }
export const dynamic = 'force-dynamic'

export default async function ConversasPage() {
  const { empresaId } = await trackerEmpresa()
  const db = rastrDb()

  const { data: leads } = await db.from('leads')
    .select('id, nome, telefone, foto_url, origem, kanban_status, msgs_nao_lidas, ultima_mensagem_at, primeira_msg, origem_id')
    .eq('empresa_id', empresaId).eq('ativo', true)
    .order('ultima_mensagem_at', { ascending: false, nullsFirst: false })
    .limit(80)

  const ids = (leads ?? []).map((l) => l.id)
  const preview = new Map<number, { conteudo: string; direcao: string; created_at: string }>()
  if (ids.length) {
    const { data: msgs } = await db.from('lead_mensagens')
      .select('lead_id, conteudo, direcao, created_at')
      .eq('empresa_id', empresaId).in('lead_id', ids)
      .order('created_at', { ascending: false }).limit(400)
    for (const m of (msgs ?? []) as Array<{ lead_id: number; conteudo: string; direcao: string; created_at: string }>) {
      if (!preview.has(m.lead_id)) preview.set(m.lead_id, m)
    }
  }

  const conversas = (leads ?? []).map((l) => {
    const p = preview.get(l.id)
    return {
      id: l.id, nome: l.nome || l.telefone || l.origem_id || 'Sem nome',
      telefone: l.telefone, foto_url: l.foto_url, origem: l.origem || 'whatsapp',
      status: l.kanban_status, nao_lidas: l.msgs_nao_lidas ?? 0,
      preview: p?.conteudo ?? l.primeira_msg ?? '', preview_saida: p?.direcao === 'enviada',
      ts: p?.created_at ?? l.ultima_mensagem_at,
    }
  })

  return (
    <div className="h-full min-h-0">
      <Inbox conversasIniciais={conversas} />
    </div>
  )
}
