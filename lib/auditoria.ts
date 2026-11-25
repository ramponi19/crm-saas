/**
 * AUDITORIA (etapa 1.1a, 25/11/2026; docs/etapa-1.1-plano.md §1). Regras puras da tela: rótulos, filtros e o
 * "antes → depois" campo a campo. A gravação é só no banco (auditar / auditar_emp), nunca pelo app.
 */

export interface EventoAuditoria {
  id: number
  criado_em: string
  usuario_id: string | null
  impersonado_por: string | null
  entidade: string
  entidade_id: string | null
  acao: string
  antes: unknown
  depois: unknown
  motivo: string | null
  origem: string | null
  filial_id: number | null
}

const ROTULO_ENTIDADE: Record<string, string> = {
  config: 'Configuração', cargo: 'Cargo', usuario: 'Usuário', plataforma: 'Plataforma',
  unidade: 'Unidade', variante: 'Variante', venda: 'Venda',
}
const ROTULO_ACAO: Record<string, string> = {
  alterar: 'Alterou', criar: 'Criou', apagar: 'Apagou', preco: 'Preço',
  plataforma_entrou: 'Entrou (plataforma)', plataforma_saiu: 'Saiu (plataforma)', plataforma_acessou: 'Abriu tela (plataforma)',
}
export const rotuloEntidade = (e: string) => ROTULO_ENTIDADE[e] ?? e
export const rotuloAcao = (a: string) => ROTULO_ACAO[a] ?? a

/** Uma linha do "antes → depois": o campo e os dois valores já em texto. */
export interface Diferenca { campo: string; antes: string; depois: string }

function emTexto(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

/**
 * Compara antes e depois campo a campo (objetos no primeiro nível). Só aparecem os campos que mudaram;
 * valores que não são objeto viram uma linha só ("valor").
 */
export function diferencas(antes: unknown, depois: unknown): Diferenca[] {
  const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  if (!ehObjeto(antes) && !ehObjeto(depois)) {
    return emTexto(antes) === emTexto(depois) ? [] : [{ campo: 'valor', antes: emTexto(antes), depois: emTexto(depois) }]
  }
  const a = ehObjeto(antes) ? antes : {}
  const d = ehObjeto(depois) ? depois : {}
  const campos = [...new Set([...Object.keys(a), ...Object.keys(d)])].sort()
  return campos
    .map((campo) => ({ campo, antes: emTexto(a[campo]), depois: emTexto(d[campo]) }))
    .filter((x) => x.antes !== x.depois)
}

/** Filtros da tela, lidos da URL e saneados (nada da URL vai cru para a consulta). */
export interface FiltroAuditoria {
  pessoa: string | null
  entidade: string | null
  acao: string | null
  de: string | null
  ate: string | null
  plataforma: boolean
  pagina: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOME = /^[a-z][a-z0-9_]{0,62}$/
const DIA = /^\d{4}-\d{2}-\d{2}$/

export function lerFiltroAuditoria(sp: Record<string, string | string[] | undefined>): FiltroAuditoria {
  const um = (k: string) => { const v = sp[k]; return typeof v === 'string' ? v : null }
  const pagina = Number(um('pagina') ?? '1')
  return {
    pessoa: UUID.test(um('pessoa') ?? '') ? um('pessoa') : null,
    entidade: NOME.test(um('entidade') ?? '') ? um('entidade') : null,
    acao: NOME.test(um('acao') ?? '') ? um('acao') : null,
    de: DIA.test(um('de') ?? '') ? um('de') : null,
    ate: DIA.test(um('ate') ?? '') ? um('ate') : null,
    plataforma: um('plataforma') === '1',
    pagina: Number.isInteger(pagina) && pagina >= 1 && pagina <= 1000 ? pagina : 1,
  }
}

export const POR_PAGINA = 50
