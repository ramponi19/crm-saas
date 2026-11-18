/**
 * QUEM PAGA E QUANTO (17/11/2026) — uma regra só para o painel e as métricas do superadmin.
 *
 *   em teste   o teste ainda corre (`trial_ends_at` no futuro) e não há assinatura ativa;
 *   pagante    status 'ativo', fora do teste, não é de demonstração nem cortesia, plano com preço;
 *   só leitura status ≠ 'ativo' (teste vencido, assinatura encerrada, suspensa) — não conta receita.
 *
 * O preço é o de `planos_config.preco_centavos` (o mesmo que a vitrine e o checkout mostram). O
 * `stripe_status` sozinho não diz "em teste": 'trialing' é o valor padrão da coluna e está em empresa
 * sem Stripe nenhum (a JM, por contrato).
 */
export interface EmpresaFaturamento {
  plano: string | null
  status: string | null
  stripe_status?: string | null
  trial_ends_at?: string | null
  demo?: boolean | null
  /** Não paga por acordo (a JM, 18/11/2026): fica fora do faturamento. */
  cortesia?: boolean | null
}

export function emTeste(e: EmpresaFaturamento, agora: Date): boolean {
  if (!e.trial_ends_at || e.stripe_status === 'active') return false
  return new Date(e.trial_ends_at).getTime() > agora.getTime()
}

export function pagante(e: EmpresaFaturamento, agora: Date, precoPorPlano: Record<string, number>): boolean {
  return e.status === 'ativo' && !e.demo && !e.cortesia && !emTeste(e, agora) && (precoPorPlano[e.plano ?? ''] ?? 0) > 0
}

/** Preço mensal em reais por plano, de `planos_config` (id, preco_centavos). */
export function precosDosPlanos(planos: Array<{ id: string; preco_centavos: number | null }> | null | undefined): Record<string, number> {
  return Object.fromEntries((planos ?? []).map((p) => [p.id, (p.preco_centavos ?? 0) / 100]))
}

/** Faturamento mensal estimado: soma do preço do plano de cada empresa pagante. */
export function faturamentoEstimado(empresas: EmpresaFaturamento[], agora: Date, precoPorPlano: Record<string, number>): number {
  return empresas.filter((e) => pagante(e, agora, precoPorPlano)).reduce((s, e) => s + (precoPorPlano[e.plano ?? ''] ?? 0), 0)
}
