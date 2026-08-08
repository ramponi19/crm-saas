import React from 'react'

/**
 * Formatação de texto do WhatsApp/Instagram dentro da bolha do chat.
 *
 *   *negrito*   _itálico_   ~riscado~   ```mono```
 *
 * O CRM mostrava os marcadores CRUS: o cliente recebia "teste" em negrito e o
 * atendente lia `*_teste_*` na tela. Como a assinatura do atendente sai em
 * negrito-itálico, sem isto toda mensagem enviada apareceria suja no histórico.
 *
 * Devolve nós React — nunca HTML por string. O texto vem do cliente, e montar
 * HTML com ele abriria injeção na tela de quem atende.
 */

type Marca = { abre: string; tag: 'b' | 'i' | 's' | 'code' }

// Ordem importa: ``` antes de ` para o bloco de código não ser lido como um
// marcador solto.
const MARCAS: Marca[] = [
  { abre: '```', tag: 'code' },
  { abre: '*', tag: 'b' },
  { abre: '_', tag: 'i' },
  { abre: '~', tag: 's' },
]

const CLASSE: Record<Marca['tag'], string> = {
  b: 'font-semibold',
  i: 'italic',
  s: 'line-through',
  code: 'font-mono text-[0.92em]',
}

/**
 * Um passe recursivo: acha o primeiro par de marcadores, formata o miolo (que
 * pode ter outro marcador dentro — é assim que `*_x_*` vira negrito+itálico) e
 * segue no resto.
 */
export function formatarTextoChat(texto: string, chave = 0): React.ReactNode[] {
  if (!texto) return []

  for (const { abre, tag } of MARCAS) {
    const ini = texto.indexOf(abre)
    if (ini < 0) continue
    const fim = texto.indexOf(abre, ini + abre.length)
    // Marcador sozinho não formata nada: "5 * 3" e "hora_final" continuam como
    // o cliente escreveu, em vez de comer metade da frase.
    if (fim < 0) continue
    const miolo = texto.slice(ini + abre.length, fim)
    if (!miolo.trim()) continue

    const antes = texto.slice(0, ini)
    const depois = texto.slice(fim + abre.length)
    const Tag = tag === 'code' ? 'code' : tag === 'b' ? 'strong' : tag === 'i' ? 'em' : 'del'

    return [
      ...formatarTextoChat(antes, chave + 1),
      <Tag key={`${chave}-${ini}`} className={CLASSE[tag]}>{formatarTextoChat(miolo, chave + 1)}</Tag>,
      ...formatarTextoChat(depois, chave + 2),
    ]
  }

  return [texto]
}
