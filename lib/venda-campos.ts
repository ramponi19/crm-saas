/**
 * CAMPOS DA VENDA (24/11/2026). Campos personalizados de negócio que a empresa pede ao marcar a venda (hoje, os do
 * Pós-venda: `core_venda_campos()` só devolve algo com o módulo ligado). A tela e a rota usam as mesmas regras; o banco
 * confere o tipo de novo (core_validar_dados). Valor vazio de campo opcional não é gravado.
 */
export interface CampoDaVenda { chave: string; rotulo: string; tipo: string; opcoes: string[]; obrigatorio: boolean }

export function camposDaVenda(v: unknown): CampoDaVenda[] {
  if (!Array.isArray(v)) return []
  return v.filter((c): c is CampoDaVenda => !!c && typeof (c as CampoDaVenda).chave === 'string' && typeof (c as CampoDaVenda).rotulo === 'string')
    .map((c) => ({ ...c, opcoes: Array.isArray(c.opcoes) ? c.opcoes.filter((o): o is string => typeof o === 'string') : [], obrigatorio: c.obrigatorio === true }))
}

/** Número digitado: "12.500", "12,5", "12500". */
function numero(t: string): number | null {
  const s = t.trim()
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s)
  return Number.isFinite(n) ? n : null
}

export type ChecagemCampos = { ok: true; valores: Record<string, string | number> } | { ok: false; campo: string; erro: string }

/** Confere os valores digitados contra os campos e devolve os valores no tipo que o banco aceita. */
export function validarCamposDaVenda(campos: CampoDaVenda[], entrada: unknown): ChecagemCampos {
  const bruto = entrada && typeof entrada === 'object' && !Array.isArray(entrada) ? (entrada as Record<string, unknown>) : {}
  const valores: Record<string, string | number> = {}
  for (const c of campos) {
    const v = bruto[c.chave]
    const t = v == null ? '' : String(v).trim()
    if (!t) {
      if (c.obrigatorio) return { ok: false, campo: c.chave, erro: `Informe ${c.rotulo.toLowerCase()}.` }
      continue
    }
    if (c.tipo === 'numero' || c.tipo === 'moeda') {
      const n = typeof v === 'number' ? v : numero(t)
      if (n == null) return { ok: false, campo: c.chave, erro: `${c.rotulo}: digite um número.` }
      valores[c.chave] = n
    } else if (c.tipo === 'data') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(t))) return { ok: false, campo: c.chave, erro: `${c.rotulo}: data inválida.` }
      valores[c.chave] = t
    } else if (c.tipo === 'opcao') {
      if (c.opcoes.length && !c.opcoes.includes(t)) return { ok: false, campo: c.chave, erro: `${c.rotulo}: escolha uma das opções.` }
      valores[c.chave] = t
    } else {
      valores[c.chave] = t.slice(0, 200)
    }
  }
  return { ok: true, valores }
}
