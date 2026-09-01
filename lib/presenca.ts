import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

/**
 * Quem está no CRM AGORA.
 *
 * A verdade vem da tabela `acessos`, que já existia para o relatório de uso, e
 * não de `usuarios.ultimo_acesso`. A diferença importa num caso: quem clica em
 * "Sair" tem a `saida` gravada e sai da lista na hora, enquanto o carimbo de
 * último acesso continuaria dizendo "há 2 minutos" por mais dez.
 *
 * ⚠️ A JANELA NÃO É ESCOLHA ESTÉTICA. `session-guard.tsx` bate o pulso a cada
 * CINCO minutos, e só com a aba visível e alguém tendo interagido nos últimos
 * quinze. Uma janela de 5 minutos marcaria offline todo mundo que respirou
 * fundo entre dois pulsos; 10 tolera exatamente um pulso perdido, que é o
 * bastante para não piscar, e é curta o suficiente para "online" significar
 * algo. Se o intervalo do pulso mudar, esta janela muda junto.
 */
export const JANELA_ONLINE_MIN = 10

/** Ids de quem está online na empresa. Vazio quando não há ninguém. */
export async function usuariosOnline(supabase: Client, empresaId: number): Promise<string[]> {
  const corte = new Date(Date.now() - JANELA_ONLINE_MIN * 60_000).toISOString()

  const { data, error } = await supabase
    .from('acessos')
    .select('usuario_id')
    .eq('empresa_id', empresaId)
    // Sessão ainda aberta: quem saiu pelo botão já tem `saida` preenchida.
    .is('saida', null)
    .gt('ultimo_sinal', corte)

  // Falhar aqui não pode derrubar a tela de Equipe: sem presença, a coluna volta
  // a mostrar só o último acesso, que é o comportamento de antes.
  if (error) return []

  const ids = (data ?? []).map((a) => (a as { usuario_id: string | null }).usuario_id)
  return [...new Set(ids.filter((id): id is string => !!id))]
}
