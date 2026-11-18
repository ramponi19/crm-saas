import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { lerPlanilha, PlanilhaInvalida } from '@/lib/planilha'
import { adivinharMapa, MAX_LINHAS } from '@/lib/importacao'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Lê a planilha da importação de contatos (CSV ou XLSX) e devolve o cabeçalho, as linhas e o palpite do
 * mapeamento. Não grava nada. Só dono e admin (Configurações → Importar contatos).
 */
export async function POST(req: Request) {
  const auth = await requireOwnerOrAdminApi()
  if (auth.error) return auth.error
  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  if (!arquivo || typeof arquivo === 'string') return NextResponse.json({ error: 'Mande o arquivo da planilha.' }, { status: 400 })
  if (arquivo.size > MAX_BYTES) return NextResponse.json({ error: 'Arquivo maior que 5 MB: divida a planilha.' }, { status: 413 })
  try {
    const p = lerPlanilha(Buffer.from(await arquivo.arrayBuffer()), arquivo.name)
    if (p.linhas.length === 0) return NextResponse.json({ error: 'A planilha só tem o cabeçalho.' }, { status: 400 })
    if (p.linhas.length > MAX_LINHAS) {
      return NextResponse.json({ error: `A planilha tem ${p.linhas.length} linhas; o máximo por importação é ${MAX_LINHAS}. Divida o arquivo.` }, { status: 400 })
    }
    return NextResponse.json({ arquivo: arquivo.name.slice(0, 200), colunas: p.colunas, linhas: p.linhas, mapa: adivinharMapa(p.colunas) })
  } catch (e) {
    if (e instanceof PlanilhaInvalida) return NextResponse.json({ error: e.message }, { status: 400 })
    console.error('[importacao/ler]', e)
    return NextResponse.json({ error: 'Não consegui ler a planilha. Salve como .xlsx ou .csv e tente de novo.' }, { status: 400 })
  }
}
