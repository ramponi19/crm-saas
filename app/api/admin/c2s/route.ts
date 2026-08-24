import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireEmpresaRoleApi } from '@/lib/owner'
import {
  ACOES, assinar, cancelar, carregarConfig, cifrarToken, getOrCreateTokenEntrada,
  salvarConfig, testarToken, tokenEmClaro, basePublica, type AcaoC2S,
} from '@/lib/c2s'

/**
 * Ações da integração Contact2Sale — só dono e admin.
 *
 * O TOKEN DELES NUNCA VOLTA PARA A TELA, nem mascarado: entra, é cifrado e fica.
 * A tela mostra apenas se existe ou não. Segredo que a tela lê é segredo que
 * qualquer extensão de navegador lê junto.
 */

interface Corpo {
  acao?: 'salvar_token' | 'testar' | 'assinar' | 'cancelar' | 'remover_token'
  token?: string
  gatilhos?: AcaoC2S[]
}

export async function POST(req: Request) {
  const auth = await requireEmpresaRoleApi(['owner', 'admin'])
  if (auth.error) return auth.error
  const { empresaId } = auth

  const b = (await req.json().catch(() => ({}))) as Corpo
  const svc = createServiceClient()
  const cfg = await carregarConfig(svc, empresaId)

  if (b.acao === 'salvar_token') {
    const t = (b.token ?? '').trim()
    if (!t) return NextResponse.json({ error: 'Informe o token gerado no C2S' }, { status: 400 })
    /**
     * Confere ANTES de guardar.
     *
     * Token errado guardado calado significa integração que parece pronta e nunca
     * recebe nada — e ninguém liga as duas coisas dias depois.
     */
    const teste = await testarToken(t)
    if (!teste.ok) {
      return NextResponse.json({
        error: teste.status === 403
          ? 'O C2S recusou este token (403). Confira se ele foi copiado inteiro.'
          : `Não foi possível validar o token (${teste.status || 'sem resposta'}). ${teste.corpo}`,
      }, { status: 400 })
    }
    await salvarConfig(svc, empresaId, { ...cfg, token: cifrarToken(t) })
    return NextResponse.json({ ok: true, empresa: teste.empresa ?? null })
  }

  if (b.acao === 'remover_token') {
    const token = tokenEmClaro(cfg)
    // Cancela o que estiver assinado antes de perder o token — senão o C2S segue
    // mandando para uma URL que ninguém mais controla do lado deles.
    if (token) for (const g of cfg.assinaturas ?? []) await cancelar(token, g)
    await salvarConfig(svc, empresaId, { ...cfg, token: undefined, assinaturas: [], assinado_em: null })
    return NextResponse.json({ ok: true })
  }

  const token = tokenEmClaro(cfg)
  if (!token) return NextResponse.json({ error: 'Salve o token do C2S primeiro' }, { status: 400 })

  if (b.acao === 'testar') {
    const r = await testarToken(token)
    return NextResponse.json({ ok: r.ok, status: r.status, empresa: r.empresa ?? null, corpo: r.corpo })
  }

  if (b.acao === 'assinar') {
    const { data: empresa } = await svc.from('empresas').select('slug').eq('id', empresaId).maybeSingle()
    if (!empresa?.slug) return NextResponse.json({ error: 'A empresa precisa de um slug para receber webhook' }, { status: 400 })

    const entrada = await getOrCreateTokenEntrada(svc, empresaId)
    const { base, local } = basePublica(new URL(req.url).origin)
    /**
     * Recusa assinar endereco LOCAL.
     *
     * O C2S guarda a URL do lado dele: assinar `localhost` registra um endereco que
     * nunca responde, e o sintoma aparece dias depois como "o lead nao chegou".
     * Melhor recusar aqui do que deixar a integracao parecendo pronta.
     */
    if (local) {
      return NextResponse.json({
        error: 'Este ambiente e local. Assine pelo endereco publico do CRM — o C2S guarda a URL do lado dele.',
      }, { status: 400 })
    }
    const url = `${base}/api/webhook/c2s/${empresa.slug}?token=${entrada}`

    const pedidos = (b.gatilhos?.length ? b.gatilhos : ACOES.map((a) => a.id))
    const feitos: AcaoC2S[] = []
    const erros: string[] = []
    for (const g of pedidos) {
      const r = await assinar(token, g, url)
      if (r.ok) feitos.push(g)
      else erros.push(`${g}: ${r.status} ${r.corpo}`)
    }

    const atual = await carregarConfig(svc, empresaId)
    await salvarConfig(svc, empresaId, {
      ...atual,
      assinaturas: [...new Set([...(atual.assinaturas ?? []), ...feitos])],
      assinado_em: feitos.length ? new Date().toISOString() : atual.assinado_em ?? null,
      // Guarda o endereco EXATO que o C2S passou a conhecer.
      url_assinada: feitos.length ? url : atual.url_assinada ?? null,
    })

    return NextResponse.json({
      ok: erros.length === 0,
      assinados: feitos,
      erros,
      url,
      /**
       * A doc do C2S é explícita: UM endpoint por token, e assinar um segundo
       * APAGA o primeiro. Se este token já estiver em uso em outro lugar, os leads
       * de lá param de chegar sem ninguém ser avisado.
       */
      aviso: feitos.length
        ? 'O C2S aceita um endereço por token: se este token já apontava para outro sistema, aquele parou de receber agora.'
        : null,
    })
  }

  if (b.acao === 'cancelar') {
    const pedidos = (b.gatilhos?.length ? b.gatilhos : (cfg.assinaturas ?? ACOES.map((a) => a.id)))
    const erros: string[] = []
    for (const g of pedidos) {
      const r = await cancelar(token, g)
      if (!r.ok) erros.push(`${g}: ${r.status} ${r.corpo}`)
    }
    const atual = await carregarConfig(svc, empresaId)
    await salvarConfig(svc, empresaId, {
      ...atual,
      assinaturas: (atual.assinaturas ?? []).filter((a) => !pedidos.includes(a)),
    })
    return NextResponse.json({ ok: erros.length === 0, erros })
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
}
