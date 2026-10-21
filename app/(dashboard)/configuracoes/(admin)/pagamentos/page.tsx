import { SecaoConfiguracoes } from '@/components/modules/configuracoes/secao-configuracoes'

export const metadata = { title: 'Meios de pagamento' }

export default function Page() {
  return <SecaoConfiguracoes aba="pagamentos" titulo="Meios de pagamento" />
}
