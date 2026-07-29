import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Caixa-preta do fluxo de conexão de canais.
 *
 * Existe porque o SDK da Meta falha no NAVEGADOR, antes de qualquer chamada ao
 * servidor — então, sem isto, a única fonte de verdade seria o console do
 * usuário. Com isto o próprio app reporta e o suporte lê por SQL.
 *
 * Nunca devolve erro para o cliente: diagnóstico que atrapalha o fluxo é pior que
 * diagnóstico nenhum.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
    if (auth.error) return NextResponse.json({ ok: false })
    const { empresaId } = auth

    const { etapa, origemUrl, dados } = (await req.json()) as {
      etapa?: string; origemUrl?: string; dados?: Record<string, unknown>
    }

    await createServiceClient().from('diagnostico_canais').insert([{
      empresa_id: empresaId,
      etapa: String(etapa ?? 'desconhecida').slice(0, 40),
      origem_url: origemUrl ? String(origemUrl).slice(0, 500) : null,
      // O tipo gerado espera Json; o corpo chega como objeto solto do cliente.
      dados: JSON.parse(JSON.stringify(dados ?? {})),
    }])

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
