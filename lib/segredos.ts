/**
 * Campos de configuração que são segredo (token, secret, key, senha) não saem
 * para o navegador: a tela recebe só a lista dos que estão preenchidos e mostra
 * "configurado". Ao salvar, campo secreto deixado em branco mantém o valor que
 * já estava no banco.
 */
export const CAMPO_SECRETO = /token|secret|key|senha|password/i

type Obj = Record<string, unknown>
const ehObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Cópia sem os campos secretos + nomes dos secretos que têm valor. */
export function semSegredos<T>(valor: T): { valor: T; configurados: string[] } {
  if (!ehObj(valor)) return { valor, configurados: [] }
  const limpo: Obj = {}
  const configurados: string[] = []
  for (const [k, v] of Object.entries(valor)) {
    if (CAMPO_SECRETO.test(k)) {
      if (v !== null && v !== undefined && v !== '') configurados.push(k)
    } else {
      limpo[k] = v
    }
  }
  return { valor: limpo as T, configurados }
}

/** Valor a gravar: segredo em branco no novo herda o do antigo. */
export function mesclarSegredos(novo: Obj, antigo: unknown): Obj {
  if (!ehObj(antigo)) return novo
  const saida: Obj = { ...novo }
  for (const [k, v] of Object.entries(antigo)) {
    if (CAMPO_SECRETO.test(k) && (saida[k] === undefined || saida[k] === null || saida[k] === '')) saida[k] = v
  }
  return saida
}
