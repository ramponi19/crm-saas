import type { BuyerProfile } from "@/types/zapintel";

export function inferProfile(leadText: string, _allText: string): BuyerProfile {
  const lt = leadText.toLowerCase();

  if (["urgente","preciso hoje","entrega hoje","amanhã","quando chega","mais rápido"].some(k => lt.includes(k)))
    return "Urgente";
  if (["caro","mais barato","mercado livre","shopee","desconto","abaixa","menor valor","concorrência"].some(k => lt.includes(k)))
    return "Sensível ao Preço";
  if (["minha esposa","meu marido","meu pai","minha mãe","patroa","preciso ver com","vou ver com"].some(k => lt.includes(k)))
    return "Dependente de Aprovação";
  if (["especificação","processador","memória","câmera","bateria","ios","chip","esim","saúde da bateria","porcentagem"].filter(k => lt.includes(k)).length >= 2)
    return "Analítico";
  if (["conheço","confio","vocês são bons","já comprei","cliente antigo","indicação"].some(k => lt.includes(k)))
    return "Decidido";

  return "Explorador";
}
