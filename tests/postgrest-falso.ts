/**
 * POSTGREST FALSO QUE EXECUTA OS FILTROS (25/11/2026). O tests/banco-falso.ts só grava o pedido; este responde como o banco.
 *
 * Executa de verdade os filtros que o código manda ao PostgREST — eq, neq, in, not.in, is, gte/gt/lte/lt,
 * `or(...)` com `and(...)` aninhado —, a ordem, o `range` e o `count: 'exact'`. Serve para provar que a
 * CONSULTA traz a venda certa (não só que a conta sobre linhas prontas está certa).
 *
 * Embeds: `alias:tabela(colunas)` traz as linhas de `tabela` cujo `chaves[tabela]` = id da linha (um-para-
 * muitos, ex.: pagamentos:vendas_pagamentos(valor_pago) por venda_id). `alias:tabela!fk(colunas)` traz a
 * linha de `tabela` com id = linha[fk] (muitos-para-um). Qualquer outro embed volta null.
 */
type Linha = Record<string, unknown>
type Filtro = (l: Linha) => boolean

const valor = (bruto: string): unknown => {
  const s = bruto.startsWith('"') && bruto.endsWith('"') ? bruto.slice(1, -1) : bruto
  if (s === 'null') return null
  if (s === 'true') return true
  if (s === 'false') return false
  return s
}

/** Compara como o Postgres compararia: número com número, instante com instante, texto com texto. */
function comparar(a: unknown, b: unknown): number {
  if (a == null || b == null) return NaN
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b)
  const da = Date.parse(String(a)), db = Date.parse(String(b))
  if (!Number.isNaN(da) && !Number.isNaN(db) && /\d{4}-\d{2}-\d{2}/.test(String(a))) return da - db
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function operador(col: string, op: string, bruto: string): Filtro {
  const v = valor(bruto)
  switch (op) {
    case 'eq': return (l) => String(l[col]) === String(v)
    case 'neq': return (l) => String(l[col]) !== String(v)
    case 'gte': return (l) => comparar(l[col], v) >= 0
    case 'gt': return (l) => comparar(l[col], v) > 0
    case 'lte': return (l) => comparar(l[col], v) <= 0
    case 'lt': return (l) => comparar(l[col], v) < 0
    case 'is': return (l) => (v === null ? l[col] == null : l[col] === v)
    default: throw new Error(`banco falso: operador ${op} não suportado`)
  }
}

/** Separa por vírgula no nível de cima (fora de parênteses e de aspas). */
function partes(s: string): string[] {
  const fora: string[] = []
  let nivel = 0, aspas = false, atual = ''
  for (const ch of s) {
    if (ch === '"') aspas = !aspas
    if (!aspas && ch === '(') nivel++
    if (!aspas && ch === ')') nivel--
    if (!aspas && nivel === 0 && ch === ',') { fora.push(atual); atual = ''; continue }
    atual += ch
  }
  if (atual) fora.push(atual)
  return fora
}

function termo(t: string): Filtro {
  if (t.startsWith('and(') && t.endsWith(')')) {
    const fs = partes(t.slice(4, -1)).map(termo)
    return (l) => fs.every((f) => f(l))
  }
  if (t.startsWith('or(') && t.endsWith(')')) {
    const fs = partes(t.slice(3, -1)).map(termo)
    return (l) => fs.some((f) => f(l))
  }
  const i = t.indexOf('.'), j = t.indexOf('.', i + 1)
  return operador(t.slice(0, i), t.slice(i + 1, j), t.slice(j + 1))
}

export function postgrestFalso(tabelas: Record<string, Linha[]>, chaves: Record<string, string> = {}) {
  const pedidos: { tabela: string; filtrosOr: string[] }[] = []

  class Consulta implements PromiseLike<{ data: unknown; error: null; count?: number | null }> {
    private filtros: Filtro[] = []
    private ordem: { col: string; asc: boolean }[] = []
    private faixa: [number, number] | null = null
    private contar = false
    private unico: 'single' | 'maybe' | null = null
    private embeds: { alias: string; tabela: string; fk: string | null }[] = []
    private registro: { tabela: string; filtrosOr: string[] }
    private tabela: string
    constructor(tabela: string) {
      this.tabela = tabela
      this.registro = { tabela, filtrosOr: [] }
      pedidos.push(this.registro)
    }
    select(colunas = '*', opts?: { count?: string }) {
      this.contar = opts?.count === 'exact'
      for (const m of colunas.matchAll(/(?:(\w+):)?(\w+)(?:!(\w+))?\(/g)) {
        this.embeds.push({ alias: m[1] ?? m[2], tabela: m[2], fk: m[3] ?? null })
      }
      return this
    }
    eq(c: string, v: unknown) { this.filtros.push(operador(c, 'eq', String(v))); return this }
    neq(c: string, v: unknown) { this.filtros.push(operador(c, 'neq', String(v))); return this }
    gte(c: string, v: unknown) { this.filtros.push(operador(c, 'gte', String(v))); return this }
    gt(c: string, v: unknown) { this.filtros.push(operador(c, 'gt', String(v))); return this }
    lte(c: string, v: unknown) { this.filtros.push(operador(c, 'lte', String(v))); return this }
    lt(c: string, v: unknown) { this.filtros.push(operador(c, 'lt', String(v))); return this }
    is(c: string, v: null) { this.filtros.push(operador(c, 'is', String(v))); return this }
    in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtros.push((l) => s.has(String(l[c]))); return this }
    not(c: string, op: string, v: string) {
      if (op === 'in') {
        const s = new Set(v.replace(/^\(|\)$/g, '').split(',').map((x) => String(valor(x.trim()))))
        this.filtros.push((l) => l[c] != null && !s.has(String(l[c])))
      } else if (op === 'is') {
        const f = operador(c, 'is', v); this.filtros.push((l) => !f(l))
      } else throw new Error(`banco falso: not.${op} não suportado`)
      return this
    }
    or(s: string) { this.registro.filtrosOr.push(s); this.filtros.push(termo(`or(${s})`)); return this }
    order(col: string, o?: { ascending?: boolean }) { this.ordem.push({ col, asc: o?.ascending !== false }); return this }
    range(de: number, ate: number) { this.faixa = [de, ate]; return this }
    limit(n: number) { this.faixa = [0, n - 1]; return this }
    single() { this.unico = 'single'; return this }
    maybeSingle() { this.unico = 'maybe'; return this }
    /** UPDATE: aplica o patch nas linhas que passarem nos filtros; com `.select()` devolve as linhas mudadas. */
    private patch: Linha | null = null
    update(p: Linha) { this.patch = p; return this }

    private executar() {
      let linhas = (tabelas[this.tabela] ?? []).filter((l) => this.filtros.every((f) => f(l)))
      if (this.patch) {
        for (const l of linhas) Object.assign(l, this.patch)
        linhas = linhas.map((l) => ({ ...l }))
      }
      for (const { col, asc } of [...this.ordem].reverse()) {
        linhas = [...linhas].sort((a, b) => (comparar(a[col], b[col]) || 0) * (asc ? 1 : -1))
      }
      const total = linhas.length
      if (this.faixa) linhas = linhas.slice(this.faixa[0], this.faixa[1] + 1)
      const comEmbeds = linhas.map((l) => {
        const r: Linha = { ...l }
        for (const e of this.embeds) {
          const alvo = tabelas[e.tabela] ?? []
          if (e.fk) r[e.alias] = alvo.find((x) => x.id === l[e.fk!]) ?? null
          else if (chaves[e.tabela]) r[e.alias] = alvo.filter((x) => x[chaves[e.tabela]] === l.id)
          else r[e.alias] = null
        }
        return r
      })
      const data = this.unico ? (comEmbeds[0] ?? null) : comEmbeds
      return { data, error: null, ...(this.contar ? { count: total } : {}) }
    }
    then<A, B>(ok?: ((v: { data: unknown; error: null; count?: number | null }) => A | PromiseLike<A>) | null, erro?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(this.executar()).then(ok, erro)
    }
  }

  /** Storage falso: guarda o que foi enviado; `falhar` devolve o erro dado no próximo upload. */
  const arquivos = new Map<string, { bytes: number; contentType?: string }>()
  const storageFalso = { falhar: null as null | { message: string; status?: number } }
  const storage = {
    from: (bucket: string) => ({
      async upload(caminho: string, corpo: { byteLength?: number; length?: number }, o?: { contentType?: string }) {
        if (storageFalso.falhar) { const e = storageFalso.falhar; storageFalso.falhar = null; return { data: null, error: e } }
        arquivos.set(`${bucket}/${caminho}`, { bytes: corpo.byteLength ?? corpo.length ?? 0, contentType: o?.contentType })
        return { data: { path: caminho }, error: null }
      },
      getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://falso.supabase.co/storage/v1/object/public/${bucket}/${caminho}` } }),
    }),
  }

  return {
    from: (t: string) => new Consulta(t),
    rpc: async () => ({ data: [], error: null }),
    storage, arquivos, storageFalso,
    /** O que foi pedido ao banco (tabela e os `or` mandados), para o teste conferir. */
    pedidos,
  }
}
