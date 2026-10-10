import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarTudo } from '@/lib/zapintel/conversas'

/**
 * O QUE A LOJA VENDEU DE VERDADE — para o painel parar de inventar dinheiro.
 *
 * ══ O QUE ISTO VEIO SUBSTITUIR ═════════════════════════════════════════════
 *
 * `lib/zapintel/insights/stats.ts` tinha isto na linha 3:
 *
 *     const TICKET_MEDIO = 5200;
 *
 * Um número escrito à mão, de onde saíam dois dos cartões mais visíveis do
 * dashboard: "PIPELINE ESTIMADO R$ 1,2M" (= quentes × 5200 × 0,70 + mornos ×
 * 5200 × 0,25) e "OBJEÇÃO MAIS CARA R$ 558k" (= contagem × 5200 × 0,6).
 * Nenhuma venda entrava nessas contas. O ticket real da JM, medido pela ponte
 * em 10/10/2026, é **R$ 7.045** — 35% acima do chute.
 *
 * ══ POR QUE PODE DEVOLVER `null` ═══════════════════════════════════════════
 *
 * Empresa sem venda registrada não tem ticket. A resposta certa é dizer isso,
 * não arbitrar um número — e é exatamente o que o 5200 fazia para a
 * Imobiliária e para a loja de teste, que nunca venderam um iPhone na vida.
 * Com `null`, a tela mostra "sem venda registrada" em vez de um reais que
 * ninguém faturou.
 *
 * O corte é baixo de propósito (`MINIMO_PARA_TICKET`): com poucas vendas o
 * ticket é frágil, mas ainda é MEDIDO — e medido frágil é melhor que inventado
 * firme, desde que a tela diga de quantas vendas saiu. Por isso `vendas` e
 * `cobertura` viajam junto com o valor: quem olha precisa poder desconfiar.
 */

/** Abaixo disto não há ticket: há uma venda. Ver o cabeçalho. */
const MINIMO_PARA_TICKET = 3

export interface FatosDeVenda {
  /** Vendas concluídas que entraram na conta. */
  vendas: number
  faturamento: number
  /** Ticket MEDIDO. Nunca constante. */
  ticket: number
  /**
   * Mediana de dias da primeira mensagem até a venda.
   *
   * Mediana, não média: na JM o p75 é 9 dias e o máximo 34, então a média
   * seria puxada por poucas conversas longas. A mediana mede o caso comum —
   * e o caso comum surpreendeu: **2 dias**, contra os "16d" que a tela
   * mostrava calculados só de conversa, sem venda nenhuma dentro.
   */
  cicloMediano: number | null
  /** Ids de lead (do CRM) que comprovadamente geraram venda. */
  compradores: Set<number>
  /**
   * Fração das vendas que a ponte conseguiu ligar a uma conversa (0 a 1).
   *
   * Na JM: 0,68. Os 32% restantes são venda de balcão ou cliente que falou por
   * outro número. Isso precisa aparecer na tela, porque é o que impede alguém
   * de ler a conversão como se fosse exata.
   */
  cobertura: number
}

interface VendaBanco {
  id: number
  valor_venda: number | null
  status: string | null
}

interface PonteBanco {
  venda_id: number
  lead_id: number | null
  dias_ate_venda: number | null
}

/**
 * Lê vendas e ponte e devolve os fatos. `null` quando não há venda suficiente.
 *
 * Custa duas consultas pequenas (60 linhas na JM) e nenhuma mensagem — é
 * barato o bastante para entrar no caminho do painel sem mexer no teto de CPU
 * que este módulo acabou de aprender a respeitar.
 */
export async function fatosDeVenda(
  db: SupabaseClient,
  empresaId: number,
): Promise<FatosDeVenda | null> {
  const vendas = await buscarTudo<VendaBanco>((de, ate) =>
    db.from('vendas').select('id, valor_venda, status')
      .eq('empresa_id', empresaId).eq('status', 'concluida')
      .order('id', { ascending: true }).range(de, ate))

  if (vendas.length < MINIMO_PARA_TICKET) return null

  const ponte = await buscarTudo<PonteBanco>((de, ate) =>
    db.from('zapintel_venda_lead').select('venda_id, lead_id, dias_ate_venda')
      .eq('empresa_id', empresaId)
      .order('venda_id', { ascending: true }).range(de, ate))

  const faturamento = vendas.reduce((s, v) => s + Number(v.valor_venda ?? 0), 0)

  // A cobertura olha só as vendas CONCLUÍDAS: ligar uma venda ainda em
  // andamento a uma conversa não diz nada sobre o que fechou.
  const concluidas = new Set(vendas.map((v) => v.id))
  const daqui = ponte.filter((p) => concluidas.has(p.venda_id))

  const compradores = new Set<number>()
  const ciclos: number[] = []
  for (const p of daqui) {
    if (p.lead_id != null) compradores.add(p.lead_id)
    if (p.dias_ate_venda != null) ciclos.push(p.dias_ate_venda)
  }
  ciclos.sort((a, b) => a - b)

  return {
    vendas: vendas.length,
    faturamento,
    ticket: Math.round(faturamento / vendas.length),
    cicloMediano: ciclos.length ? ciclos[Math.floor(ciclos.length / 2)] : null,
    compradores,
    cobertura: daqui.length ? daqui.filter((p) => p.lead_id != null).length / daqui.length : 0,
  }
}
