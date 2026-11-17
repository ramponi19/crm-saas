import { SecaoConfiguracoes } from '@/components/modules/configuracoes/secao-configuracoes'
import { moduloPorChave } from '@/core/modulos'

// O nome vem do manifesto: a seção é do módulo Cardápio (abasConfiguracoes) e só existe com ele ligado.
const NOME = moduloPorChave('cardapio')?.nome ?? ''

export const metadata = { title: NOME }

export default function Page() {
  return <SecaoConfiguracoes aba="cardapio" titulo={NOME} />
}
