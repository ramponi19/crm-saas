/**
 * O QUE A EMPRESA FAZ, EM UMA FRASE, PARA O PROMPT DO ASSISTENTE.
 *
 * O mesmo mapa morava duas vezes — no assistente de ajuda (app/api/assistente)
 * e no chat com dados (chat-dados.ts) —, cada um chaveado pelo preset de
 * onboarding da empresa. Ficou um só (29/10/2026). Preset desconhecido devolve
 * null e cada prompt mantém o seu texto genérico.
 */
const NEGOCIO_DO_PRESET: Record<string, string> = {
  varejo: 'loja de varejo/celulares (PDV, estoque, produtos, garantia, assistência, orçamentos)',
  assistencia: 'assistência técnica (ordens de serviço, garantia, orçamentos)',
  servicos: 'prestador de serviços',
  imobiliaria: 'imobiliária (imóveis, proprietários, chaves, visitas na Agenda)',
  saude: 'clínica/saúde (agendamento de consultas na Agenda)',
  food: 'restaurante/food (cardápio, cozinha/KDS)',
  concessionaria: 'loja de veículos (avaliações, consulta FIPE, financiamento)',
}

export function negocioDoPreset(preset: string | null | undefined): string | null {
  return NEGOCIO_DO_PRESET[preset ?? ''] ?? null
}
