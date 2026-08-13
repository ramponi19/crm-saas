/**
 * O que o cadastro do cliente precisa ter para o contrato sair completo.
 *
 * POR QUE ISTO EXISTE: os três clientes cadastrados na JM tinham nome e telefone
 * e mais nada — nenhum CPF, endereço ou cidade. O contrato então imprimia com os
 * espaços em branco, porque marcador sem valor vira vazio e ninguém avisa. Um
 * contrato de compra e venda sem CPF e sem endereço do comprador não identifica
 * as partes: o papel sai bonito e não serve.
 *
 * A lista é a mesma que o modelo de contrato usa nos marcadores `{{cliente.*}}`.
 * E-mail e complemento ficam FORA de propósito: muita gente não tem e-mail para
 * dar, e complemento nem sempre existe — obrigar o vendedor a inventar dado é
 * pior do que deixar o campo vazio.
 */
export interface ClienteParaContrato {
  nome?: string | null
  cpf_cnpj?: string | null
  telefone?: string | null
  estado_civil?: string | null
  profissao?: string | null
  cep?: string | null
  endereco?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
}

export const CAMPOS_CONTRATO: { chave: keyof ClienteParaContrato; label: string }[] = [
  { chave: 'nome',         label: 'Nome completo' },
  { chave: 'cpf_cnpj',     label: 'CPF / CNPJ' },
  { chave: 'telefone',     label: 'Telefone' },
  { chave: 'estado_civil', label: 'Estado civil' },
  { chave: 'profissao',    label: 'Profissão' },
  { chave: 'cep',          label: 'CEP' },
  { chave: 'endereco',     label: 'Endereço' },
  { chave: 'numero',       label: 'Número' },
  { chave: 'bairro',       label: 'Bairro' },
  { chave: 'cidade',       label: 'Cidade' },
  { chave: 'estado',       label: 'Estado (UF)' },
]

/** Rótulos do que falta — vazio quando o cadastro está pronto para o contrato. */
export function camposFaltantesContrato(c: ClienteParaContrato): string[] {
  return CAMPOS_CONTRATO
    .filter(({ chave }) => !String(c[chave] ?? '').trim())
    .map(({ label }) => label)
}
