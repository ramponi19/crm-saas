import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { parseFeedImoveis } from '@/lib/importar-imoveis'

/**
 * Importa imóveis do XML do site/sistema da imobiliária (site = fonte da verdade).
 * Upsert por código, escopado à empresa do dono/admin logado. Salva a URL do feed
 * e a data da última importação em configuracoes_sistema ('import_imoveis').
 */
export async function POST(req: Request) {
  const ctx = await requireOwnerOrAdminApi()
  if (ctx.error) return ctx.error
  const { empresaId } = ctx
  const svc = createServiceClient()

  const body = await req.json().catch(() => ({} as { feedUrl?: string }))
  let feedUrl = (body.feedUrl ?? '').trim()

  if (feedUrl) {
    await svc.from('configuracoes_sistema').upsert(
      { empresa_id: empresaId, chave: 'import_imoveis', valor: { feed_url: feedUrl } },
      { onConflict: 'empresa_id,chave' },
    )
  } else {
    const { data } = await svc.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', 'import_imoveis').maybeSingle()
    feedUrl = (data?.valor as { feed_url?: string } | null)?.feed_url ?? ''
  }
  if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) {
    return NextResponse.json({ error: 'Informe uma URL de feed válida (http/https).' }, { status: 400 })
  }

  let xml: string
  try {
    const r = await fetch(feedUrl, { headers: { 'User-Agent': 'ApiceCRM/1.0' }, redirect: 'follow' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    xml = await r.text()
  } catch (e) {
    return NextResponse.json({ error: 'Não consegui baixar o feed: ' + (e instanceof Error ? e.message : 'erro') }, { status: 502 })
  }

  const imoveis = parseFeedImoveis(xml)
  if (imoveis.length === 0) {
    return NextResponse.json({ ok: true, total: 0, criados: 0, atualizados: 0, aviso: 'Nenhum imóvel reconhecido no feed — o formato pode ser diferente do padrão OLX. Me envie um trecho do XML pra eu ajustar o mapeamento.' })
  }

  let criados = 0, atualizados = 0
  for (const im of imoveis) {
    const base = {
      codigo: im.codigo, titulo: im.titulo, tipo: im.tipo, finalidade: im.finalidade,
      descricao: im.descricao, valor_venda: im.valor_venda, valor_locacao: im.valor_locacao,
      valor_condominio: im.valor_condominio, valor_iptu: im.valor_iptu,
      area_util: im.area_util, area_total: im.area_total,
      quartos: im.quartos, suites: im.suites, banheiros: im.banheiros, vagas: im.vagas,
      cep: im.cep, logradouro: im.logradouro, numero: im.numero, bairro: im.bairro, cidade: im.cidade, uf: im.uf,
      latitude: im.latitude, longitude: im.longitude, fotos: im.fotos,
    }
    let existing: { id: number } | null = null
    if (im.codigo) {
      const { data } = await svc.from('imoveis').select('id').eq('empresa_id', empresaId).eq('codigo', im.codigo).maybeSingle()
      existing = data
    }
    if (existing) {
      await svc.from('imoveis').update(base).eq('id', existing.id) // preserva status atual do CRM
      atualizados++
    } else {
      await svc.from('imoveis').insert({ empresa_id: empresaId, status: 'disponivel', ...base })
      criados++
    }
  }

  await svc.from('configuracoes_sistema').upsert(
    { empresa_id: empresaId, chave: 'import_imoveis', valor: { feed_url: feedUrl, ultima_importacao: new Date().toISOString(), total: imoveis.length } },
    { onConflict: 'empresa_id,chave' },
  )

  return NextResponse.json({ ok: true, total: imoveis.length, criados, atualizados })
}
