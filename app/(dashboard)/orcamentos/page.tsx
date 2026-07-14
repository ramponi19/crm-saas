import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { normalizarSegmento } from '@/lib/segmentos'
import { OrcamentosView, type Orcamento } from './orcamentos-view'

export const metadata = { title: 'Orçamentos' }

export default async function OrcamentosPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')

  const [{ data }, { data: emp }] = await Promise.all([
    supabase.from('orcamentos')
      .select('id, tipo, status, cliente_nome, cliente_telefone, aparelho, imei, defeito, prazo_dias, garantia_dias, itens, aparelho_novo, valor_novo, aparelho_usado, valor_entrada, total, observacoes, token, created_at')
      .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(200),
    supabase.from('empresas').select('segmento').eq('id', empresaId).maybeSingle(),
  ])

  const orcamentos: Orcamento[] = (data ?? []).map((o) => ({
    ...o, total: Number(o.total) || 0,
    itens: Array.isArray(o.itens) ? (o.itens as unknown as Orcamento['itens']) : [],
  }))

  return <OrcamentosView orcamentosIniciais={orcamentos} segmento={normalizarSegmento(emp?.segmento)} />
}
