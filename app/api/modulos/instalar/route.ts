import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { COOKIE_VERSAO_MODULOS, moduloPorChave } from '@/core/modulos'
import { carregarConfigEmpresa, camadasParaMenu } from '@/lib/empresa-config'
import { hrefsHabilitados } from '@/lib/menu'
import { estadoDoModulo } from '@/lib/modulos-central'
import { normalizarSegmento } from '@/lib/segmentos'

/**
 * INSTALAR / DESINSTALAR UM MÓDULO PELA CENTRAL (22/10/2026).
 *
 * Só dono ou admin (o superadmin impersonando entra como dono). Grava a linha do
 * módulo em `empresa_modulos`: `ativo = true` instala, `false` desinstala — o
 * menu e a trava de rota leem essa camada (lib/empresa-config.ts →
 * `instaladosDoManifesto`). Nenhuma tabela nova.
 *
 * A TRAVA DE PLANO É AQUI, não na tela: módulo fora do plano, contratado à parte
 * ou em preparação não instala por esta rota — o primeiro vira pedido
 * (/api/modulos/pedido), o último não tem botão.
 *
 * Grava pela chave de serviço DEPOIS de conferir o papel: o superadmin
 * impersonando não é membro da empresa, e a RLS de empresa_modulos (só admin da
 * própria empresa) o barraria.
 */
export async function POST(req: Request) {
  const ctx = await requireOwnerOrAdminApi()
  if (ctx.error) return ctx.error

  const { chave, instalar } = await req.json().catch(() => ({})) as { chave?: string; instalar?: boolean }
  const modulo = chave ? moduloPorChave(chave) : undefined
  if (!modulo || typeof instalar !== 'boolean') return NextResponse.json({ error: 'Módulo desconhecido' }, { status: 400 })

  const svc = createServiceClient()
  const { data: empresa } = await svc.from('empresas').select('plano, preset_onboarding').eq('id', ctx.empresaId).maybeSingle()
  const cfg = await carregarConfigEmpresa(svc, ctx.empresaId, empresa?.preset_onboarding ?? null)
  const { overrides, segOverride, instalados } = camadasParaMenu(cfg)
  const estado = estadoDoModulo(modulo, {
    ligados: hrefsHabilitados({ segmento: normalizarSegmento(empresa?.preset_onboarding), overrides, segOverride, instalados }),
    plano: empresa?.plano ?? undefined,
    forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  })

  if (estado.tipo === 'preparacao') return NextResponse.json({ error: `${modulo.nome} ainda está em preparação.` }, { status: 409 })
  if (estado.tipo === 'pago') return NextResponse.json({ error: `${modulo.nome} é ${estado.onde}: peça pela Central.` }, { status: 402 })
  if (!instalar && estado.tipo === 'instalado' && !estado.podeDesinstalar) {
    return NextResponse.json({ error: `${modulo.nome} é contratado à parte: fale com o suporte para tirar.` }, { status: 409 })
  }

  const agora = new Date().toISOString()
  const atual = cfg.modulos.find((r) => r.modulo === modulo.chave)
  const { error } = atual
    ? await svc.from('empresa_modulos').update({
        ativo: instalar, updated_at: agora,
        ...(instalar ? { instalado_em: agora, instalado_por: ctx.userId } : {}),
      }).eq('empresa_id', ctx.empresaId).eq('modulo', modulo.chave)
    : await svc.from('empresa_modulos').insert({
        empresa_id: ctx.empresaId, modulo: modulo.chave, origem: 'plano', ativo: instalar,
        instalado_em: agora, instalado_por: ctx.userId,
      })
  if (error) return NextResponse.json({ error: 'Não foi possível gravar. Tente de novo.' }, { status: 500 })

  // Instalar atende o pedido em aberto do mesmo módulo, se houver.
  if (instalar) {
    await svc.from('modulo_pedidos').update({ atendido_em: agora, atendido_por: ctx.userId })
      .eq('empresa_id', ctx.empresaId).eq('modulo', modulo.href).is('atendido_em', null)
  }

  const res = NextResponse.json({ ok: true, instalado: instalar })
  // A trava do proxy guarda os módulos por um minuto; com a versão nova no cookie,
  // quem mudou vê a rota certa já no próximo clique.
  res.cookies.set(COOKIE_VERSAO_MODULOS, String(Date.now()), { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 120 })
  return res
}
