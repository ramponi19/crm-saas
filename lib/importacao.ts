/**
 * IMPORTAÇÃO DE CONTATOS E LEADS POR PLANILHA (18/11/2026, core — preparação do primeiro piloto).
 * Regras puras (tela e rota usam as mesmas): o que cada coluna pode ser, o palpite do mapeamento pelo nome
 * do cabeçalho e a validação linha a linha, com a deduplicação por telefone dentro da planilha. A
 * deduplicação contra o que já existe na empresa é da rota (app/api/importacao), pelo `telefone_e164`.
 *
 * Telefone é obrigatório: é a chave do contato (índice único por empresa) e o que o WhatsApp usa. Linha
 * recusada nunca é gravada; o relatório diz a linha da planilha (a do Excel, cabeçalho = 1) e o motivo.
 */
import { telefoneE164 } from '@/lib/telefone-e164'
import { mascaraTelefone } from '@/lib/mascaras'

export type CampoImportacao = 'nome' | 'telefone' | 'email' | 'interesse' | 'valor' | 'observacoes'
export type Mapa = Partial<Record<CampoImportacao, number>>

export const CAMPOS: { chave: CampoImportacao; rotulo: string; obrigatorio?: boolean }[] = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'telefone', rotulo: 'Telefone / WhatsApp', obrigatorio: true },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'interesse', rotulo: 'Interesse' },
  { chave: 'valor', rotulo: 'Valor estimado' },
  { chave: 'observacoes', rotulo: 'Observações' },
]

/** Teto por importação: cabe na resposta da rota e no tempo de uma função. */
export const MAX_LINHAS = 5000
export const ETIQUETA_IMPORTACAO = 'importação'

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const PALPITES: [CampoImportacao, RegExp][] = [
  ['telefone', /(telefone|celular|whats|fone|^tel\b|phone|contato \(tel|^zap)/],
  ['email', /e-?mail/],
  ['nome', /^(nome|cliente|contato|name|razao social|nome completo)/],
  ['interesse', /(interesse|produto|modelo|procura|item)/],
  ['valor', /(valor|preco|orcamento|ticket)/],
  ['observacoes', /(obs|nota|coment|anotac)/],
]

/** O palpite do mapeamento: cada campo na primeira coluna cujo cabeçalho combina; nenhuma coluna duas vezes. */
export function adivinharMapa(colunas: string[]): Mapa {
  const mapa: Mapa = {}
  const usadas = new Set<number>()
  for (const [campo, re] of PALPITES) {
    const i = colunas.findIndex((c, idx) => !usadas.has(idx) && re.test(normal(c)))
    if (i >= 0) { mapa[campo] = i; usadas.add(i) }
  }
  return mapa
}

export interface LinhaValida {
  /** A linha no Excel (cabeçalho = 1). */
  linha: number
  nome: string
  telefone: string
  e164: string
  email: string | null
  interesse: string | null
  valor: number | null
  observacoes: string | null
}
export interface Recusada { linha: number; motivo: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "R$ 1.234,56", "1234.5", "50.000" → número; vazio → null; outra coisa → NaN. */
export function lerValor(bruto: string): number | null {
  const s = bruto.replace(/R\$|\s/gi, '')
  if (!s) return null
  let n: number
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'))
  else if (/^\d+(\.\d+)?$/.test(s)) n = Number(s)
  else n = NaN
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

/** O telefone para mostrar: nacional com máscara; internacional como E.164. */
export function telefoneExibicao(e164: string): string {
  return e164.startsWith('+55') ? mascaraTelefone(e164.slice(3)) : e164
}

export function validarLinhas(linhas: string[][], mapa: Mapa): { validas: LinhaValida[]; recusadas: Recusada[] } {
  const validas: LinhaValida[] = []
  const recusadas: Recusada[] = []
  const vistos = new Map<string, number>()
  const cel = (l: string[], c: CampoImportacao) => (mapa[c] == null ? '' : (l[mapa[c]!] ?? '').trim())
  linhas.forEach((l, i) => {
    const linha = i + 2
    const tel = cel(l, 'telefone')
    if (!tel) { recusadas.push({ linha, motivo: 'sem telefone' }); return }
    const e164 = telefoneE164(tel)
    if (!e164) { recusadas.push({ linha, motivo: `telefone inválido (${tel.slice(0, 30)})` }); return }
    const repetida = vistos.get(e164)
    if (repetida) { recusadas.push({ linha, motivo: `telefone repetido na planilha (igual à linha ${repetida})` }); return }
    const email = cel(l, 'email') || null
    if (email && !EMAIL.test(email)) { recusadas.push({ linha, motivo: `e-mail inválido (${email.slice(0, 40)})` }); return }
    const valor = lerValor(cel(l, 'valor'))
    if (Number.isNaN(valor)) { recusadas.push({ linha, motivo: `valor inválido (${cel(l, 'valor').slice(0, 20)})` }); return }
    vistos.set(e164, linha)
    const telefone = telefoneExibicao(e164)
    validas.push({
      linha, e164, telefone,
      nome: (cel(l, 'nome') || telefone).slice(0, 120),
      email: email?.toLowerCase() ?? null,
      interesse: cel(l, 'interesse').slice(0, 200) || null,
      valor,
      observacoes: cel(l, 'observacoes').slice(0, 2000) || null,
    })
  })
  return { validas, recusadas }
}

/** O relatório das recusadas em CSV (`;`, como o Excel pt-BR abre): linha, motivo e a linha original. */
export function csvDasRecusadas(recusadas: Recusada[], colunas: string[], linhas: string[][]): string {
  const q = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const cab = ['linha', 'motivo', ...colunas].map(q).join(';')
  const corpo = recusadas.map((r) => [String(r.linha), r.motivo, ...(linhas[r.linha - 2] ?? [])].map(q).join(';'))
  return '﻿' + [cab, ...corpo].join('\r\n')
}
