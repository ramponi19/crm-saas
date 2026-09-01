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

/**
 * `usuario_id` → instante do último pulso, das sessões ainda abertas.
 *
 * Devolve o CARIMBO, não só quem está dentro da janela, porque a tela precisa
 * conseguir apagar a bolinha sozinha: fechar a aba não escreve nada no banco,
 * então nenhum evento vai chegar avisando que a pessoa saiu — só o relógio
 * revela. Com o carimbo em mãos, o navegador recalcula sem pedir nada a
 * ninguém.
 */
export async function sinaisDePresenca(
  supabase: Client,
  empresaId: number,
): Promise<Record<string, string>> {
  const corte = new Date(Date.now() - JANELA_ONLINE_MIN * 60_000).toISOString()

  const { data, error } = await supabase
    .from('acessos')
    .select('usuario_id, ultimo_sinal')
    .eq('empresa_id', empresaId)
    // Sessão ainda aberta: quem saiu pelo botão já tem `saida` preenchida.
    .is('saida', null)
    .gt('ultimo_sinal', corte)

  // Falhar aqui não pode derrubar a tela de Equipe: sem presença, a coluna volta
  // a mostrar só o último acesso, que é o comportamento de antes.
  if (error) return {}

  const sinais: Record<string, string> = {}
  for (const linha of (data ?? []) as Array<{ usuario_id: string | null; ultimo_sinal: string | null }>) {
    if (!linha.usuario_id || !linha.ultimo_sinal) continue
    // A pessoa pode ter mais de uma sessão aberta (dois aparelhos): vale a mais
    // recente, senão um pulso velho de outro dispositivo a marcaria offline.
    const atual = sinais[linha.usuario_id]
    if (!atual || linha.ultimo_sinal > atual) sinais[linha.usuario_id] = linha.ultimo_sinal
  }
  return sinais
}

/** Ids de quem está online agora — a leitura já filtrada pela janela. */
export async function usuariosOnline(supabase: Client, empresaId: number): Promise<string[]> {
  return Object.keys(await sinaisDePresenca(supabase, empresaId))
}
