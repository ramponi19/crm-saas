import { redirect } from 'next/navigation'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { chaveLinha } from '@/lib/troca-modelos'
import { CotacaoView, type ValoresDoModelo, type CotacaoRecente } from './cotacao-view'

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
     * TUDO o que houver na matriz — inclusive linha com base NULA.
     *
     * ⚠️ AQUI HAVIA UM ERRO DE DESENHO. Era `.not('na_troca', 'is', null)`, e o
     * seletor mostrava só o que já tinha valor. O raciocínio era "a loja
     * preenche os oito modelos que compra e o seletor mostra oito" — mas isso
     * quebra justamente no estado inicial, que é o único que toda loja nova
     * atravessa: matriz vazia significava seletor vazio, e a tela morria antes
     * do passo 2.
     *
     * A lista de aparelhos vem do CATÁLOGO (lib/troca-modelos), não daqui. Isto
     * é só o que a loja já preencheu — o resto se digita na hora.
     */
    supabase.from('troca_precos')
      .select('modelo, armazenamento, na_troca, descontos')
      .eq('empresa_id', empresaId).eq('ativo', true),
    supabase.from('troca_regras').select('bonus_seminovo, corte_bateria').eq('empresa_id', empresaId).maybeSingle(),
    // Os chips de "últimos avaliados": o balcão repete modelo o dia inteiro.
    supabase.from('troca_cotacoes')
      .select('id, modelo, armazenamento, valor_final, created_at')
      .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(8),
  ])

  /** Indexado por `modelo|armazenamento` — é como a view procura. */
  const valores: Record<string, ValoresDoModelo> = {}
  for (const p of precos ?? []) {
    valores[chaveLinha(p.modelo, p.armazenamento ?? '')] = {
      na_troca: p.na_troca == null ? null : Number(p.na_troca),
      descontos: (p.descontos ?? {}) as Record<string, number>,
    }
  }

  const ultimas: CotacaoRecente[] = (recentes ?? []).map((c) => ({
    id: c.id,
    modelo: c.modelo,
    armazenamento: c.armazenamento ?? '',
    valor_final: Number(c.valor_final) || 0,
  }))

  return (
    <CotacaoView
      valoresIniciais={valores}
      ultimas={ultimas}
      bonusSeminovo={Number(regras?.bonus_seminovo) || 0}
      corteBateria={regras?.corte_bateria ?? 80}
      // Validada dentro da view contra a lista real de avarias: chave forjada na
      // URL não pode virar marcação.
      avariaPendente={avaria ?? null}
    />
  )
}
