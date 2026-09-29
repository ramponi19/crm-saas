'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * DIZ AO SENTRY QUEM ESTÁ NA TELA.
 *
 * ══ POR QUE ISTO EXISTE (29/09/2026) ═══════════════════════════════════════
 *
 * Todo erro chegava com "0 usuários impactados" — não porque ninguém foi
 * atingido, mas porque o Sentry não fazia ideia de quem era. Para descobrir de
 * quem era um erro em `/leads`, tive de cruzar o horário com a tabela de
 * acessos e mesmo assim fiquei sem resposta: duas pessoas diferentes estavam
 * logadas nos dois eventos, e as sessões encerram por inatividade, então
 * "estava logado" não prova "estava na tela".
 *
 * Com isto, o próximo erro já vem com nome e papel. Vale para qualquer bug —
 * não só o que motivou a mudança.
 *
 * ══ O QUE VAI, E O QUE NÃO VAI ═════════════════════════════════════════════
 *
 * Vai o necessário para eu achar a pessoa e falar com ela: id, nome, papel e
 * empresa. NÃO vai e-mail, telefone nem nada do cliente final — o CRM guarda
 * conversa, CPF e contrato, e `sendDefaultPii: false` em `lib/sentry-comum`
 * existe exatamente para esse conteúdo não sair da máquina. Identificar o
 * FUNCIONÁRIO que viu o erro é outra coisa, e é o mínimo para o relatório ter
 * utilidade.
 */
export function SentryUsuario({ id, nome, papel, empresa }: {
  id: string
  nome: string
  papel: string
  empresa?: string
}) {
  useEffect(() => {
    Sentry.setUser({ id, username: nome })
    Sentry.setTag('papel', papel)
    if (empresa) Sentry.setTag('empresa', empresa)
    // Ao sair, o próximo dono da aba não herda a identidade de quem saiu.
    return () => { Sentry.setUser(null) }
  }, [id, nome, papel, empresa])

  return null
}
