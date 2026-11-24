import { NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { posvendaLigado, semTipo } from '@/lib/posvenda/ligado'

/**
 * REGISTRAR O RESULTADO DE UM PASSO DA FILA DO PÓS-VENDA (C7 bloco 2, 24/11/2026).
 *
 * Corpo: { acompanhamento, acao: 'feito' | 'sem_resposta' | 'reagendar' | 'pular' | 'nota', resultado?, observacao?,
 *          data? (reagendar, YYYY-MM-DD), nota? (0–10), comentario? }.
 * Quem decide tudo é o banco (migração 20261124001700): a sessão chama a RPC com o usuário dela, e a RPC confere a
 * empresa, o módulo, o responsável (ou dono/admin), o motivo do pular e a data. A rota só traduz o erro.
 * "nota" é o passo de pesquisa: grava o NPS (e, nota baixa, o chamado) e conclui o passo.
 */
const ERROS: Record<string, [number, string]> = {
  NAO_ENCONTRADO: [404, 'Esse passo não existe mais.'],
  SEM_PERMISSAO: [403, 'Só o responsável, o dono ou um administrador registra este passo.'],
  JA_REGISTRADO: [409, 'Esse passo já foi registrado.'],
  MOTIVO_OBRIGATORIO: [422, 'Diga por que o passo não será feito.'],
  DATA_INVALIDA: [422, 'Escolha uma data de hoje em diante.'],
  NOTA_INVALIDA: [422, 'A nota vai de 0 a 10.'],
  MODULO_DESLIGADO: [403, 'O Pós-venda não está ligado nesta empresa.'],
  SOMENTE_LEITURA: [403, 'A empresa está em modo somente leitura.'],
}

const CANAL_DA_NOTA: Record<string, string> = { 'app da loja': 'app_loja', 'ligação': 'ligacao', Nexus: 'nexus', modelo: 'modelo' }

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })
  if (!(await posvendaLigado(createServiceClient(), empresaId))) {
    return NextResponse.json({ error: ERROS.MODULO_DESLIGADO[1], code: 'modulo_desligado', modulo: 'posvenda' }, { status: 403 })
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acompanhamento = Number(b.acompanhamento)
  const acao = String(b.acao ?? '')
  if (!Number.isInteger(acompanhamento) || acompanhamento <= 0) return NextResponse.json({ error: 'Passo inválido' }, { status: 400 })
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null)

  let r
  if (acao === 'nota') {
    const nota = Number(b.nota)
    if (!Number.isInteger(nota) || nota < 0 || nota > 10) return NextResponse.json({ error: ERROS.NOTA_INVALIDA[1] }, { status: 422 })
    const { data: a } = await semTipo(supabase).from('posvenda_acompanhamentos').select('negocio_id').eq('id', acompanhamento).maybeSingle()
    if (!a?.negocio_id) return NextResponse.json({ error: ERROS.NAO_ENCONTRADO[1] }, { status: 404 })
    r = await supabase.rpc('posvenda_nps_registrar' as never, {
      p_negocio: a.negocio_id, p_nota: nota, p_comentario: texto(b.comentario), p_acompanhamento: acompanhamento,
      // por onde a nota veio (app da loja, ligação, Nexus ou modelo), para o resumo por pessoa
      p_canal: CANAL_DA_NOTA[String(b.canal ?? '')] ?? 'manual',
    } as never)
  } else if (['feito', 'sem_resposta', 'reagendar', 'pular'].includes(acao)) {
    const data = typeof b.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : null
    if (acao === 'reagendar' && !data) return NextResponse.json({ error: ERROS.DATA_INVALIDA[1] }, { status: 422 })
    r = await supabase.rpc('posvenda_registrar' as never, {
      p_acompanhamento: acompanhamento, p_acao: acao, p_resultado: texto(b.resultado), p_observacao: texto(b.observacao), p_nova_data: data,
    } as never)
  } else {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  }

  if (r.error) {
    const codigo = Object.keys(ERROS).find((k) => r.error!.message.startsWith(k))
    const [status, msg] = codigo ? ERROS[codigo] : [500, 'Não foi possível registrar.']
    return NextResponse.json({ error: msg, code: codigo ?? null }, { status })
  }
  return NextResponse.json({ ok: true, resultado: r.data })
}
