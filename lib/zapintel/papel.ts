/**
 * COMO CHAMAR QUEM ATENDE, PELO SEGMENTO DA EMPRESA NO CRM.
 *
 * Era tudo o que sobrava em uso de `lib/zapintel/segments/segments.ts` (480
 * linhas, apagado em 15/10/2026): o resto eram as listas de palavras do motor
 * de agosto ("pix", "18x", "lacrado"…) e um "contexto do negócio" com a JM
 * escrita dentro ("Vendedor de iPhones seminovos e perfumes importados"). E o
 * mapa antigo mandava `varejo` para "loja de moda", então a JM era chamada de
 * "Atendente". Aqui o segmento do CRM vai direto para o papel.
 */
const PAPEL: Record<string, string> = {
  varejo: 'Vendedor',
  concessionaria: 'Vendedor',
  imobiliaria: 'Corretor',
  assistencia: 'Atendente',
  servicos: 'Consultor',
  saude: 'Recepcionista',
  food: 'Atendente',
}

export function papelDoSegmento(segmento: string | null | undefined): string {
  return (segmento && PAPEL[segmento]) || 'Vendedor'
}
