import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FilaView, type ItemFila } from './fila-view'

export const metadata = { title: 'Fila do dia' }

export default async function FilaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const empresaId = await getEmpresaId()
  if (!empresaId) redirect('/dashboard')

  // Ações vencidas (até o fim de hoje) das minhas inscrições ativas (+ as sem dono).
  const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999)
  const { data: inscRaw } = await supabase
    .from('cadencia_inscricoes')
    .select('id, cadencia_id, lead_id, passo_ordem, proxima_acao_em, responsavel_id, created_at')
    .eq('empresa_id', empresaId).eq('status', 'ativa')
    .lte('proxima_acao_em', fimHoje.toISOString())
    .or(`responsavel_id.eq.${user.id},responsavel_id.is.null`)
    .order('proxima_acao_em', { ascending: true })
    .limit(200)

  const insc = inscRaw ?? []
  if (insc.length === 0) return <FilaView itens={[]} templates={{}} />

  const leadIds = [...new Set(insc.map((i) => i.lead_id))]
  const cadIds = [...new Set(insc.map((i) => i.cadencia_id))]

  const [{ data: leads }, { data: cads }, { data: passos }, { data: tmplRow }] = await Promise.all([
    supabase.from('leads').select('id, nome, telefone, kanban_status').in('id', leadIds),
    supabase.from('cadencias').select('id, nome').in('id', cadIds),
    supabase.from('cadencia_passos').select('cadencia_id, ordem, canal, titulo, template_chave').in('cadencia_id', cadIds),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'mensagens_templates').maybeSingle(),
  ])

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]))
  const cadMap = new Map((cads ?? []).map((c) => [c.id, c.nome]))
  const passoMap = new Map((passos ?? []).map((p) => [`${p.cadencia_id}:${p.ordem}`, p]))
  const templates = (tmplRow?.valor ?? {}) as Record<string, string>

  const itens: ItemFila[] = insc
    .map((i) => {
      const lead = leadMap.get(i.lead_id)
      const passo = passoMap.get(`${i.cadencia_id}:${i.passo_ordem}`)
      if (!lead || !passo) return null
      return {
        inscricaoId: i.id,
        leadId: i.lead_id,
        leadNome: lead.nome ?? 'Lead',
        telefone: lead.telefone ?? null,
        etapa: lead.kanban_status ?? null,
        cadencia: cadMap.get(i.cadencia_id) ?? 'Cadência',
        passoOrdem: i.passo_ordem,
        canal: passo.canal,
        instrucao: passo.titulo,
        templateChave: passo.template_chave,
        venceEm: i.proxima_acao_em,
      } as ItemFila
    })
    .filter((x): x is ItemFila => x !== null)

  return <FilaView itens={itens} templates={templates} />
}
