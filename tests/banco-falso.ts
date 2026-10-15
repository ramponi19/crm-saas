/**
 * Um Supabase de mentira para testes de unidade: grava cada consulta (tabela,
 * operação e filtros) e responde com o que o teste mandar. Assim dá para
 * provar o que o código PEDE ao banco — paginação, filtros, o que apaga —
 * sem tocar no banco de verdade.
 */
export interface Consulta {
  tabela: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc' | 'remove'
  dados?: unknown
  filtros: [string, ...unknown[]][]
}

export type Responder = (c: Consulta) => { data: unknown; error: { message: string; code?: string } | null }

export function bancoFalso(responder: Responder) {
  const consultas: Consulta[] = []

  const construtor = (c: Consulta) => {
    const resultado = () => Promise.resolve(responder(c))
    const b: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => resultado().then(ok, erro),
      maybeSingle: () => resultado(),
      single: () => resultado(),
    }
    for (const m of ['select', 'eq', 'in', 'or', 'order', 'range', 'lt', 'gte', 'not', 'is', 'limit', 'filter', 'neq']) {
      b[m] = (...args: unknown[]) => {
        if (m === 'select' && c.op === 'select' && c.filtros.length === 0 && c.dados === undefined) c.dados = args[0]
        else c.filtros.push([m, ...args])
        return b
      }
    }
    return b
  }

  const db = {
    consultas,
    from(tabela: string) {
      const nova = (op: Consulta['op'], dados?: unknown) => {
        const c: Consulta = { tabela, op, dados, filtros: [] }
        consultas.push(c)
        return construtor(c)
      }
      return {
        select: (cols?: string) => nova('select', cols),
        insert: (dados: unknown) => nova('insert', dados),
        update: (dados: unknown) => nova('update', dados),
        upsert: (dados: unknown) => nova('upsert', dados),
        delete: () => nova('delete'),
      }
    },
    rpc(nome: string, args: unknown) {
      const c: Consulta = { tabela: nome, op: 'rpc', dados: args, filtros: [] }
      consultas.push(c)
      return construtor(c)
    },
    storage: {
      from(bucket: string) {
        return {
          remove: (nomes: string[]) => {
            const c: Consulta = { tabela: `storage:${bucket}`, op: 'remove', dados: nomes, filtros: [] }
            consultas.push(c)
            return Promise.resolve(responder(c))
          },
        }
      },
    },
  }
  return db
}

/** O valor de um filtro gravado, ex.: filtro(c, 'in') → ['id', [1, 2]]. */
export const filtro = (c: Consulta, nome: string) => c.filtros.find((f) => f[0] === nome)?.slice(1)
