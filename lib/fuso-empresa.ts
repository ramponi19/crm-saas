import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FUSO_PADRAO, fusoOuPadrao, fusoValido } from '@/lib/datas'

/**
 * O FUSO DA EMPRESA (10/11/2026).
 *
 * Mora em `configuracoes_sistema`, chave `fuso`, valor `{ "fuso": "America/Manaus" }`
 * — a mesma tabela de `horario_comercial` e `sla_atendimento`, sem coluna nova. Sem a
 * linha (todas as empresas de hoje), vale `FUSO_PADRAO` (Brasília). No banco, a mesma
 * regra está em `public.empresa_fuso(p_empresa)`, que as funções de relatório usam.
 *
 * Uma leitura por requisição e empresa (`cache` do React): o layout, a página e os
 * componentes de servidor da mesma tela pedem o fuso sem repetir a consulta.
 */
export const CHAVE_FUSO = 'fuso'

/** Lê o fuso salvo em `configuracoes_sistema.valor` (objeto `{ fuso }` ou texto). */
export function fusoDoValor(valor: unknown): string {
  const bruto = typeof valor === 'string' ? valor : (valor as { fuso?: unknown } | null)?.fuso
  return fusoOuPadrao(typeof bruto === 'string' ? bruto : null)
}

const lerFuso = cache(async (db: SupabaseClient, empresaId: number): Promise<string> => {
  const { data, error } = await db.from('configuracoes_sistema')
    .select('valor').eq('empresa_id', empresaId).eq('chave', CHAVE_FUSO).maybeSingle()
  // Falha de leitura não derruba a tela: o fuso padrão é o de todas as lojas de hoje.
  if (error) return FUSO_PADRAO
  return fusoDoValor((data as { valor?: unknown } | null)?.valor ?? null)
})

/** O fuso da empresa (padrão Brasília). Empresa nula → padrão, sem consulta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fusoDaEmpresa(db: SupabaseClient<any>, empresaId: number | null | undefined): Promise<string> {
  if (!empresaId) return FUSO_PADRAO
  return lerFuso(db as SupabaseClient, empresaId)
}

/** Valor a gravar em `configuracoes_sistema` para o fuso escolhido (nulo = inválido). */
export function valorDoFuso(fuso: unknown): { fuso: string } | null {
  return fusoValido(fuso) ? { fuso } : null
}
