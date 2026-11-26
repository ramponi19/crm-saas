import { NextRequest, NextResponse } from 'next/server'
import { createClient, getEmpresaId } from '@/lib/supabase/server'
import { CHAVE_HORARIO, horarioDaLoja, horarioValido, temHorarioProprio, type Horario } from '@/lib/horario'
import { envelopesDaConfig } from '@/lib/config'
import type { Json } from '@/types/database'

/**
 * HORÁRIO DE FUNCIONAMENTO POR DIA E POR LOJA (24/11/2026; migração 20261124001200). Universal.
 *
 * GET  → o horário da empresa (o que vale hoje: core.horario → padrão) e o de cada loja
 *        (próprio ou "usa o da empresa").
 * PUT  { filialId: null, horario }        → grava o da empresa;
 *      { filialId: n, horario }           → grava o próprio da loja;
 *      { filialId: n, horario: null }     → a loja volta a usar o da empresa.
 * A gravação é pela config_salvar (só dono ou administrador, sessão que pode escrever). Desde a 1.1h parte 2
 * (26/11/2026) o formato antigo (`horario_comercial` e `horario`) não é mais lido nem gravado.
 */
export async function GET() {
  const supabase = await createClient()
  const empresaId = await getEmpresaId()
  if (!empresaId) return NextResponse.json({ error: 'Sem empresa' }, { status: 400 })
  const [envs, { data: lojas }] = await Promise.all([
    envelopesDaConfig(supabase, empresaId, { chaves: [CHAVE_HORARIO] }),
    supabase.from('filiais').select('id, nome').eq('empresa_id', empresaId).eq('ativo', true).order('matriz', { ascending: false }).order('nome'),
  ])
  const novo = envs[CHAVE_HORARIO] ?? null
  return NextResponse.json({
    empresa: horarioDaLoja(novo, null, null),
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

  return NextResponse.json({ ok: true })
}
