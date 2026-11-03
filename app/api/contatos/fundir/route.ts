import { NextResponse } from 'next/server'
import { requireEmpresaRoleApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { fotoDaFusao } from '@/lib/fusao-contatos'
import type { Json } from '@/types/database'

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
 *   GET  ?fusoes=<contato>           fusões em que este contato ficou (para desfazer)
 *   POST { principal, removido }     funde: `principal` fica, `removido` sai
 *
 * Antes de fundir, a foto do que vai mudar vai para o próprio registro
 * (`movido._desfazer`, lib/fusao-contatos.ts) — é dela que o desfazer
 * (POST /api/contatos/fundir/desfazer) reconstrói tudo com os mesmos ids.
 */

export async function GET(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const url = new URL(req.url)
  const doContato = Number(url.searchParams.get('fusoes'))
  if (Number.isInteger(doContato) && doContato > 0) {
    const { data } = await createServiceClient().from('contato_fusoes')
      .select('id, em, contato_removido_id, movido').eq('empresa_id', auth.empresaId).eq('contato_principal_id', doContato)
      .order('id', { ascending: false }).limit(10)
    const fusoes = ((data ?? []) as { id: number; em: string; contato_removido_id: number; movido: Record<string, unknown> | null }[]).map((r) => {
      const foto = (r.movido?._desfazer ?? null) as { removido?: { nome?: string | null; telefone?: string | null; instagram?: string | null } } | null
      return {
        id: r.id, em: r.em, removido: r.contato_removido_id,
        nome: foto?.removido?.nome ?? null, telefone: foto?.removido?.telefone ?? null, instagram: foto?.removido?.instagram ?? null,
        podeDesfazer: Boolean(foto) && !r.movido?._desfeita, desfeita: Boolean(r.movido?._desfeita),
      }
    })
    return NextResponse.json({ fusoes })
  }
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
  // A foto ANTES de fundir: é dela que o desfazer reconstrói tudo.
  let foto
  try { foto = await fotoDaFusao(svc, auth.empresaId, principal, removido) } catch (e) {
    return NextResponse.json({ error: `Não consegui guardar a foto para desfazer: ${(e as Error).message}` }, { status: 500 })
  }
  if (!foto) return NextResponse.json({ error: 'Contato não encontrado nesta empresa' }, { status: 404 })
  // A função confere de novo que os dois são desta empresa; aqui só se traduz o erro.
  const { data: movido, error } = await svc.rpc('core_fundir_contatos' as never, {
    p_empresa: auth.empresaId, p_principal: principal, p_removido: removido,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Quem fundiu (pelo serviço o auth.uid() da função é nulo) e a foto para desfazer.
  const { data: registro } = await svc.from('contato_fusoes').select('id, movido')
    .eq('empresa_id', auth.empresaId).eq('contato_principal_id', principal).eq('contato_removido_id', removido)
    .order('id', { ascending: false }).limit(1).maybeSingle()
  if (registro) {
    await svc.from('contato_fusoes').update({
      por_usuario: auth.userId,
      movido: { ...((registro.movido ?? {}) as Record<string, unknown>), _desfazer: foto } as unknown as NonNullable<Json>,
    }).eq('id', registro.id)
  }
  await svc.from('eventos').update({ por_usuario: auth.userId })
    .eq('empresa_id', auth.empresaId).eq('tipo', 'contato.fundido').eq('entidade_id', principal).is('por_usuario', null)

  return NextResponse.json({ ok: true, movido, fusaoId: registro?.id ?? null })
}
