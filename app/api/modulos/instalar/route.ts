import { NextResponse } from 'next/server'
import { requireOwnerOrAdminApi } from '@/lib/owner'
import { createServiceClient } from '@/lib/supabase/service'
import { COOKIE_VERSAO_MODULOS, moduloPorChave } from '@/core/modulos'
import { carregarConfigEmpresa, ligadosDaEmpresa } from '@/lib/empresa-config'
import { estadoDoModulo, requisitosFaltando, type EntradaCentral } from '@/lib/modulos-central'
import { aoInstalarModulo, gravarModulo } from '@/lib/modulos-instalacao'

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
 * DEPENDÊNCIAS (04/11/2026, `requer` no manifesto): instalar liga junto os
 * requisitos que faltam (transitivos, do mais fundo para o mais raso) e devolve os
 * nomes em `junto`; requisito pago ou em preparação bloqueia (409, com o motivo).
 * Desinstalar o que um módulo ligado usa dá 409 com o nome de quem usa.
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
  const { data: empresa } = await svc.from('empresas').select('plano').eq('id', ctx.empresaId).maybeSingle()
  const cfg = await carregarConfigEmpresa(svc, ctx.empresaId)
  const entrada: EntradaCentral = {
    ligados: ligadosDaEmpresa(cfg),
    plano: empresa?.plano ?? undefined,
    forcados: cfg.forcados,
    ativos: new Set(cfg.modulos.filter((r) => r.ativo).map((r) => r.modulo)),
  }
  const estado = estadoDoModulo(modulo, entrada)

  if (estado.tipo === 'preparacao') return NextResponse.json({ error: `${modulo.nome} ainda está em preparação.` }, { status: 409 })
  if (estado.tipo === 'pago') return NextResponse.json({ error: `${modulo.nome} é ${estado.onde}: peça pela Central.` }, { status: 402 })
  if (!instalar && estado.tipo === 'instalado' && !estado.podeDesinstalar) {
    if (estado.usadoPor?.length) {
      const quem = estado.usadoPor.join(', ')
      return NextResponse.json({ error: `${modulo.nome} é usado por ${quem}: desinstale ${quem} antes.`, usadoPor: estado.usadoPor }, { status: 409 })
    }
    return NextResponse.json({ error: `${modulo.nome} é contratado à parte: fale com o suporte para tirar.` }, { status: 409 })
  }
  if (instalar && estado.tipo === 'disponivel' && estado.bloqueio) {
    return NextResponse.json({ error: estado.bloqueio }, { status: 409 })
  }

  // Os requisitos antes do módulo: se um falhar no meio, o que ficou ligado é
  // requisito (funciona sozinho), nunca o módulo sem a base.
  const junto = instalar ? requisitosFaltando(modulo, entrada) : []
  const ordem = [...junto, modulo]
  for (const [i, m] of ordem.entries()) {
    const { error } = await gravarModulo(svc, { empresaId: ctx.empresaId, modulo: m, ativo: instalar, userId: ctx.userId, linhas: cfg.modulos, origem: 'plano' })
    if (error) {
      const ja = ordem.slice(0, i).map((x) => x.nome)
      return NextResponse.json({ error: `Não foi possível gravar ${m.nome}. Tente de novo.${ja.length ? ` (já ligado: ${ja.join(', ')})` : ''}` }, { status: 500 })
    }
  }

  // Prepara o que cada módulo ligado precisa (o token de portal do Imóveis —
  // lib/modulos-instalacao.ts).
  let aviso: string | undefined
  if (instalar) {
    for (const m of ordem) {
      const preparo = await aoInstalarModulo(svc, ctx.empresaId, m.chave)
      if (preparo.error) aviso = `${m.nome} foi instalado, mas não terminou de preparar. Tente instalar de novo.`
    }
  }

  const res = NextResponse.json({ ok: true, instalado: instalar, junto: junto.map((m) => m.nome), ...(aviso ? { aviso } : {}) })
  // A trava do proxy guarda os módulos por um minuto; com a versão nova no cookie,
  // quem mudou vê a rota certa já no próximo clique.
  res.cookies.set(COOKIE_VERSAO_MODULOS, String(Date.now()), { path: '/', sameSite: 'lax', httpOnly: true, secure: true, maxAge: 120 })
  return res
}
