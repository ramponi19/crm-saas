import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { AVARIA_POR_CHAVE } from '@/lib/troca-avarias'
import { cotacaoDeTrocaLiberada } from '@/lib/troca-acesso'
import { familiasDeTroca } from '@/lib/troca-modelos'

/**
 * Aplica UM valor a UMA coluna em toda uma família de modelos.
 *
 * ══ POR QUE ISTO EXISTE ════════════════════════════════════════════════════
 *
 * A matriz nasce em branco (decisão do dono: sem sugestão inventada). São 140
 * linhas × 12 colunas = 1.680 campos. Preenchida célula por célula, é uma tela
 * que ninguém termina — e matriz pela metade dá cotação errada, não cotação
 * faltando.
 *
 * Na prática a maioria das colunas é PLANA dentro de uma geração: o desconto de
 * "doc de carga" é o mesmo para todo iPhone 14, e "marcas moderadas" também. Só
 * a base e as peças caras (tela, Face ID, câmera) variam por tier. Então
 * preencher a família e corrigir as exceções é uma ordem de grandeza menos
 * trabalho do que preencher tudo.
 *
 * A coluna `na_troca` NÃO é aceita aqui de propósito: a base é justamente o que
 * muda de linha para linha (um 14 Pro Max 1TB não vale o que vale um 14 128GB).
 * Aplicá-la em bloco daria uma matriz preenchida e errada — pior que vazia,
 * porque ninguém desconfia de campo cheio.
 */

interface Body {
  /** Rótulo da família, como `familiasDeTroca()` devolve: 'iPhone 14'. */
  familia?: string
  /** Chave de avaria. `na_troca` é recusado. */
  avaria?: string
  /** null/'' limpa a coluna na família inteira. */
  valor?: number | string | null
}

export async function POST(req: Request) {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!(await cotacaoDeTrocaLiberada())) return NextResponse.json({ error: 'Módulo não liberado' }, { status: 403 })

  const b = (await req.json().catch(() => ({}))) as Body
  const avaria = (b.avaria || '').trim()
  if (!AVARIA_POR_CHAVE[avaria]) return NextResponse.json({ error: 'Avaria desconhecida' }, { status: 400 })

  // A família vem da tela, mas as LINHAS dela vêm do catálogo aqui. Assim um
  // corpo forjado não consegue escrever num modelo que não existe.
  const familia = familiasDeTroca().find((f) => f.label === (b.familia || '').trim())
  if (!familia) return NextResponse.json({ error: 'Família desconhecida' }, { status: 400 })

  const bruto = b.valor
  const valor = bruto == null || bruto === '' ? null : Math.max(0, Number(bruto) || 0)

  const { data: existentes } = await supabase.from('troca_precos')
    .select('id, modelo, armazenamento, descontos')
    .eq('empresa_id', empresaId)
    .in('modelo', [...new Set(familia.linhas.map((l) => l.modelo))])

  const porChave = new Map(
    (existentes ?? []).map((r) => [`${r.modelo}|${r.armazenamento}`, r]),
  )

  const agora = new Date().toISOString()
  const paraInserir: Record<string, unknown>[] = []

  for (const linha of familia.linhas) {
    const atual = porChave.get(`${linha.modelo}|${linha.armazenamento}`)
    const descontos: Record<string, number> = { ...((atual?.descontos ?? {}) as Record<string, number>) }
    if (valor == null) delete descontos[avaria]
    else descontos[avaria] = valor

    if (atual) {
      const { error } = await supabase.from('troca_precos')
        .update({ descontos: descontos as never, atualizado_em: agora } as never).eq('id', atual.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      /**
       * Linha nova nasce com `na_troca` NULO — o modelo continua "não
       * avaliado" até alguém digitar a base.
       *
       * É o que impede o efeito colateral: aplicar um desconto na família não
       * pode fazer 14 modelos aparecerem no seletor da cotação valendo R$ 0,00.
       */
      if (valor == null) continue   // limpar coluna não cria linha
      paraInserir.push({
        empresa_id: empresaId, modelo: linha.modelo, armazenamento: linha.armazenamento,
        na_troca: null, descontos, ativo: true, atualizado_em: agora,
      })
    }
  }

  if (paraInserir.length) {
    const { error } = await supabase.from('troca_precos').insert(paraInserir as never)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, linhas: familia.linhas.length })
}
