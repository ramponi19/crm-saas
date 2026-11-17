/**
 * A SITUAÇÃO DA ASSINATURA DA EMPRESA, para o aviso do topo (17/11/2026, "pronto para vender").
 *
 *   somente_leitura  status ≠ 'ativo' (teste vencido, assinatura encerrada ou suspensa pelo superadmin):
 *                    vê tudo, não cria, não edita, não envia; o recebimento de mensagens continua.
 *                    Nunca se apaga dado do cliente.
 *   atrasado         stripe_status 'past_due': o Stripe ainda tenta cobrar; a empresa segue ativa.
 *   teste_acabando   o teste termina em até 3 dias e não há assinatura ativa.
 *   ok               nada a avisar.
 *
 * Pura (sem banco): quem chama lê a linha de `empresas` e o instante de agora.
 */
export interface EmpresaSituacao {
  status: string | null
  stripe_status: string | null
  trial_ends_at: string | null
  demo?: boolean | null
}

export type Situacao =
  | { tipo: 'ok' }
  | { tipo: 'somente_leitura'; motivo: 'teste_vencido' | 'assinatura' | 'suspensa' }
  | { tipo: 'atrasado' }
  | { tipo: 'teste_acabando'; dias: number }

const DIA_MS = 86_400_000
export const DIAS_DE_AVISO_DO_TESTE = 3

export function situacaoDaEmpresa(e: EmpresaSituacao | null | undefined, agora: Date): Situacao {
  if (!e || e.demo) return { tipo: 'ok' }
  const fimTeste = e.trial_ends_at ? new Date(e.trial_ends_at).getTime() : null
  if (e.status && e.status !== 'ativo') {
    const motivo = fimTeste != null && fimTeste <= agora.getTime() && e.stripe_status !== 'canceled' && e.stripe_status !== 'unpaid'
      ? 'teste_vencido'
      : e.stripe_status === 'canceled' || e.stripe_status === 'unpaid' || e.stripe_status === 'incomplete_expired' ? 'assinatura' : 'suspensa'
    return { tipo: 'somente_leitura', motivo }
  }
  if (e.stripe_status === 'past_due') return { tipo: 'atrasado' }
  if (fimTeste != null && e.stripe_status !== 'active') {
    const resta = fimTeste - agora.getTime()
    if (resta > 0 && resta <= DIAS_DE_AVISO_DO_TESTE * DIA_MS) return { tipo: 'teste_acabando', dias: Math.max(1, Math.ceil(resta / DIA_MS)) }
  }
  return { tipo: 'ok' }
}

/** O texto do aviso (título e corpo), ou null quando não há o que avisar. */
export function textoDaSituacao(s: Situacao): { titulo: string; corpo: string; tom: 'erro' | 'aviso' } | null {
  switch (s.tipo) {
    case 'ok': return null
    case 'teste_acabando':
      return { tom: 'aviso', titulo: s.dias === 1 ? 'Seu teste termina amanhã' : `Seu teste termina em ${s.dias} dias`,
        corpo: 'Escolha um plano para continuar usando sem interrupção. Nada do que você cadastrou se perde.' }
    case 'atrasado':
      return { tom: 'aviso', titulo: 'Pagamento atrasado',
        corpo: 'Não conseguimos cobrar a assinatura. Atualize a forma de pagamento para não entrar em modo somente leitura.' }
    case 'somente_leitura':
      return { tom: 'erro', titulo: 'Modo somente leitura',
        corpo: (s.motivo === 'teste_vencido' ? 'O teste terminou. ' : s.motivo === 'assinatura' ? 'A assinatura foi encerrada. ' : 'A conta está suspensa. ')
          + 'Você vê tudo, mas não cria, não edita e não envia mensagens — as mensagens dos clientes continuam chegando. Nenhum dado foi apagado.' }
  }
}
