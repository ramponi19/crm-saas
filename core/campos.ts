/**
 * CAMPOS PERSONALIZADOS DE PARTIDA — os do core e o formato dos que vêm com um módulo.
 *
 * Campo personalizado é a linha de `campos_personalizados` que deixa gravar a chave
 * em `contatos.dados` (o gatilho `core_validar_dados` recusa chave sem campo ativo).
 * Até 05/11/2026 os do core só existiam nas empresas que passaram pela migração do
 * corte; empresa nova nascia sem eles, e a data de nascimento digitada no cadastro do
 * cliente sumia sem aviso. Agora o cadastro (`aplicarPreset`) garante os do core, e
 * instalar um módulo garante os dele (`aoInstalarModulo`).
 *
 * Campo do módulo leva `modulo_dono`: o card do lead e a ficha do cliente só o
 * mostram com o módulo ligado.
 */

export type TipoCampo = 'texto' | 'numero' | 'moeda' | 'data' | 'booleano' | 'opcao' | 'multi'

export interface CampoPadrao {
  entidade: 'contato' | 'negocio' | 'item'
  chave: string
  rotulo: string
  tipo: TipoCampo
  opcoes?: string[]
  ordem: number
}

/** O cadastro do cliente (lib/clientes.ts): dados do contrato, tipo e origem. */
export const CAMPOS_DO_CORE: CampoPadrao[] = [
  { entidade: 'contato', chave: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'data', ordem: 10 },
  { entidade: 'contato', chave: 'estado_civil', rotulo: 'Estado civil', tipo: 'texto', ordem: 20 },
  { entidade: 'contato', chave: 'profissao', rotulo: 'Profissão', tipo: 'texto', ordem: 30 },
  { entidade: 'contato', chave: 'nacionalidade', rotulo: 'Nacionalidade', tipo: 'texto', ordem: 40 },
  { entidade: 'contato', chave: 'tipo_cliente', rotulo: 'Tipo de cliente', tipo: 'opcao',
    opcoes: ['Novo', 'Ativo', 'VIP', 'Recorrente', 'Inativo'], ordem: 50 },
  // Texto, não opção: o varejo e a imobiliária usam listas diferentes ("Loja física" × "Portais").
  { entidade: 'contato', chave: 'origem_cliente', rotulo: 'Origem do cliente', tipo: 'texto', ordem: 60 },
]
