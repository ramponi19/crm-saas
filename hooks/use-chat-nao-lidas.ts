'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * QUANTAS MENSAGENS INTERNAS ESPERAM POR MIM.
 *
 * O chat interno sempre foi tempo real com a conversa ABERTA — o que faltava
 * era saber que chegou algo quando ela não está. Sem isso a mensagem caía no
 * vazio e só o F5 revelava, o que fazia o chat inteiro parecer parado
 * (relatado em 21/09/2026).
 *
 * A conta vem do banco (`chat_nao_lidas_por_conversa`), que compara cada
 * mensagem com o "lido até" da pessoa. Aqui só se escuta o realtime para
 * recontar — recontar em vez de somar na mão porque a mesma pessoa pode ter
 * duas abas abertas, e duas mãos no mesmo número é como ele derivava.
 *
 * `chat:lido` é o aviso entre componentes da MESMA aba: a leitura é gravada em
 * `chat_leituras`, que não é publicada no realtime, então a sidebar não teria
 * como saber que o chat acabou de zerar a conversa.
 */
export function useChatNaoLidas() {
  const [porConversa, setPorConversa] = useState<Record<string, number>>({})

  const recontar = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('chat_nao_lidas_por_conversa')
    if (error) return
    const mapa: Record<string, number> = {}
    for (const l of (data ?? []) as Array<{ conversa: string; nao_lidas: number }>) {
      mapa[l.conversa] = Number(l.nao_lidas)
    }
    setPorConversa(mapa)
  }, [])

  useEffect(() => {
    let vivo = true
    const supabase = createClient()

    // Nome com sufixo aleatório: dois componentes na mesma aba (sidebar e a
    // tela do chat) pedem o mesmo canal, e nome repetido faz um derrubar o
    // outro — o segundo a montar ficaria sem evento nenhum.
    const canal = supabase
      .channel(`chat_nao_lidas_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_internas' },
        () => { if (vivo) void recontar() })
      /**
       * A primeira contagem sai DEPOIS de a inscrição existir, não antes.
       *
       * Contar primeiro deixa uma fresta: mensagem que chega entre a consulta e
       * o `subscribe` não entra na conta nem gera evento, e o contador nasce
       * errado até a próxima mensagem. Contar aqui também tapa o reconecta
       * depois de queda de rede, que passa por SUBSCRIBED de novo.
       */
      .subscribe((status) => { if (status === 'SUBSCRIBED' && vivo) void recontar() })

    const aoLer = () => { if (vivo) void recontar() }
    window.addEventListener('chat:lido', aoLer)

    return () => {
      vivo = false
      window.removeEventListener('chat:lido', aoLer)
      void supabase.removeChannel(canal)
    }
  }, [recontar])

  const total = Object.values(porConversa).reduce((s, n) => s + n, 0)
  return { total, porConversa, recontar }
}

/** Marca a conversa como lida e avisa quem mostra contador na mesma tela. */
export async function marcarConversaLida(conversa: string) {
  const supabase = createClient()
  await supabase.rpc('chat_marcar_lido', { p_conversa: conversa })
  window.dispatchEvent(new CustomEvent('chat:lido'))
}
