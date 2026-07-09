import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { consultarValor } from '@/lib/fipe'

/** Valor FIPE de um veículo (cache-aware). POST { tipo, marca, modelo, ano, marcaNome?, modeloNome?, anoLabel? } */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const tipo = Number(b.tipo), marca = Number(b.marca), modelo = Number(b.modelo)
  const ano = String(b.ano ?? '')
  if (![1, 2, 3].includes(tipo) || !marca || !modelo || !ano) {
    return NextResponse.json({ error: 'Parâmetros incompletos' }, { status: 400 })
  }
  try {
    const r = await consultarValor({
      tipo, marca, modelo, ano,
      marcaNome: b.marcaNome as string | undefined,
      modeloNome: b.modeloNome as string | undefined,
      anoLabel: b.anoLabel as string | undefined,
    })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha na consulta FIPE' }, { status: 502 })
  }
}
