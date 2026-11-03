import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * FUNDIR CONTATOS À MÃO — os duplicados da classe 2 (03/11/2026): a mesma pessoa
 * que chegou por canais sem chave comum (WhatsApp de um lado, Instagram do outro)
 * e virou dois contatos. Nenhuma regra automática junta esses dois; quem conhece
 * o cliente decide.
 *
 * Só dono e admin. A fusão é a `core_fundir_contatos` — a mesma da corrida de
 * identidade: conversas, negócios, identidades e o resto vão para o contato que
 * fica, e o registro sai em `contato_fusoes` (+ evento `contato.fundido`). Ela só
 * roda pelo serviço; quem pediu é gravado logo depois no próprio registro.
 *
 *   GET  ?q=texto&exceto=<contato>   busca o outro contato (nome, telefone, Instagram)
 *   POST { principal, removido }     funde: `principal` fica, `removido` sai
 */

export async function GET(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().replace(/[%_,()]/g, ' ').trim()
  const exceto = Number(url.searchParams.get('exceto'))
  if (q.length < 2) return NextResponse.json({ contatos: [] })

  const digitos = q.replace(/\D/g, '')
  const filtros = [`nome.ilike.%${q}%`, `instagram.ilike.%${q}%`]
  if (digitos.length >= 4) filtros.push(`telefone_e164.ilike.%${digitos}%`, `telefone.ilike.%${digitos}%`)

  const svc = createServiceClient()
  let consulta = svc.from('contatos')
    .select('id, nome, telefone, instagram, origem, negocios:negocios!negocios_contato_id_fkey(id, status, filial:filiais!negocios_filial_id_fkey(nome))')
    .eq('empresa_id', auth.empresaId).or(filtros.join(',')).order('updated_at', { ascending: false }).limit(10)
  if (Number.isInteger(exceto) && exceto > 0) consulta = consulta.neq('id', exceto)
  const { data, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contatos: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const b = (await req.json().catch(() => null)) as { principal?: unknown; removido?: unknown } | null
  const principal = Number(b?.principal), removido = Number(b?.removido)
  if (!Number.isInteger(principal) || !Number.isInteger(removido) || principal <= 0 || removido <= 0 || principal === removido) {
    return NextResponse.json({ error: 'Escolha dois contatos diferentes' }, { status: 400 })
  }

  const svc = createServiceClient()
  // A função confere que os dois são desta empresa; aqui só se traduz o erro.
  const { data: movido, error } = await svc.rpc('core_fundir_contatos' as never, {
    p_empresa: auth.empresaId, p_principal: principal, p_removido: removido,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Quem fundiu: pelo serviço o auth.uid() da função é nulo.
  await svc.from('contato_fusoes').update({ por_usuario: auth.userId })
    .eq('empresa_id', auth.empresaId).eq('contato_principal_id', principal).eq('contato_removido_id', removido).is('por_usuario', null)
  await svc.from('eventos').update({ por_usuario: auth.userId })
    .eq('empresa_id', auth.empresaId).eq('tipo', 'contato.fundido').eq('entidade_id', principal).is('por_usuario', null)

  return NextResponse.json({ ok: true, movido })
}
