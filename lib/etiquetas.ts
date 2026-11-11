/**
 * ETIQUETAS (core, 11/11/2026 — migração 20261111000500_etiquetas).
 *
 * Etiqueta é da empresa (nome único sem caixa/espaços, cor da paleta); o contato guarda as
 * suas em `contatos.etiqueta_ids`. Dono/admin criam, renomeiam e apagam; quem alcança o
 * negócio aplica e tira (função `etiquetas_aplicar`, que também é o lote do quadro). O
 * histórico (negocio_historico 'etiqueta_aplicada' / 'etiqueta_tirada') é gravado por
 * gatilho no banco — nenhum caminho escapa.
 *
 * Filtro em todas as telas (quadro, Comunicação, busca, Transmissão): "contém" = tem ALGUMA
 * das escolhidas; "não contém" = não tem NENHUMA delas. As duas listas juntas valem as duas.
 *
 * Este arquivo é puro (servidor e navegador).
 */

export const CORES_ETIQUETA = ['cinza', 'azul', 'verde', 'ambar', 'vermelho'] as const
export type CorEtiqueta = typeof CORES_ETIQUETA[number]

export interface Etiqueta { id: number; nome: string; cor: CorEtiqueta }

/** Cor → classes da paleta Precisão (fundo suave + texto), o mesmo desenho dos selos de hoje. */
export const CLASSE_DA_COR: Record<CorEtiqueta, string> = {
  cinza: 'bg-ink/[0.06] text-ink-2',
  azul: 'bg-accent-soft text-accent',
  verde: 'bg-ok-soft text-ok',
  ambar: 'bg-warn-soft text-warn',
  vermelho: 'bg-bad-soft text-bad',
}

/** A bolinha da cor (escolha de cor nas Configurações). */
export const PONTO_DA_COR: Record<CorEtiqueta, string> = {
  cinza: 'bg-ink-3', azul: 'bg-accent', verde: 'bg-ok', ambar: 'bg-warn', vermelho: 'bg-bad',
}

export const NOME_DA_COR: Record<CorEtiqueta, string> = {
  cinza: 'Cinza', azul: 'Azul', verde: 'Verde', ambar: 'Âmbar', vermelho: 'Vermelho',
}

export const NOME_MAX = 40

export function corValida(c: unknown): CorEtiqueta {
  return (CORES_ETIQUETA as readonly string[]).includes(String(c)) ? (c as CorEtiqueta) : 'cinza'
}

/** Nome como o banco compara (sem caixa, sem espaço nas pontas). */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase()
}

/** Nome digitado → nome gravável, ou o motivo de não dar. */
export function validarNome(nome: unknown, existentes: { id: number; nome: string }[], proprioId?: number): { nome: string } | { erro: string } {
  const n = String(nome ?? '').replace(/\s+/g, ' ').trim()
  if (!n) return { erro: 'Escreva o nome da etiqueta.' }
  if (n.length > NOME_MAX) return { erro: `No máximo ${NOME_MAX} letras.` }
  if (existentes.some((e) => e.id !== proprioId && chaveDoNome(e.nome) === chaveDoNome(n))) {
    return { erro: `Já existe a etiqueta "${n}".` }
  }
  return { nome: n }
}

export interface FiltroEtiquetas { com: number[]; sem: number[] }
export const FILTRO_ETIQUETAS_VAZIO: FiltroEtiquetas = { com: [], sem: [] }

function ids(x: unknown): number[] {
  if (!Array.isArray(x)) return []
  return [...new Set(x.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b).slice(0, 50)
}

/** Qualquer coisa → filtro limpo. Uma etiqueta não fica nas duas listas ("não contém" vence). */
export function normalizarFiltroEtiquetas(x: unknown): FiltroEtiquetas {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const sem = ids(o.sem)
  const com = ids(o.com).filter((i) => !sem.includes(i))
  return { com, sem }
}

export function filtroEtiquetasAtivo(f: FiltroEtiquetas | null | undefined): boolean {
  return !!f && (f.com.length > 0 || f.sem.length > 0)
}

/** Neutro → contém → não contém → neutro (o clique no filtro). */
export function alternarNoFiltro(f: FiltroEtiquetas, id: number): FiltroEtiquetas {
  if (f.com.includes(id)) return { com: f.com.filter((x) => x !== id), sem: [...f.sem, id].sort((a, b) => a - b) }
  if (f.sem.includes(id)) return { com: f.com, sem: f.sem.filter((x) => x !== id) }
  return { com: [...f.com, id].sort((a, b) => a - b), sem: f.sem }
}

/** O contato (pelos ids dele) passa no filtro? A mesma regra do banco. */
export function passaNoFiltro(etiquetasDoContato: number[] | null | undefined, f: FiltroEtiquetas): boolean {
  const tem = new Set(etiquetasDoContato ?? [])
  if (f.com.length && !f.com.some((i) => tem.has(i))) return false
  if (f.sem.length && f.sem.some((i) => tem.has(i))) return false
  return true
}

/** "com Quente ou VIP · sem Sumiu" — para resumo de filtro. */
export function descreverFiltroEtiquetas(f: FiltroEtiquetas, todas: Etiqueta[]): string {
  const nome = (i: number) => todas.find((e) => e.id === i)?.nome ?? `#${i}`
  const partes: string[] = []
  if (f.com.length) partes.push(`com ${f.com.map(nome).join(' ou ')}`)
  if (f.sem.length) partes.push(`sem ${f.sem.map(nome).join(' nem ')}`)
  return partes.join(' · ')
}

/** URL: `et=3,7&etn=9` (contém / não contém). */
export function filtroEtiquetasDaUrl(sp: URLSearchParams): FiltroEtiquetas {
  const lista = (v: string | null) => (v ?? '').split(',').filter(Boolean)
  return normalizarFiltroEtiquetas({ com: lista(sp.get('et')), sem: lista(sp.get('etn')) })
}

export function filtroEtiquetasNaUrl(sp: URLSearchParams, f: FiltroEtiquetas): void {
  if (f.com.length) sp.set('et', f.com.join(',')); else sp.delete('et')
  if (f.sem.length) sp.set('etn', f.sem.join(',')); else sp.delete('etn')
}

/** As etiquetas do contato, na ordem do nome, só as que existem (apagada some). */
export function etiquetasDoContato(ids: number[] | null | undefined, todas: Etiqueta[]): Etiqueta[] {
  if (!ids?.length) return []
  const set = new Set(ids)
  return todas.filter((e) => set.has(e.id))
}

/** Linha do histórico do negócio para a etiqueta. */
export function fraseDoHistorico(acao: string, detalhe: Record<string, unknown> | null): string | null {
  if (acao !== 'etiqueta_aplicada' && acao !== 'etiqueta_tirada') return null
  const nome = String(detalhe?.nome ?? 'etiqueta')
  const motivo = detalhe?.motivo ? ` (${String(detalhe.motivo)})` : ''
  return `${acao === 'etiqueta_aplicada' ? 'Etiqueta aplicada' : 'Etiqueta tirada'}: ${nome}${motivo}`
}
