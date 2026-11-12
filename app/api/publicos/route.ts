import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { exigirModuloLigado } from '@/lib/modulo-ligado'
import { filtroImpossivel, normalizarFiltro } from '@/lib/transmissao/filtro'
import { recalcularPublico, rodadaDoPublico } from '@/lib/publicos/rodada'

/**
 * MÓDULO PÚBLICOS (12/11/2026): listas salvas por regra, de uma loja, que se atualizam sozinhas.
 *
 * GET           → os públicos (pela RLS: o vendedor vê os da loja dele) com a última conta e de
 *                 quando ela é, quantas automações "entrou no público" ligadas e transmissões
 *                 agendadas cada um tem; para dono/admin, o que o formulário precisa.
 * POST {op}     → só dono/admin (a RLS barra o resto e a rota confere as linhas gravadas):
 *   'previa'    loja + filtro → quantos casam e 5 nomes, sem gravar;
 *   'criar'     nome + loja + filtro → grava e conta NA HORA, sem disparar nada (ponto de partida);
 *   'editar'    nome e/ou filtro → filtro novo reconta na hora, de novo sem disparar: quem passou a
 *               valer pela regra nova não "entrou";
 *   'atualizar' reconta agora COM disparo: quem entrou desde a última conta ganha as automações
 *               (o mesmo que a rodada de hora em hora faria);
 *   'apagar'    leva junto as automações "entrou no público" dele (como a etiqueta); recusado se
 *               uma transmissão agendada depende dele.
 */

type Sb = Awaited<ReturnType<typeof createClient>>

async function contexto() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) } as const
  const trava = await exigirModuloLigado(empresaId, 'publicos')
  if (trava) return { erro: trava } as const
  const [{ data: v }, { data: u }] = await Promise.all([
    supabase.from('empresa_usuarios').select('role').eq('empresa_id', empresaId).eq('usuario_id', user.id).eq('ativo', true).maybeSingle(),
    supabase.from('usuarios').select('is_super_admin').eq('id', user.id).maybeSingle(),
  ])
  const role = (v as { role?: string } | null)?.role ?? ''
  const admin = !!(u as { is_super_admin?: boolean } | null)?.is_super_admin || role === 'owner' || role === 'admin'
  return { supabase, empresaId, user, admin } as const
}

const recusa = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function GET() {
  const c = await contexto()
  if ('erro' in c) return c.erro
  const { supabase, empresaId, admin } = c

  const { data: lista, error } = await supabase.from('publicos')
    .select('id, nome, filial_id, filtro, total, calculado_em, created_at')
    .eq('empresa_id', empresaId).order('nome')
  if (error) return recusa(error.message, 500)
  const ids = (lista ?? []).map((p) => p.id as number)
  const [{ data: autos }, { data: agendadas }, { data: lojas }, { data: funis }, { data: etapas }] = await Promise.all([
    ids.length ? supabase.from('automacoes').select('publico_id, ativo').eq('empresa_id', empresaId).eq('gatilho', 'entrou_no_publico').in('publico_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('transmissoes').select('publico_id').eq('empresa_id', empresaId).eq('status', 'agendada').in('publico_id', ids) : Promise.resolve({ data: [] }),
    supabase.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('funis').select('id, nome').eq('empresa_id', empresaId).eq('interno', false).order('id'),
    supabase.from('funil_etapas').select('id, funil_id, label, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
  ])
  const conta = (l: { publico_id: number | null }[] | null) => {
    const m = new Map<number, number>()
    for (const x of l ?? []) if (x.publico_id != null) m.set(Number(x.publico_id), (m.get(Number(x.publico_id)) ?? 0) + 1)
    return m
  }
  const nGatilhos = conta(((autos ?? []) as { publico_id: number | null; ativo: boolean }[]).filter((a) => a.ativo))
  const nAutos = conta((autos ?? []) as { publico_id: number | null }[])
  const nAgendadas = conta((agendadas ?? []) as { publico_id: number | null }[])

  let form = null
  if (admin) {
    const [{ data: origens }, { data: vis }] = await Promise.all([supabase.rpc('transmissao_origens'), supabase.rpc('filiais_visiveis')])
    const visiveis = new Set(((vis ?? []) as number[]).map(Number))
    form = { lojas: (lojas ?? []).filter((l) => visiveis.has(Number(l.id))), origens: (origens ?? []) as string[] }
  }
  return NextResponse.json({
    admin,
    publicos: (lista ?? []).map((p) => ({
      ...p,
      gatilhos: nGatilhos.get(p.id as number) ?? 0,
      automacoes: nAutos.get(p.id as number) ?? 0,
      agendadas: nAgendadas.get(p.id as number) ?? 0,
    })),
    lojas: lojas ?? [],
    funis: funis ?? [],
    etapas: etapas ?? [],
    form,
  })
}

/** A loja do público: obrigatória em empresa de várias lojas, da empresa e visível para quem pede. */
async function lojaValida(supabase: Sb, empresaId: number, bruto: unknown): Promise<{ filial: number | null } | { erro: string }> {
  const filial = Number(bruto) || null
  const { data: lojas } = await supabase.from('filiais').select('id').eq('empresa_id', empresaId).eq('ativo', true)
  const todas = ((lojas ?? []) as { id: number }[]).map((l) => Number(l.id))
  if (!filial) return todas.length < 2 ? { filial: null } : { erro: 'Escolha a loja do público.' }
  const { data: vis } = await supabase.rpc('filiais_visiveis')
  if (!todas.includes(filial) || !((vis ?? []) as number[]).map(Number).includes(filial)) return { erro: 'Loja inválida.' }
  return { filial }
}

function nomeValido(bruto: unknown): string | null {
  const nome = String(bruto ?? '').trim()
  return nome && nome.length <= 80 ? nome : null
}

const NOME_REPETIDO = 'Já existe um público com este nome nesta loja.'

export async function POST(req: Request) {
  const c = await contexto()
  if ('erro' in c) return c.erro
  const { supabase, empresaId, user, admin } = c
  if (!admin) return recusa('Só o dono ou um admin cria e muda públicos.', 403)
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = Number(b.id) || 0
  const svc = createServiceClient()

  switch (b.op) {
    case 'previa': {
      const loja = await lojaValida(supabase, empresaId, b.filial_id)
      if ('erro' in loja) return recusa(loja.erro)
      const filtro = normalizarFiltro(b.filtro)
      const impossivel = filtroImpossivel(filtro)
      if (impossivel) return recusa(impossivel)
      const { data, error } = await supabase.rpc('publicos_previa', {
        p_filial: loja.filial as number, p_filtro: filtro as unknown as Record<string, never>,
      })
      if (error) return recusa(error.message, error.code === '42501' ? 403 : 400)
      return NextResponse.json({ previa: data, filtro })
    }

    case 'criar': {
      const nome = nomeValido(b.nome)
      if (!nome) return recusa('Dê um nome ao público (até 80 letras).')
      const loja = await lojaValida(supabase, empresaId, b.filial_id)
      if ('erro' in loja) return recusa(loja.erro)
      const filtro = normalizarFiltro(b.filtro)
      const impossivel = filtroImpossivel(filtro)
      if (impossivel) return recusa(impossivel)
      const { data, error } = await supabase.from('publicos').insert({
        empresa_id: empresaId, filial_id: loja.filial, nome, filtro, criado_por: user.id,
      } as never).select('id').single()
      if (error) return recusa(error.code === '23505' ? NOME_REPETIDO : error.message, error.code === '42501' ? 403 : 400)
      // Ponto de partida: conta agora, sem disparar.
      await recalcularPublico(svc, data.id as number, false)
      const { data: p } = await svc.from('publicos').select('total, calculado_em').eq('id', data.id).maybeSingle()
      return NextResponse.json({ id: data.id, total: p?.total ?? 0, calculado_em: p?.calculado_em ?? null })
    }

    case 'editar': {
      const { data: atual } = await supabase.from('publicos').select('id, filtro').eq('empresa_id', empresaId).eq('id', id).maybeSingle()
      if (!atual) return recusa('Público não encontrado.', 404)
      const mudar: Record<string, unknown> = {}
      if (b.nome !== undefined) {
        const nome = nomeValido(b.nome)
        if (!nome) return recusa('Dê um nome ao público (até 80 letras).')
        mudar.nome = nome
      }
      let filtroMudou = false
      if (b.filtro !== undefined) {
        const filtro = normalizarFiltro(b.filtro)
        const impossivel = filtroImpossivel(filtro)
        if (impossivel) return recusa(impossivel)
        filtroMudou = JSON.stringify(normalizarFiltro(atual.filtro)) !== JSON.stringify(filtro)
        if (filtroMudou) mudar.filtro = filtro
      }
      if (!Object.keys(mudar).length) return NextResponse.json({ ok: true, recontou: false })
      const { data, error } = await supabase.from('publicos').update(mudar as never).eq('id', id).eq('empresa_id', empresaId).select('id')
      if (error) return recusa(error.code === '23505' ? NOME_REPETIDO : error.message, 400)
      if (!data?.length) return recusa('Nada foi gravado.', 403)
      // Regra nova: reconta já, sem disparar — quem passou a valer por ela não "entrou".
      if (filtroMudou) await recalcularPublico(svc, id, false)
      return NextResponse.json({ ok: true, recontou: filtroMudou })
    }

    case 'atualizar': {
      // A RLS diz se quem pede alcança o público (loja visível).
      const { data: p } = await supabase.from('publicos').select('id').eq('empresa_id', empresaId).eq('id', id).maybeSingle()
      if (!p) return recusa('Público não encontrado.', 404)
      const r = await rodadaDoPublico(svc, empresaId, id)
      return NextResponse.json({ ok: true, ...r })
    }

    case 'apagar': {
      // As automações "entrou no público" vão junto (a tela diz quantas na confirmação).
      const { count: agend } = await supabase.from('transmissoes').select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresaId).eq('publico_id', id).eq('status', 'agendada')
      if (agend) return recusa('Uma transmissão agendada usa este público. Encerre a transmissão antes de apagar o público.', 409)
      const { data, error } = await supabase.from('publicos').delete().eq('id', id).eq('empresa_id', empresaId).select('id')
      if (error) return recusa(error.message, 400)
      if (!data?.length) return recusa('Nada foi apagado.', 403)
      return NextResponse.json({ ok: true })
    }

    default:
      return recusa('Operação desconhecida.')
  }
}
