import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { consultaClientes } from '@/lib/clientes'
import { fundirContatos } from '@/lib/fusao-contatos'

/**
 * Fusão de clientes duplicados.
 *
 * SÓ DONO E ADMIN. A operação apaga um registro e move venda, contrato, garantia e
 * conversa entre pessoas. Vendedor pode identificar a duplicidade; juntar não.
 *
 * Desde 05/11/2026 é a fusão de contatos do core (`fundirContatos`, a mesma do card do
 * lead): cliente é contato, e a `core_fundir_contatos` move tudo que aponta para ele
 * numa transação. A antiga `fundir_clientes` não tinha volta; esta guarda a foto e
 * devolve o `fusaoId` para o desfazer (POST /api/contatos/fundir/desfazer).
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

  if (!Number.isInteger(principal) || !Number.isInteger(secundario) || principal <= 0 || secundario <= 0) {
    return NextResponse.json({ error: 'Escolha os dois clientes da fusão' }, { status: 400 })
  }
  if (principal === secundario) {
    return NextResponse.json({ error: 'O principal e o secundário são o mesmo cliente' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data: achados } = await consultaClientes(svc, 'id').eq('empresa_id', empresaId).in('id', [principal, secundario])
  const ids = new Set(((achados ?? []) as { id: number }[]).map((c) => c.id))
  if (!ids.has(principal)) return NextResponse.json({ error: 'Cliente principal não encontrado nesta empresa' }, { status: 400 })
  if (!ids.has(secundario)) return NextResponse.json({ error: 'Cliente secundário não encontrado nesta empresa' }, { status: 400 })

  const r = await fundirContatos(svc, empresaId, principal, secundario, auth.userId)
  if (r.error !== null) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, principal, removido: secundario, nome_removido: r.nomeRemovido, movido: r.movido, fusaoId: r.fusaoId })
}
