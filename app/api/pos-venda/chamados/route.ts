import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'

/**
 * CHAMADOS DO PÓS-VENDA (C7 bloco 4, 24/11/2026). Quem decide é o banco (RPCs da 1700/1800): responsável ou dono/admin
 * mexe; só dono/admin repassa; o prazo sai da prioridade e do horário da loja.
 *
 * GET  ?id=<chamado>                 os eventos do chamado (status, notas, repasses), do mais antigo ao mais novo
 * POST { acao: 'abrir', contato_id, negocio_id?, titulo, descricao?, categoria_id?, prioridade? }
 *      { acao: 'mover', chamado_id, status_id?, texto?, responsavel? }
 */
const ERROS: Record<string, [number, string]> = {
  NAO_ENCONTRADO: [404, 'Chamado não encontrado.'],
  CONTATO_NAO_ENCONTRADO: [404, 'Cliente não encontrado.'],
  NEGOCIO_NAO_ENCONTRADO: [404, 'Venda não encontrada.'],
  CATEGORIA_NAO_ENCONTRADA: [404, 'Categoria não encontrada.'],
  STATUS_NAO_ENCONTRADO: [404, 'Status não encontrado.'],
  RESPONSAVEL_INVALIDO: [422, 'Escolha uma pessoa ativa da equipe.'],
  TITULO_OBRIGATORIO: [422, 'Dê um título ao chamado.'],
  PRIORIDADE_INVALIDA: [422, 'Prioridade inválida.'],
  SEM_PERMISSAO: [403, 'Só o responsável, o dono ou um administrador mexe neste chamado.'],
  SEM_RESPONSAVEL: [409, 'A empresa não tem administrador ou dono ativo para receber o chamado.'],
  MODULO_DESLIGADO: [403, 'O Pós-venda não está ligado nesta empresa.'],
  SOMENTE_LEITURA: [403, 'A empresa está em modo somente leitura.'],
}
const traduzir = (m: string) => {
  const k = Object.keys(ERROS).find((c) => m.startsWith(c))
  const [status, error] = k ? ERROS[k] : [500, 'Não foi possível concluir.']
  return NextResponse.json({ error, code: k ?? null }, { status })
}

type Contexto = { erro: NextResponse } | { erro?: undefined; supabase: Awaited<ReturnType<typeof createClient>>; empresaId: number }

async function contexto(): Promise<Contexto> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const empresaId = await getEmpresaId()
  if (!empresaId) return { erro: NextResponse.json({ error: 'Sem empresa' }, { status: 400 }) }
  if (!(await posvendaLigado(createServiceClient(), empresaId))) {
    return { erro: NextResponse.json({ error: ERROS.MODULO_DESLIGADO[1], code: 'modulo_desligado', modulo: 'posvenda' }, { status: 403 }) }
  }
  return { supabase, empresaId }
}

export async function GET(req: Request) {
  const c = await contexto()
  if (c.erro) return c.erro
  const id = Number(new URL(req.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Chamado inválido' }, { status: 400 })
  // A RLS do chamado decide se a sessão o vê (responsável ou dono/admin); os eventos seguem o chamado.
  const s = semTipo(c.supabase)
  const { data: ch } = await s.from('posvenda_chamados').select('id').eq('id', id).eq('empresa_id', c.empresaId).maybeSingle()
  if (!ch) return NextResponse.json({ error: ERROS.NAO_ENCONTRADO[1] }, { status: 404 })
  const { data: ev } = await s.from('posvenda_chamado_eventos').select('id, tipo, de, para, texto, por, em').eq('chamado_id', id).order('em').limit(200)
  const eventos = (ev ?? []) as { id: number; tipo: string; de: string | null; para: string | null; texto: string | null; por: string | null; em: string }[]
  const pessoas = [...new Set(eventos.flatMap((e) => [e.por, e.tipo === 'atribuicao' ? e.de : null, e.tipo === 'atribuicao' ? e.para : null]).filter((x): x is string => !!x))]
  const { data: us } = pessoas.length ? await createServiceClient().from('usuarios').select('id, nome').in('id', pessoas) : { data: [] }
  const nome = new Map((us ?? []).map((u) => [u.id, u.nome]))
  return NextResponse.json({
    eventos: eventos.map((e) => ({
      ...e,
      por: e.por ? nome.get(e.por) ?? 'Alguém da equipe' : null,
      de: e.tipo === 'atribuicao' && e.de ? nome.get(e.de) ?? e.de : e.de,
      para: e.tipo === 'atribuicao' && e.para ? nome.get(e.para) ?? e.para : e.para,
    })),
  })
}

export async function POST(req: Request) {
  const c = await contexto()
  if (c.erro) return c.erro
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v))
  const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

  if (b.acao === 'abrir') {
    const { data, error } = await c.supabase.rpc('posvenda_chamado_abrir' as never, {
      p_contato: num(b.contato_id), p_titulo: txt(b.titulo, 120) ?? '', p_descricao: txt(b.descricao, 2000),
      p_categoria: num(b.categoria_id), p_prioridade: txt(b.prioridade, 20) ?? 'normal', p_negocio: num(b.negocio_id),
    } as never)
    if (error) return traduzir(error.message)
    return NextResponse.json({ ok: true, chamado: data })
  }
  if (b.acao === 'mover') {
    const { data, error } = await c.supabase.rpc('posvenda_chamado_mover' as never, {
      p_chamado: num(b.chamado_id), p_status: num(b.status_id), p_texto: txt(b.texto, 2000),
      p_responsavel: typeof b.responsavel === 'string' && b.responsavel ? b.responsavel : null,
    } as never)
    if (error) return traduzir(error.message)
    return NextResponse.json({ ok: true, chamado: data })
  }
  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
