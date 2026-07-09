import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getReferenciaAtual, fetchMarcas, fetchModelos, fetchAnos } from '@/lib/fipe'

/**
 * Opções para o seletor FIPE (proxy da fonte). Encadeamento:
 *  ?tipo=1                      → marcas
 *  ?tipo=1&marca=7              → modelos
 *  ?tipo=1&marca=7&modelo=6146  → anos
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const url = new URL(req.url)
  const tipo = Number(url.searchParams.get('tipo'))
  const marca = url.searchParams.get('marca')
  const modelo = url.searchParams.get('modelo')
  if (![1, 2, 3].includes(tipo)) return NextResponse.json({ error: 'tipo inválido (1 carro, 2 moto, 3 caminhão)' }, { status: 400 })

  try {
    const { codigo, mes } = await getReferenciaAtual()
    if (!codigo) return NextResponse.json({ error: 'Referência FIPE indisponível' }, { status: 503 })

    if (!marca) return NextResponse.json({ mes, opcoes: await fetchMarcas(codigo, tipo) })
    if (!modelo) return NextResponse.json({ mes, opcoes: await fetchModelos(codigo, tipo, Number(marca)) })
    return NextResponse.json({ mes, opcoes: await fetchAnos(codigo, tipo, Number(marca), Number(modelo)) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha na consulta FIPE' }, { status: 502 })
  }
}
