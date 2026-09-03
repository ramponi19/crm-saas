import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { AVARIA_POR_CHAVE } from '@/lib/troca-avarias'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'

/**
 * Grava a matriz de troca — uma LINHA por vez (modelo + armazenamento).
 *
 * ══ POR QUE LINHA, E NÃO A MATRIZ INTEIRA ══════════════════════════════════
 *
 * São 140 linhas × 12 colunas. Mandar tudo a cada tecla seria absurdo, e mandar
 * tudo só no "Salvar" perderia o trabalho de quem fechasse a aba — que é
 * exatamente o que acontece com uma tela de 1.680 campos: ninguém termina numa
 * sentada. Cada célula que sai de foco grava a sua linha.
 *
 * ══ VALOR VAZIO NÃO É ZERO ═════════════════════════════════════════════════
 *
 * `na_troca: null` significa "não avalio este modelo", e é o que mantém o
 * seletor da cotação curto: só aparece lá o que tem base. Zero significaria
 * "avalio, e pago nada" — e o modelo apareceria na lista valendo R$ 0,00.
 */

interface Body {
  modelo?: string
  armazenamento?: string
  /** null/'' apaga a base (volta a "não avaliado"). */
  na_troca?: number | string | null
  /** Só as chaves enviadas são mescladas; as ausentes ficam como estavam. */
  descontos?: Record<string, number | string | null>
}

/** Número >= 0, ou null quando o campo veio vazio. */
function valorOuNulo(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await cotacaoDeTrocaLiberada())) return NextResponse.json({ error: 'Módulo não liberado' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Body
  const modelo = (b.modelo || '').trim()
  if (!modelo) return NextResponse.json({ error: 'Modelo ausente' }, { status: 400 })
  const armazenamento = (b.armazenamento || '').trim()

  /**
   * Chave de desconto desconhecida é DESCARTADA, não gravada.
   *
   * O jsonb aceitaria qualquer coisa, e uma chave com erro de digitação ficaria
   * guardada para sempre sem nunca ser lida por avaria nenhuma — dando a
   * impressão, na tela de matriz, de um valor preenchido que não desconta nada.
   */
  const descontosPatch: Record<string, number | null> = {}
  for (const [chave, valor] of Object.entries(b.descontos ?? {})) {
    if (!AVARIA_POR_CHAVE[chave]) continue
    descontosPatch[chave] = valorOuNulo(valor)
  }

  // Lê a linha atual para MESCLAR os descontos: a tela manda só a célula que
  // mudou, e sobrescrever o jsonb inteiro apagaria as outras onze colunas.
  const { data: atual } = await supabase.from('troca_precos')
    .select('id, na_troca, descontos')
    .eq('empresa_id', empresaId).eq('modelo', modelo).eq('armazenamento', armazenamento)
    .maybeSingle()

  const descontos: Record<string, number> = { ...((atual?.descontos ?? {}) as Record<string, number>) }
  for (const [chave, valor] of Object.entries(descontosPatch)) {
    if (valor == null) delete descontos[chave]   // limpar a célula = tirar a chave
    else descontos[chave] = valor
  }

  const naTroca = 'na_troca' in b ? valorOuNulo(b.na_troca) : (atual?.na_troca ?? null)

  const dados = {
    empresa_id: empresaId,
    modelo,
    armazenamento,
    na_troca: naTroca,
    descontos: descontos as never,
    ativo: true,
    atualizado_em: new Date().toISOString(),
  }

  const { error } = atual?.id
    ? await supabase.from('troca_precos').update(dados as never).eq('id', atual.id)
    : await supabase.from('troca_precos').insert(dados as never)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, na_troca: naTroca, descontos })
}
