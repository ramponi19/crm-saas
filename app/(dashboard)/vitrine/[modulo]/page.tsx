import { VitrineDoModulo } from '@/components/modulos/vitrine-do-modulo'

export const metadata = { title: 'Módulo desligado' }

/**
 * Destino do REWRITE do proxy quando o módulo está desligado: quem abre /agenda
 * vê esta tela com /agenda na barra (etapa 0, 2.5). Aberta direto, mostra a
 * mesma vitrine — não há nada aqui que a loja não pudesse ver.
 */
export default async function VitrinePage({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params
  return <VitrineDoModulo href={`/${modulo}`} />
}
