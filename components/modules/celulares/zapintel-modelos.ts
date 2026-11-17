/**
 * O QUE O ZAPINTEL SABE DE CELULAR (17/11/2026, regra "o ramo só dentro do seu módulo").
 *
 * O ZapIntel é vendido a qualquer empresa; o vocabulário de loja de celular mora aqui, no
 * módulo de celular (Check IMEI), e só entra quando ele está ligado para a empresa
 * (lib/zapintel/produtos-da-ficha.ts). Até aqui estava escrito dentro de lib/zapintel/ficha.ts
 * e das telas do ZapIntel. Só dados e texto: servidor e navegador importam daqui.
 */

/**
 * Modelos que o cliente pode pedir: [o que procurar na fala dele, em minúsculas, como mostrar].
 * Em ordem do mais específico para o mais genérico: a ficha fica com o PRIMEIRO que aparece
 * ("iphone 17 pro max" contém "17 pro" e "iphone 17").
 */
export const MODELOS_CELULAR: [string, string][] = [
  ['17 pro max', 'iPhone 17 Pro Max'], ['17 pro', 'iPhone 17 Pro'], ['iphone 17', 'iPhone 17'],
  ['16 pro max', 'iPhone 16 Pro Max'], ['16 pro', 'iPhone 16 Pro'], ['iphone 16', 'iPhone 16'],
  ['15 pro max', 'iPhone 15 Pro Max'], ['15 pro', 'iPhone 15 Pro'], ['iphone 15', 'iPhone 15'],
  ['iphone 14', 'iPhone 14'], ['iphone 13', 'iPhone 13'], ['iphone 12', 'iPhone 12'],
  ['iphone 11', 'iPhone 11'], ['macbook', 'MacBook'], ['ipad', 'iPad'],
  ['apple watch', 'Apple Watch'], ['airpod', 'AirPods'], ['212 vip', 'Perfume 212 VIP'],
]

/** Como o cliente fala da troca na loja de celular, além do genérico ("troca", "dou o meu"). */
export const PALAVRAS_DE_TROCA_CELULAR = ['meu aparelho']

/** O que a ficha escreve quando o cliente quer dar o usado na troca. */
export const ROTULO_TROCA_CELULAR = 'com aparelho na troca'

/**
 * O painel ao vivo e a lista de leads mostram os modelos que a conta do banco extrai das
 * mensagens (o campo `modelos` do painel: "15 Pro Max", "16"…), que são modelos de iPhone.
 */
export const rotuloDoModeloPedido = (modelo: string) => `iPhone ${modelo}`
export const tituloDoModeloPedido = (modelo: string) => `Pediram iPhone ${modelo}`
export const filtroDoModeloPedido = (modelo: string) => `Pediu iPhone ${modelo}`
