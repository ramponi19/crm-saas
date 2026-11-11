import { NextResponse, after } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { aprovadoNaLoja, aprovadosPorLoja } from '@/lib/canais/modelos-waba'
import { avisosDePagamento } from '@/lib/canais/saude-whatsapp'
import { exigirModuloLigado } from '@/lib/modulo-ligado'
import { CHAVE_CONFIG, TETO_MAX, filtroImpossivel, normalizarFiltro, tetoValido, variaveisDoModelo } from '@/lib/transmissao/filtro'
import { enviadasNaHora, processarTransmissao, proximaJanela } from '@/lib/transmissao/motor'
import { agora as agoraDe } from '@/lib/datas'

/**
 * MÓDULO TRANSMISSÃO (10/11/2026): um modelo aprovado da Meta para a lista de uma loja.
 *
 * GET           → as transmissões (pela RLS: o vendedor vê as da loja dele), com os números de
 *                 cada uma; para dono/admin, o que o formulário precisa (lojas, modelos
 *                 aprovados, funis, etapas, origens), o teto por hora e a janela de horário.
 * POST {op}     → só dono/admin (a RLS barra o resto e a rota confere as linhas gravadas):
 *   'previa'    filtro → contagem (aptos e quem fica fora, por motivo), sem gravar nada;
 *   'criar'     rascunho com loja, modelo, variáveis e filtro;
 *   'disparar'  congela a lista (transmissao_montar) e começa já, ou agenda (`agendar_para`);
 *   'pausar' | 'retomar' | 'encerrar' | 'apagar' (só rascunho) | 'teto' (teto por hora da empresa).
 *
 * O envio em si é do motor (lib/transmissao/motor.ts): o primeiro lote sai logo depois da
 * resposta (after), o resto no cron de hora em hora.
 */

export const maxDuration = 300

type Sb = Awaited<ReturnType<typeof createClient>>

async function contexto() {
  const [supabase, empresaId] = await Promise.all([createClient(), getEmpresaId()])
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !empresaId) return { erro: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) } as const
  const trava = await exigirModuloLigado(empresaId, 'transmissao')
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

  const { data: lista, error } = await supabase.from('transmissoes')
    .select('id, nome, filial_id, modelo_id, status, filtro, parametros, agendada_para, iniciada_em, pausada_em, concluida_em, total, created_at')
    .eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(100)
  if (error) return recusa(error.message, 500)
  const ids = (lista ?? []).map((t) => t.id as number)
  const [{ data: numeros }, { data: lojas }, { data: modelos }, { data: funis }, { data: etapas }] = await Promise.all([
    ids.length ? supabase.rpc('transmissao_numeros', { p_ids: ids }) : Promise.resolve({ data: [] }),
    supabase.from('filiais').select('id, nome, matriz').eq('empresa_id', empresaId).eq('ativo', true).order('nome'),
    supabase.from('modelos_mensagem').select('id, nome, idioma, categoria, corpo, status').eq('empresa_id', empresaId).order('nome'),
    supabase.from('funis').select('id, nome, padrao').eq('empresa_id', empresaId).eq('interno', false).order('id'),
    supabase.from('funil_etapas').select('id, funil_id, label, ordem').eq('empresa_id', empresaId).eq('ativo', true).order('ordem'),
  ])

  // MODELO POR NÚMERO (11/11/2026): cada modelo diz em que loja está aprovado NO NÚMERO dela
  // (chave = id da loja, ou 'null' para a empresa sem loja). A tela só oferece o da loja escolhida.
  const svc = createServiceClient()
  // Conta da Meta sem forma de pagamento, por loja (11/11/2026): modelo sai "aceito" e volta falhou.
  const [porLoja, avisosPagamento] = await Promise.all([
    aprovadosPorLoja(svc, empresaId),
    avisosDePagamento(svc, empresaId).catch((e) => { console.error('avisosDePagamento:', e); return [] }),
  ])
  const aprovadoEm = (id: number) => [...porLoja].filter(([, ids]) => ids.has(id)).map(([k]) => k)

  let form = null
  if (admin) {
    const [{ data: origens }, { data: cfg }, janela, naHora] = await Promise.all([
      supabase.rpc('transmissao_origens'),
      supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_CONFIG).maybeSingle(),
      proximaJanela(svc, empresaId),
      enviadasNaHora(svc, empresaId),
    ])
    const { data: vis } = await supabase.rpc('filiais_visiveis')
    const visiveis = new Set(((vis ?? []) as number[]).map(Number))
    form = {
      lojas: (lojas ?? []).filter((l) => visiveis.has(Number(l.id))),
      origens: (origens ?? []) as string[],
      teto: tetoValido(cfg?.valor),
      tetoMax: TETO_MAX,
      enviadasNaHora: naHora,
      abreEm: janela.getTime() > agoraDe().getTime() ? janela.toISOString() : null,
    }
  }
  return NextResponse.json({
    admin,
    transmissoes: lista ?? [],
    numeros: numeros ?? [],
    lojas: lojas ?? [],
    modelos: (modelos ?? []).filter((m) => admin || ids.length === 0 || (lista ?? []).some((t) => t.modelo_id === m.id))
      .map((m) => ({ ...m, aprovado_em: aprovadoEm(m.id as number) })),
    funis: funis ?? [],
    etapas: etapas ?? [],
    form,
    avisosPagamento,
  })
}

async function lojaUnica(supabase: Sb, empresaId: number): Promise<boolean> {
  const { count } = await supabase.from('filiais').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true)
  return (count ?? 0) < 2
}

/** A loja da transmissão: obrigatória em empresa de várias lojas. */
async function lojaDoPedido(supabase: Sb, empresaId: number, bruto: unknown): Promise<{ filial: number | null } | { erro: string }> {
  const filial = Number(bruto) || null
  if (!filial && !(await lojaUnica(supabase, empresaId))) return { erro: 'Escolha a loja da transmissão.' }
  return { filial }
}

export async function POST(req: Request) {
  const c = await contexto()
  if ('erro' in c) return c.erro
  const { supabase, empresaId, user, admin } = c
  if (!admin) return recusa('Só o dono ou um admin cria e dispara transmissões.', 403)
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = Number(b.id) || 0

  switch (b.op) {
    case 'previa': {
      const loja = await lojaDoPedido(supabase, empresaId, b.filial_id)
      if ('erro' in loja) return recusa(loja.erro)
      const filtro = normalizarFiltro(b.filtro)
      const impossivel = filtroImpossivel(filtro)
      if (impossivel) return recusa(impossivel)
      // Loja nula (empresa de uma loja só) vai como null de verdade: o gerador de tipos não sabe disso.
      const { data, error } = await supabase.rpc('transmissao_previa', {
        p_filial: loja.filial as number, p_filtro: filtro as unknown as Record<string, never>, p_modelo: Number(b.modelo_id) || undefined,
      })
      if (error) return recusa(error.message, error.code === '42501' ? 403 : 400)
      return NextResponse.json({ previa: data, filtro })
    }

    case 'criar': {
      const nome = String(b.nome ?? '').trim()
      if (!nome || nome.length > 120) return recusa('Dê um nome à transmissão (até 120 letras).')
      const loja = await lojaDoPedido(supabase, empresaId, b.filial_id)
      if ('erro' in loja) return recusa(loja.erro)
      const { data: m } = await supabase.from('modelos_mensagem').select('id, corpo, status')
        .eq('empresa_id', empresaId).eq('id', Number(b.modelo_id) || 0).maybeSingle()
      if (!m) return recusa('Escolha um modelo.')
      // Aprovado NO NÚMERO da loja que envia (o status da empresa é só um resumo).
      if (!(await aprovadoNaLoja(createServiceClient(), empresaId, m.id as number, loja.filial ?? null))) {
        return recusa('Este modelo não está aprovado pela Meta no WhatsApp desta loja.')
      }
      const parametros = (Array.isArray(b.parametros) ? b.parametros : []).map((p) => String(p ?? '').trim().slice(0, 200))
      const pede = variaveisDoModelo(m.corpo as string)
      if (parametros.length !== pede || parametros.some((p) => !p)) return recusa(`O modelo tem ${pede} variável(is): preencha todas.`)
      const filtro = normalizarFiltro(b.filtro)
      const impossivel = filtroImpossivel(filtro)
      if (impossivel) return recusa(impossivel)
      const { data, error } = await supabase.from('transmissoes').insert({
        empresa_id: empresaId, filial_id: loja.filial, nome, modelo_id: m.id, parametros, filtro, criado_por: user.id,
      } as never).select('id').single()
      if (error) return recusa(error.message, error.code === '42501' ? 403 : 400)
      return NextResponse.json({ id: data.id })
    }

    case 'disparar': {
      const quando = b.agendar_para ? new Date(String(b.agendar_para)) : null
      if (quando && (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() - 60_000)) return recusa('A data do agendamento já passou.')
      // A lista é da loja e sai pelo WhatsApp DELA: sem número conectado, nem começa (a Edge
      // recusaria cada envio). Canal sem loja (o da empresa inteira) vale para todas.
      const { data: tx } = await supabase.from('transmissoes').select('filial_id').eq('id', id).eq('empresa_id', empresaId).maybeSingle()
      if (!tx) return recusa('Transmissão não encontrada.', 404)
      let qCanal = createServiceClient().from('canais').select('id').eq('empresa_id', empresaId).eq('tipo', 'whatsapp').eq('status', 'ativo')
      if (tx.filial_id != null) qCanal = qCanal.or(`filial_id.eq.${Number(tx.filial_id)},filial_id.is.null`)
      const { data: canais } = await qCanal.limit(1)
      if (!canais?.length) return recusa('Esta loja não tem WhatsApp conectado. Conecte em Configurações → Canais.', 409)
      const { data: n, error } = await supabase.rpc('transmissao_montar', { p_transmissao: id })
      if (error) return recusa(error.message, error.code === '42501' ? 403 : 400)
      const agora = new Date().toISOString()
      const { data: ok, error: e2 } = await supabase.from('transmissoes')
        .update((quando ? { status: 'agendada', agendada_para: quando.toISOString() } : { status: 'enviando', iniciada_em: agora }) as never)
        .eq('id', id).eq('empresa_id', empresaId).eq('status', 'rascunho').select('id')
      if (e2 || !ok?.length) return recusa(e2?.message ?? 'A transmissão não pôde ser disparada.', 409)
      if (!quando) after(() => processarTransmissao(createServiceClient(), id).then(() => undefined, (err) => console.error('[transmissao] primeiro lote:', err)))
      return NextResponse.json({ ok: true, contatos: n, status: quando ? 'agendada' : 'enviando' })
    }

    case 'pausar': {
      const { data, error } = await supabase.from('transmissoes')
        .update({ status: 'pausada', pausada_em: new Date().toISOString() } as never)
        .eq('id', id).eq('empresa_id', empresaId).in('status', ['enviando', 'agendada']).select('id')
      if (error || !data?.length) return recusa(error?.message ?? 'Só se pausa transmissão enviando ou agendada.', 409)
      return NextResponse.json({ ok: true })
    }

    case 'retomar': {
      const { data, error } = await supabase.from('transmissoes')
        .update({ status: 'enviando', pausada_em: null, iniciada_em: new Date().toISOString() } as never)
        .eq('id', id).eq('empresa_id', empresaId).eq('status', 'pausada').select('id')
      if (error || !data?.length) return recusa(error?.message ?? 'Só se retoma transmissão pausada.', 409)
      after(() => processarTransmissao(createServiceClient(), id).then(() => undefined, (err) => console.error('[transmissao] retomar:', err)))
      return NextResponse.json({ ok: true })
    }

    case 'encerrar': {
      const { data, error } = await supabase.from('transmissoes')
        .update({ status: 'encerrada', concluida_em: new Date().toISOString() } as never)
        .eq('id', id).eq('empresa_id', empresaId).in('status', ['enviando', 'agendada', 'pausada']).select('id')
      if (error || !data?.length) return recusa(error?.message ?? 'Esta transmissão já terminou.', 409)
      // O que não saiu fica registrado como não enviado (não some da conta).
      const svc = createServiceClient()
      await svc.from('transmissao_envios').update({ status: 'pulada', motivo: 'transmissão encerrada antes do envio' } as never)
        .eq('transmissao_id', id).eq('status', 'pendente').select('id')
      return NextResponse.json({ ok: true })
    }

    case 'apagar': {
      const { data, error } = await supabase.from('transmissoes').delete()
        .eq('id', id).eq('empresa_id', empresaId).eq('status', 'rascunho').select('id')
      if (error || !data?.length) return recusa(error?.message ?? 'Só rascunho pode ser apagado; disparada fica no histórico.', 409)
      return NextResponse.json({ ok: true })
    }

    case 'teto': {
      const teto = Number(b.teto_hora)
      if (!Number.isInteger(teto) || teto < 1 || teto > TETO_MAX) return recusa(`O teto vai de 1 a ${TETO_MAX} mensagens por hora.`)
      const { data, error } = await supabase.from('configuracoes_sistema')
        .upsert({ empresa_id: empresaId, chave: CHAVE_CONFIG, valor: { teto_hora: teto } } as never, { onConflict: 'empresa_id,chave' })
        .select('id')
      if (error || !data?.length) return recusa(error?.message ?? 'Não gravou.', 403)
      return NextResponse.json({ ok: true, teto })
    }

    default:
      return recusa('Operação desconhecida.')
  }
}
