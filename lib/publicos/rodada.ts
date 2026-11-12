import type { SupabaseClient } from '@supabase/supabase-js'
import { agendarEntrouNoPublico } from '@/lib/automacoes'
import { moduloEstaLigado } from '@/lib/modulo-ligado'

/**
 * MÓDULO PÚBLICOS (12/11/2026): a conta de um público e a rodada de hora em hora.
 *
 * A conta é do banco (publicos_recalcular, migração 20261111000600): refaz os membros e o total.
 * Com `disparar`, devolve quem ENTROU desde a última conta — e esses ganham as automações
 * "entrou no público" (agendadas na fila de sempre). Sem `disparar` (criar, editar o filtro, ligar
 * o primeiro gatilho), a conta só fotografa: quem está ali naquele momento não dispara nada.
 *
 * Tudo com a chave de SERVIÇO: quem chama já conferiu o usuário (a API) ou é o cron.
 */

type Db = SupabaseClient
export interface Entrada { contato_id: number; negocio_id: number | null }

export async function recalcularPublico(svc: Db, publicoId: number, disparar: boolean): Promise<Entrada[]> {
  const { data, error } = await svc.rpc('publicos_recalcular', { p_publico: publicoId, p_disparar: disparar })
  if (error) throw new Error(`publicos_recalcular: ${error.message}`)
  return ((data ?? []) as Entrada[]).map((x) => ({ contato_id: Number(x.contato_id), negocio_id: x.negocio_id == null ? null : Number(x.negocio_id) }))
}

/**
 * Conta com disparo: quem entrou ganha as automações do público. `rodarJa` (o "Atualizar" da tela):
 * as de espera 0 executam na hora, pelo caminho da etiqueta; na rodada de hora em hora a fila roda logo
 * depois desta conta.
 */
export async function rodadaDoPublico(svc: Db, empresaId: number, publicoId: number, { rodarJa = false } = {}): Promise<{ entraram: number; agendadas: number }> {
  const entraram = await recalcularPublico(svc, publicoId, true)
  const agendadas = entraram.length ? await agendarEntrouNoPublico(svc, empresaId, publicoId, entraram, { rodarJa }) : 0
  return { entraram: entraram.length, agendadas }
}

/**
 * A rodada de hora em hora (job `automacoes-hora`, antes da fila do Automatize, para que quem
 * entrou já rode nela): só os públicos com gatilho ligado ou transmissão agendada (publicos_rodada),
 * só de empresa com o módulo ligado. Um que falha não impede os outros.
 */
export async function processarPublicos(svc: Db, { limiteMs = 15_000 } = {}) {
  const t0 = Date.now()
  const { data, error } = await svc.rpc('publicos_rodada')
  if (error) throw new Error(`publicos_rodada: ${error.message}`)
  const lista = ((data ?? []) as { publico_id: number; empresa_id: number }[])
  const ligado = new Map<number, boolean>()
  const feitos: { publico: number; entraram: number; agendadas: number }[] = []
  const falhas: { publico: number; erro: string }[] = []
  let pulados = 0
  for (const p of lista) {
    if (Date.now() - t0 >= limiteMs) { pulados++; continue }
    const emp = Number(p.empresa_id)
    if (!ligado.has(emp)) ligado.set(emp, await moduloEstaLigado(emp, 'publicos'))
    if (!ligado.get(emp)) { pulados++; continue }
    try { feitos.push({ publico: Number(p.publico_id), ...(await rodadaDoPublico(svc, emp, Number(p.publico_id))) }) }
    catch (err) { falhas.push({ publico: Number(p.publico_id), erro: err instanceof Error ? err.message : String(err) }) }
  }
  const porEmpresa = new Map<number, { publicos: number; entraram: number; agendadas: number }>()
  for (const f of feitos) {
    const emp = Number(lista.find((x) => Number(x.publico_id) === f.publico)?.empresa_id)
    const acc = porEmpresa.get(emp) ?? { publicos: 0, entraram: 0, agendadas: 0 }
    acc.publicos++; acc.entraram += f.entraram; acc.agendadas += f.agendadas
    porEmpresa.set(emp, acc)
  }
  for (const [empresaId, v] of porEmpresa) {
    if (!v.entraram) continue
    await svc.from('eventos').insert({
      empresa_id: empresaId, tipo: 'publicos.rodada', entidade: 'empresa', entidade_id: empresaId,
      dados: { ...v, ms: Date.now() - t0 },
    } as never)
  }
  return { publicos: feitos.length, pulados, entraram: feitos.reduce((s, f) => s + f.entraram, 0), agendadas: feitos.reduce((s, f) => s + f.agendadas, 0), falhas, ms: Date.now() - t0 }
}
