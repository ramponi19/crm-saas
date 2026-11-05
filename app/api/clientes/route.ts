import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { criarCliente, entradaDoCorpo } from '@/lib/clientes'

/**
 * POST — cadastra um cliente (lib/clientes.ts). Qualquer papel da empresa, como o
 * insert na view `clientes` permitia; a empresa é a da sessão.
 *
 * Se já existe contato com o mesmo telefone na empresa (o lead que virou cliente, ou
 * o cliente cadastrado na outra loja), ele é que vira o cliente: nada de segundo
 * contato para a mesma pessoa.
 */
export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error
  const entrada = entradaDoCorpo(await req.json().catch(() => null))
  // A loja de gravação de quem cadastra (a escolhida no topo, ou a dele), como o gatilho de contatos faria.
  const { data: filial } = await auth.supabase.rpc('filial_gravacao', { p_empresa: auth.empresaId })
  const r = await criarCliente(createServiceClient(), auth.empresaId, typeof filial === 'number' ? filial : null, entrada)
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ cliente: r.cliente })
}
