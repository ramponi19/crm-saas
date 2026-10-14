/**
 * Filial: a segunda loja da mesma empresa.
 *
 * A JM abriu loja em outra cidade. O sistema tinha UM eixo de isolamento
 * (`empresa_id`) e nenhuma noção de loja. Criar uma segunda EMPRESA custaria duas
 * assinaturas, catálogo duplicado e nenhuma visão consolidada — então filial é uma
 * DIMENSÃO dentro da empresa: uma assinatura, um login, o dono vendo a rede e cada
 * loja separadamente.
 *
 * QUEM SEPARA É O BANCO, não este módulo. A regra vive na RLS (`filiais_visiveis()`)
 * porque `empresa_id` aparece 578 vezes em 160 arquivos: filtrar loja à mão nas
 * consultas vazaria exatamente onde alguém esquecesse, e o sintoma seria a loja A
 * vendo o cliente da loja B — sem erro nenhum na tela. Aqui ficam só os tipos e as
 * perguntas que tela e servidor fazem, para as duas pontas responderem igual.
 */

export interface Filial {
  id: number
  nome: string
  matriz: boolean
  ativo: boolean
  cnpj: string | null
  telefone: string | null
  email: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  representante_nome: string | null
  representante_cpf: string | null
}

/** Campos que a tela edita. `matriz` e `ativo` têm ação própria, não entram no form. */
export type FilialForm = Omit<Filial, 'id' | 'matriz' | 'ativo'>

export const CAMPOS_FILIAL: (keyof FilialForm)[] = [
  'nome', 'cnpj', 'telefone', 'email',
  'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado',
  'representante_nome', 'representante_cpf',
]

/**
 * A separação só existe com DUAS lojas ativas.
 *
 * É o que torna esta mudança inerte: enquanto o dono não cadastrar a segunda loja,
 * nenhuma tela muda de comportamento para ninguém. A função no banco decide o
 * mesmo, com a mesma conta — aqui é para a tela poder explicar em vez de só agir.
 */
export function separacaoAtiva(filiais: Pick<Filial, 'ativo'>[]): boolean {
  return filiais.filter((f) => f.ativo).length >= 2
}

/** Como a loja aparece no seletor e nos registros: nome, e a cidade quando ajuda. */
export function rotuloDaFilial(f: Pick<Filial, 'nome' | 'cidade'>): string {
  const cidade = f.cidade?.trim()
  return cidade && !f.nome.toLowerCase().includes(cidade.toLowerCase())
    ? `${f.nome} · ${cidade}`
    : f.nome
}

