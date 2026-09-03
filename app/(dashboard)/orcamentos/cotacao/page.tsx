import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { CotacaoView, type AparelhoAvaliavel, type CotacaoRecente } from './cotacao-view'

export const metadata = { title: 'Nova cotação' }

/**
 * `?avaria=tela` chega dos chips do checklist.
 *
 * Lido no SERVIDOR e passado como prop, em vez de `useSearchParams` na view: o
 * hook exige fronteira de Suspense para renderização estática, e a prop não
 * exige nada — a página já é dinâmica porque lê a sessão.
 */
export default async function CotacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ avaria?: string }>
}) {
  const { avaria } = await searchParams
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!empresaId) redirect('/dashboard')
  if (!(await cotacaoDeTrocaLiberada())) redirect('/orcamentos')

  const [{ data: precos }, { data: regras }, { data: recentes }] = await Promise.all([
    /**
     * SÓ o que tem base entra no seletor.
     *
     * É o que faz a matriz em branco funcionar: a loja preenche os oito modelos
     * que compra de verdade, e o seletor mostra exatamente esses oito — em vez
     * de 140 aparelhos dos quais 132 valem R$ 0,00.
     */
    supabase.from('troca_precos')
      .select('modelo, armazenamento, na_troca, descontos')
      .eq('empresa_id', empresaId).eq('ativo', true).not('na_troca', 'is', null)
      .order('modelo'),
    supabase.from('troca_regras').select('bonus_seminovo, corte_bateria').eq('empresa_id', empresaId).maybeSingle(),
    // Os chips de "últimos avaliados": o balcão repete modelo o dia inteiro.
    supabase.from('troca_cotacoes')
      .select('id, modelo, armazenamento, valor_final, created_at')
      .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(8),
  ])

  const aparelhos: AparelhoAvaliavel[] = (precos ?? []).map((p) => ({
    modelo: p.modelo,
    armazenamento: p.armazenamento ?? '',
    na_troca: Number(p.na_troca) || 0,
    descontos: (p.descontos ?? {}) as Record<string, number>,
  }))

  const ultimas: CotacaoRecente[] = (recentes ?? []).map((c) => ({
    id: c.id,
    modelo: c.modelo,
    armazenamento: c.armazenamento ?? '',
    valor_final: Number(c.valor_final) || 0,
  }))

  return (
    <CotacaoView
      aparelhos={aparelhos}
      ultimas={ultimas}
      bonusSeminovo={Number(regras?.bonus_seminovo) || 0}
      corteBateria={regras?.corte_bateria ?? 80}
      // Validada dentro da view contra a lista real de avarias: chave forjada na
      // URL não pode virar marcação.
      avariaPendente={avaria ?? null}
    />
  )
}
