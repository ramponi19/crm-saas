/**
 * ROTINAS AGENDADAS: FALHA NÃO PODE SER SILENCIOSA (entrega 1.1r, 25/11/2026; docs/etapa-1.1r-rotinas-plano.md).
 *
 * A rota /api/cron/[job] abre uma execução em `rotinas_execucoes` antes de rodar e a fecha depois, com o
 * status lido da própria resposta. As regras puras ficam aqui (testadas em tests/rotinas.test.ts); o
 * registro NUNCA derruba a rota: qualquer falha dele vira só um aviso no log.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** O caminho do job (/api/cron/<job>) → o nome da rotina no catálogo (`rotinas.nome` = nome do job no pg_cron). */
export const ROTINA_DO_JOB: Record<string, string> = {
  automacoes: 'automacoes-hora',
  'lgpd-limpar': 'lgpd-exportacoes-limpar',
  'entrada-parada': 'entrada-parada',
  'resgatar-midias': 'resgatar-midias',
  'expirar-trials': 'expirar-trials',
  'arquivar-eventos': 'arquivar-eventos',
  'sync-stripe': 'sync-stripe',
  'renovar-tokens': 'renovar-tokens',
  'reter-audio': 'reter-audio',
  'ponte-vendas': 'ponte-vendas',
  'sync-fipe': 'sync-fipe',
}

export type StatusExecucao = 'ok' | 'com_erro' | 'falhou'

export interface EmpresaDaExecucao { empresa: number; status: 'ok' | 'erro'; erro?: string; contagens?: unknown }

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Erros por empresa que a resposta da rota traz (`falhas` e `erros`, com `empresa`/`empresa_id`). */
export function empresasDaResposta(corpo: unknown): EmpresaDaExecucao[] {
  if (!ehObjeto(corpo)) return []
  const out = new Map<number, EmpresaDaExecucao>()
  for (const lista of [corpo.falhas, corpo.erros]) {
    if (!Array.isArray(lista)) continue
    for (const f of lista) {
      if (!ehObjeto(f)) continue
      const emp = Number(f.empresa ?? f.empresa_id)
      if (!Number.isInteger(emp) || emp <= 0) continue
      const erro = typeof f.erro === 'string' ? f.erro : typeof f.error === 'string' ? f.error : JSON.stringify(f)
      out.set(emp, { empresa: emp, status: 'erro', erro: erro.slice(0, 2000) })
    }
  }
  if (Array.isArray(corpo.resultado)) {
    for (const x of corpo.resultado) {
      if (!ehObjeto(x)) continue
      const emp = Number(x.empresa ?? x.empresa_id)
      if (Number.isInteger(emp) && emp > 0 && !out.has(emp)) out.set(emp, { empresa: emp, status: 'ok', contagens: x })
    }
  }
  return [...out.values()].sort((a, b) => a.empresa - b.empresa)
}

/**
 * Status da execução a partir da resposta: 5xx = falhou; `ok: false`, `falhas`/`erros` não vazios ou algum
 * sub-resultado com `erro` (públicos, transmissões) = com_erro; o resto = ok.
 */
export function statusDaResposta(httpStatus: number, corpo: unknown): StatusExecucao {
  if (httpStatus >= 500) return 'falhou'
  if (httpStatus >= 400) return 'falhou'
  if (!ehObjeto(corpo)) return 'ok'
  if (corpo.ok === false) return 'com_erro'
  const temLista = (v: unknown) => Array.isArray(v) && v.length > 0
  if (temLista(corpo.falhas) || temLista(corpo.erros)) return 'com_erro'
  if (Object.values(corpo).some((v) => ehObjeto(v) && typeof v.erro === 'string')) return 'com_erro'
  return 'ok'
}

/** Mensagem curta de erro para a execução (a do 500, ou quantas empresas falharam). */
export function erroDaResposta(httpStatus: number, corpo: unknown, empresas: EmpresaDaExecucao[]): string | null {
  if (ehObjeto(corpo) && typeof corpo.error === 'string' && httpStatus >= 400) return corpo.error.slice(0, 2000)
  const n = empresas.filter((e) => e.status === 'erro').length
  if (n) return `${n} empresa(s) com erro`
  if (ehObjeto(corpo)) {
    const sub = Object.entries(corpo).find(([, v]) => ehObjeto(v) && typeof v.erro === 'string')
    if (sub) return `${sub[0]}: ${String((sub[1] as Record<string, unknown>).erro).slice(0, 500)}`
  }
  return null
}

// As tabelas e funções são novas e ainda não estão em types/database.gerado.ts (gerado da produção).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const semTipo = (db: SupabaseClient<any>) => db as unknown as SupabaseClient

/** Abre a execução. Devolve o id, ou null se o registro falhar (a rotina roda do mesmo jeito). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function abrirExecucao(db: SupabaseClient<any>, rotina: string): Promise<number | null> {
  try {
    const { data, error } = await semTipo(db).rpc('rotina_execucao_abrir', { p_rotina: rotina })
    if (error) { console.warn(`[rotinas] não abriu a execução de ${rotina}:`, error.message); return null }
    return typeof data === 'number' ? data : Number(data) || null
  } catch (e) {
    console.warn(`[rotinas] não abriu a execução de ${rotina}:`, e instanceof Error ? e.message : e)
    return null
  }
}

/** Fecha a execução com o que a rota respondeu. Nunca lança. */
export async function fecharExecucao(
  db: SupabaseClient<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  id: number | null, httpStatus: number, corpo: unknown,
): Promise<void> {
  if (id == null) return
  try {
    const empresas = empresasDaResposta(corpo)
    const { error } = await semTipo(db).rpc('rotina_execucao_fechar', {
      p_id: id,
      p_status: statusDaResposta(httpStatus, corpo),
      p_resumo: ehObjeto(corpo) ? corpo : null,
      p_empresas: empresas,
      p_erro: erroDaResposta(httpStatus, corpo, empresas),
    })
    if (error) console.warn(`[rotinas] não fechou a execução ${id}:`, error.message)
  } catch (e) {
    console.warn(`[rotinas] não fechou a execução ${id}:`, e instanceof Error ? e.message : e)
  }
}

// ── Página do superadmin ─────────────────────────────────────────────────────────────────────────────
export interface RotinaSituacao {
  nome: string
  origem: 'pg_cron' | 'vercel'
  agenda: string
  descricao: string
  condicional: boolean
  ultima_execucao: { id: number; inicio: string; fim: string | null; status: string; empresas: number; empresas_erro: number; erro: string | null } | null
  ultima_rodada_agendador: string | null
  agendador_status: string | null
  atrasada: boolean
  motivo_atraso: string | null
}
export interface ProblemaRotina {
  id: number; rotina: string; origem: string; inicio: string; status: string; erro: string | null
  empresas: { empresa: number; nome: string | null; erro: string | null }[] | null
}
export interface SituacaoRotinas { agora: string; rotinas: RotinaSituacao[]; problemas: ProblemaRotina[]; atrasadas: number }

/** Quantos avisos a faixa mostra: execuções com erro não vistas + rotinas atrasadas. */
export function totalDeAvisos(s: Pick<SituacaoRotinas, 'problemas' | 'atrasadas'> | null): number {
  if (!s) return 0
  return (s.problemas?.length ?? 0) + (s.atrasadas ?? 0)
}

/** Situação das rotinas (só superadmin; a função do banco confere). Null se não puder ler. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function situacaoDasRotinas(db: SupabaseClient<any>): Promise<SituacaoRotinas | null> {
  try {
    const { data, error } = await semTipo(db).rpc('rotinas_situacao')
    if (error) return null
    return data as SituacaoRotinas
  } catch {
    return null
  }
}
