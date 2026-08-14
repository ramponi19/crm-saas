import type { Segmento } from './segmentos'

/**
 * Motivos de perda que cada segmento recebe ao nascer.
 *
 * POR QUE ISTO EXISTE: marcar lead como perdido EXIGE motivo (é o que mantém o
 * relatório de perdas confiável). Só que empresa nova nascia sem nenhum motivo
 * cadastrado — o vendedor arrastava o card para "Perdido", o modal abria dizendo
 * "nenhum motivo cadastrado, configure em Configurações" e a ação morria ali. O
 * campo obrigatório sem opção nenhuma é uma porta trancada.
 *
 * SÃO PONTO DE PARTIDA, não regra: a loja edita, renomeia e acrescenta os seus em
 * Configurações → Motivos de perda. O que importa é que no primeiro dia exista
 * algo para escolher.
 *
 * Os motivos são os que aparecem de verdade no balcão — "achou caro", "não tinha
 * o modelo", "sumiu" —, escritos como o vendedor fala, não como um relatório
 * gostaria de ler.
 */
export const MOTIVOS_POR_SEGMENTO: Record<string, string[]> = {
  varejo: [
    'Preço / achou caro',
    'Condição de pagamento',
    'Sem estoque / não tinha o modelo',
    'Comprou com concorrente',
    'Sumiu / não respondeu',
    'Desistiu da compra',
  ],
  assistencia: [
    'Orçamento acima do esperado',
    'Preferiu comprar outro aparelho',
    'Prazo de reparo longo',
    'Consertou em outro lugar',
    'Sumiu / não respondeu',
    'Desistiu do reparo',
  ],
  imobiliaria: [
    'Crédito negado',
    'Achou o valor alto',
    'Não gostou do imóvel',
    'Comprou/alugou com outra imobiliária',
    'Sumiu / não respondeu',
    'Desistiu por agora',
  ],
  concessionaria: [
    'Financiamento negado',
    'Achou o valor alto',
    'Avaliação do usado abaixo do esperado',
    'Comprou em outra loja',
    'Sumiu / não respondeu',
    'Desistiu da troca',
  ],
  food: [
    'Preço',
    'Demora no atendimento',
    'Item indisponível',
    'Pediu em outro lugar',
    'Não respondeu',
    'Desistiu',
  ],
  servicos: [
    'Preço',
    'Prazo não atendia',
    'Fechou com outro prestador',
    'Escopo não era o esperado',
    'Sumiu / não respondeu',
    'Desistiu do serviço',
  ],
  saude: [
    'Valor da consulta',
    'Não tinha convênio',
    'Horário não atendia',
    'Foi para outra clínica',
    'Não respondeu',
    'Desistiu do tratamento',
  ],
}

/** Lista do segmento, caindo no varejo quando o segmento não tem a sua. */
export function motivosDoSegmento(segmento: Segmento | string | null | undefined): string[] {
  const chave = (segmento ?? '').trim().toLowerCase()
  return MOTIVOS_POR_SEGMENTO[chave] ?? MOTIVOS_POR_SEGMENTO.varejo
}
