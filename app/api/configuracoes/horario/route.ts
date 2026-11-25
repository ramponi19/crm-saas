import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import {
  CHAVE_HORARIO, CHAVE_HORARIO_ANTIGA, horarioDaLoja, horarioValido, paraFormatoAntigo, temHorarioProprio, type Horario,
} from '@/lib/horario'
import { nadaGravado } from '@/lib/linhas-afetadas'
import { envelopesDaConfig } from '@/lib/config'
import type { Json } from '@/types/database'

/**
 * HORÁRIO DE FUNCIONAMENTO POR DIA E POR LOJA (24/11/2026; migração 20261124001200). Universal.
 *
 * GET  → o horário da empresa (o que vale hoje: core.horario → horario_comercial → padrão) e o de cada loja
 *        (próprio ou "usa o da empresa").
 * PUT  { filialId: null, horario }        → grava o da empresa;
 *      { filialId: n, horario }           → grava o próprio da loja;
 *      { filialId: n, horario: null }     → a loja volta a usar o da empresa.
 * A gravação é pela config_salvar (só dono ou administrador, sessão que pode escrever). Fase 1 da compatibilidade:
 * gravar o da empresa também regrava o formato antigo (`horario_comercial` e `horario`, da devolução à esteira),
 * derivado do novo, para os leitores que ainda não migraram.
 */
export async function GET() {
  const supabase = await createClient()
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })
  const [envs, { data: cfgAntiga }, { data: lojas }] = await Promise.all([
    envelopesDaConfig(supabase, empresaId, { chaves: [CHAVE_HORARIO] }),
    supabase.from('configuracoes_sistema').select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_HORARIO_ANTIGA).maybeSingle(),
    supabase.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('matriz', { ascending: false }).order('nome'),
  ])
  const novo = envs[CHAVE_HORARIO] ?? null
  const antigo = cfgAntiga?.valor ?? null
  return NextResponse.json({
    empresa: horarioDaLoja(novo, antigo, null),
    lojas: ((lojas ?? []) as { id: number; nome: string }[]).map((l) => ({
      id: l.id, nome: l.nome, proprio: temHorarioProprio(novo, l.id) ? horarioDaLoja(novo, null, l.id) : null,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const corpo = await req.json().catch(() => null) as { filialId?: number | null; horario?: unknown } | null
  if (!corpo || !('horario' in corpo)) return NextResponse.json({ error: 'Informe o horário' }, { status: 400 })
  const filialId = typeof corpo.filialId === 'number' ? corpo.filialId : null
  let horario: Horario | null = null
  if (corpo.horario !== null) {
    horario = horarioValido(corpo.horario)
    if (!horario) {
      return NextResponse.json({ error: 'Horário inválido: confira os dias abertos, o formato HH:MM, o fechamento depois da abertura e intervalos sem sobreposição.' }, { status: 400 })
    }
  } else if (filialId == null) {
    return NextResponse.json({ error: 'A empresa precisa de um horário' }, { status: 400 })
  }

  const supabase = await createClient()
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })

  const { error } = await supabase.rpc('config_salvar', {
    p_modulo: 'core', p_chave: 'horario', p_valor: horario as unknown as Json, p_filial: filialId ?? undefined,
  } as never)
  if (error) {
    const semPermissao = /SEM_PERMISSAO|SOMENTE_LEITURA/.test(error.message)
    return NextResponse.json({ error: semPermissao ? 'Só o dono ou um administrador altera o horário.' : error.message }, { status: semPermissao ? 403 : 400 })
  }

  // Fase 1: o formato antigo acompanha o da empresa (os leitores ainda não migrados seguem coerentes).
  if (filialId == null && horario) {
    const antigo = paraFormatoAntigo(horario)
    const { inicio, fim, dias } = antigo
    const { data: gravadas, error: e2 } = await supabase.from('configuracoes_sistema').upsert([
      { empresa_id: empresaId, chave: CHAVE_HORARIO_ANTIGA, valor: antigo as unknown as Json },
      { empresa_id: empresaId, chave: 'horario', valor: { inicio, fim, dias } as unknown as Json },
    ], { onConflict: 'empresa_id,chave' }).select('id')
    if (e2) return NextResponse.json({ error: `Horário salvo, mas o formato antigo não: ${e2.message}` }, { status: 500 })
    if (nadaGravado(gravadas)) return NextResponse.json({ error: 'Horário salvo, mas o formato antigo não foi gravado (sem permissão).' }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
