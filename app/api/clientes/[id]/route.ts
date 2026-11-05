import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { atualizarCliente, entradaDoCorpo } from '@/lib/clientes'

/**
 * PATCH — muda o cliente (lib/clientes.ts). Só os campos enviados mudam;
 * `{ ativo: false }` desativa. Quem não enxerga o contato pela RLS recebe 404,
 * como acontecia pela view.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin', 'vendedor', 'tecnico', 'member'])
  if (auth.error) return auth.error
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 })
  const patch = entradaDoCorpo(await req.json().catch(() => null))
  const r = await atualizarCliente(auth.supabase, createServiceClient(), auth.empresaId, id, patch)
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ cliente: r.cliente })
}
