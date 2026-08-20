import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'

/**
 * Fusão de clientes duplicados.
 *
 * SÓ DONO E ADMIN. A operação apaga um registro e move venda, contrato, comissão e
 * histórico de conversa entre pessoas — é o tipo de coisa que, feita por engano,
 * ninguém consegue desfazer. Vendedor pode identificar a duplicidade; juntar não.
 *
 * O trabalho todo vive na função `fundir_clientes` do banco, que roda numa
 * transação: dezoito tabelas mudam de dono e um registro sai. Em pedaços daqui, uma
 * falha no meio deixaria metade do histórico apontando para quem já não existe.
 *
 * `empresa_id` vem da SESSÃO, nunca do corpo do pedido: com ele no corpo, bastaria
 * trocar o número para fundir clientes de outra loja.
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId } = auth

  const b = (await req.json().catch(() => ({}))) as { principal?: number; secundario?: number }
  const principal = Number(b.principal)
  const secundario = Number(b.secundario)

  if (!Number.isFinite(principal) || !Number.isFinite(secundario)) {
    return NextResponse.json({ error: 'Escolha os dois clientes da fusão' }, { status: 400 })
  }
  if (principal === secundario) {
    return NextResponse.json({ error: 'O principal e o secundário são o mesmo cliente' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data, error } = await svc.rpc('fundir_clientes', {
    p_empresa: empresaId,
    p_principal: principal,
    p_secundario: secundario,
  })

  if (error) {
    /**
     * A mensagem da função é escrita para gente ("Cliente principal não encontrado
     * nesta empresa") — repassar é melhor que traduzir para "erro 500", que manda o
     * dono adivinhar. Erro que não é dela cai no genérico.
     */
    const conhecido = /não encontrado|mesmo registro/i.test(error.message)
    return NextResponse.json(
      { error: conhecido ? error.message : 'Não foi possível fundir os cadastros' },
      { status: conhecido ? 400 : 500 },
    )
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) })
}
