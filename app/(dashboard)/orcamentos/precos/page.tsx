import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { MatrizPrecosView, type PrecoLinha } from './matriz-precos-view'

export const metadata = { title: 'Preços de troca' }

export default async function PrecosTrocaPage() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')
  // Mesma pergunta que o layout faz para desenhar a aba — aqui vale para quem
  // chega pelo endereço direto, sem passar pela aba.
  if (!(await cotacaoDeTrocaLiberada())) redirect('/orcamentos')

  const [{ data: precos }, { data: regras }] = await Promise.all([
    supabase.from('troca_precos')
      .select('modelo, armazenamento, na_troca, descontos')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('troca_regras')
      .select('bonus_seminovo, corte_bateria')
      .eq('empresa_id', empresaId).maybeSingle(),
  ])

  const linhas: PrecoLinha[] = (precos ?? []).map((p) => ({
    modelo: p.modelo,
    armazenamento: p.armazenamento ?? '',
    na_troca: p.na_troca == null ? null : Number(p.na_troca),
    descontos: (p.descontos ?? {}) as Record<string, number>,
  }))

  return (
    <MatrizPrecosView
      linhas={linhas}
      bonusSeminovo={Number(regras?.bonus_seminovo) || 0}
      // 80% é o corte que a Apple usa como limite de bateria "em boas
      // condições" — o padrão da coluna no banco, repetido aqui porque uma
      // empresa sem linha em `troca_regras` não traz valor nenhum.
      corteBateria={regras?.corte_bateria ?? 80}
    />
  )
}
