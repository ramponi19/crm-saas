/**
 * PAINEL DO GESTOR DO PÓS-VENDA (25/11/2026) — regras puras (tela e testes). Universal: por pessoa responsável, num
 * período (hoje, 7 ou 30 dias, contando hoje) e, se quiser, numa loja.
 *
 *   pendentes        passo pendente previsto até hoje (o que a pessoa tem para fazer agora; não depende do período)
 *   atrasados        passo pendente previsto antes de hoje
 *   feitos           marcado como feito no período
 *   no prazo         dos feitos, os feitos até o dia previsto
 *   perdidos         passo que passou da tolerância de atraso e a rotina marcou como perdido; o dia da perda é estimado
 *                    como dia previsto + tolerância + 1 (a rotina roda no primeiro dia aberto depois disso)
 *   sem resposta     encerrado sem resposta no período (depois das tentativas)
 *   pulados          pulado pela pessoa no período, com o motivo
 *   notas            notas de NPS registradas no período para clientes da pessoa (média e quantidade)
 *   chamados         chamados ainda abertos de clientes cujo negócio é da pessoa
 *   por meio         dos feitos no período: app da loja, ligação, Nexus, modelo (o que a fila registrou) ou "sem registro"
 */
import { diaNoFuso, somarDias } from '@/lib/datas'

export type PeriodoPainel = 'hoje' | '7' | '30'
export const PERIODOS: Record<PeriodoPainel, string> = { hoje: 'Hoje', '7': '7 dias', '30': '30 dias' }
/** Na ordem da tela (Object.keys poria '7' e '30' antes de 'hoje': chaves numéricas vêm primeiro). */
export const ORDEM_PERIODOS: PeriodoPainel[] = ['hoje', '7', '30']
export const DIAS_DO_PERIODO: Record<PeriodoPainel, number> = { hoje: 1, '7': 7, '30': 30 }
export type MeioContato = 'app_loja' | 'ligacao' | 'nexus' | 'modelo' | 'sem_registro'
export const MEIOS: Record<MeioContato, string> = { app_loja: 'App da loja', ligacao: 'Ligação', nexus: 'Nexus', modelo: 'Modelo', sem_registro: 'Sem registro' }

export interface PassoDoPainel {
  id: number; responsavel_id: string; filial_id: number | null; status: string
  previsto_para: string; feito_em: string | null; resultado: string | null; motivo: string | null; tolerancia_dias: number | null
}
export interface NotaDoPainel { vendedor_id: string | null; nota: number; respondida_em: string; canal: string | null; acompanhamento_id: number | null; filial_id: number | null }
export interface ChamadoDoPainel { responsavel_negocio: string | null; filial_id: number | null }

export interface LinhaPainel {
  pessoa: string
  pendentes: number; atrasados: number; feitos: number; noPrazo: number; perdidos: number; semResposta: number; pulados: number
  motivosPulo: { motivo: string; n: number }[]
  notas: number; mediaNota: number | null
  chamadosAbertos: number
  porMeio: Record<MeioContato, number>
}

/** O meio do contato pelo que a fila gravou (resultado do "Feito" ou canal da nota). */
export function meioDoResultado(resultado: string | null, canalNota?: string | null): MeioContato {
  const r = (resultado ?? '').trim().toLowerCase()
  const c = (canalNota ?? '').trim().toLowerCase()
  if (r === 'app da loja' || c === 'app_loja') return 'app_loja'
  if (r === 'ligação' || r === 'ligacao' || c === 'ligacao') return 'ligacao'
  if (r === 'nexus' || c === 'nexus' || c === 'whatsapp') return 'nexus'
  if (r === 'modelo' || c === 'modelo') return 'modelo'
  return 'sem_registro'
}

const vazio = (pessoa: string): LinhaPainel => ({
  pessoa, pendentes: 0, atrasados: 0, feitos: 0, noPrazo: 0, perdidos: 0, semResposta: 0, pulados: 0, motivosPulo: [],
  notas: 0, mediaNota: null, chamadosAbertos: 0, porMeio: { app_loja: 0, ligacao: 0, nexus: 0, modelo: 0, sem_registro: 0 },
})

export function montarPainel(dados: { passos: PassoDoPainel[]; notas: NotaDoPainel[]; chamados: ChamadoDoPainel[]; pessoas: string[] },
  opcoes: { periodo: PeriodoPainel; hoje: string; fuso: string; loja: number | null }): { linhas: LinhaPainel[]; total: LinhaPainel } {
  const inicio = somarDias(opcoes.hoje, -(DIAS_DO_PERIODO[opcoes.periodo] - 1))
  const noPeriodo = (dia: string | null) => !!dia && dia >= inicio && dia <= opcoes.hoje
  const daLoja = (f: number | null) => opcoes.loja == null || f === opcoes.loja
  const dia = (iso: string | null) => (iso ? diaNoFuso(new Date(iso), opcoes.fuso) : null)
  const por = new Map<string, LinhaPainel & { somaNotas: number; motivos: Map<string, number> }>()
  const linha = (p: string) => {
    if (!por.has(p)) por.set(p, { ...vazio(p), somaNotas: 0, motivos: new Map() })
    return por.get(p)!
  }
  dados.pessoas.forEach((p) => linha(p))
  const canalDaNota = new Map(dados.notas.filter((n) => n.acompanhamento_id != null).map((n) => [n.acompanhamento_id as number, n.canal]))

  for (const a of dados.passos) {
    if (!daLoja(a.filial_id)) continue
    const l = linha(a.responsavel_id)
    const previsto = dia(a.previsto_para) as string
    const feito = dia(a.feito_em)
    if (a.status === 'pendente') {
      if (previsto <= opcoes.hoje) l.pendentes++
      if (previsto < opcoes.hoje) l.atrasados++
    } else if (a.status === 'feito' && noPeriodo(feito)) {
      l.feitos++
      if (feito! <= previsto) l.noPrazo++
      l.porMeio[meioDoResultado(a.resultado, canalDaNota.get(a.id))]++
    } else if (a.status === 'perdido' && noPeriodo(somarDias(previsto, (a.tolerancia_dias ?? 0) + 1))) {
      l.perdidos++
    } else if (a.status === 'sem_resposta' && noPeriodo(feito)) {
      l.semResposta++
    } else if (a.status === 'pulado' && a.feito_em && noPeriodo(feito)) {
      l.pulados++
      const m = (a.motivo || a.resultado || 'sem motivo').trim()
      l.motivos.set(m, (l.motivos.get(m) ?? 0) + 1)
    }
  }
  for (const n of dados.notas) {
    if (!n.vendedor_id || !daLoja(n.filial_id) || !noPeriodo(dia(n.respondida_em))) continue
    const l = linha(n.vendedor_id)
    l.notas++; l.somaNotas += n.nota
  }
  for (const c of dados.chamados) {
    if (!c.responsavel_negocio || !daLoja(c.filial_id)) continue
    linha(c.responsavel_negocio).chamadosAbertos++
  }

  const linhas: LinhaPainel[] = [...por.values()].map(({ somaNotas, motivos, ...l }) => ({
    ...l, mediaNota: l.notas ? Math.round((somaNotas / l.notas) * 10) / 10 : null,
    motivosPulo: [...motivos.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 3),
  }))
  // Quem tem atrasado primeiro (mais atrasados no topo); depois quem tem mais pendente.
  linhas.sort((a, b) => b.atrasados - a.atrasados || b.pendentes - a.pendentes || a.pessoa.localeCompare(b.pessoa))

  const total = vazio('total')
  const somaTotal = [...por.values()].reduce((s, l) => s + l.somaNotas, 0)
  for (const l of linhas) {
    for (const k of ['pendentes', 'atrasados', 'feitos', 'noPrazo', 'perdidos', 'semResposta', 'pulados', 'notas', 'chamadosAbertos'] as const) total[k] += l[k]
    for (const m of Object.keys(total.porMeio) as MeioContato[]) total.porMeio[m] += l.porMeio[m]
  }
  total.mediaNota = total.notas ? Math.round((somaTotal / total.notas) * 10) / 10 : null
  return { linhas, total }
}

/** % feito no prazo (null sem feitos). */
export const pctNoPrazo = (l: Pick<LinhaPainel, 'feitos' | 'noPrazo'>) => (l.feitos ? Math.round((l.noPrazo / l.feitos) * 100) : null)
