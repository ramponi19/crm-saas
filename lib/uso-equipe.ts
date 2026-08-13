import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessaoAcesso, ResumoUsuario } from '@/components/admin/uso-equipe'

type Embed<T> = T | T[] | null
const one = <T,>(r: Embed<T>): T | null => (Array.isArray(r) ? r[0] ?? null : r)

/**
 * Monta o "uso da equipe": sessões do período e resumo por pessoa.
 *
 * ATENÇÃO AO EMBED: o vínculo tem que ser nomeado pela constraint
 * (`usuarios!acessos_usuario_id_fkey`). Quando `acessos.usuario_id` apontava
 * para auth.users, o PostgREST não conseguia montar a junção e devolvia a
 * consulta INTEIRA vazia — a tela mostrava zero acesso com a tabela cheia, sem
 * erro nenhum na cara de quem olhava.
 */
export async function carregarUsoDaEquipe(
  db: SupabaseClient, empresaId: number, dias: number,
): Promise<{ sessoes: SessaoAcesso[]; resumo: ResumoUsuario[] }> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString()

  const [{ data: linhas }, { data: membros }] = await Promise.all([
    db.from('acessos')
      .select('id, usuario_id, entrada, ultimo_sinal, saida, fim_por, usuarios!acessos_usuario_id_fkey(nome)')
      .eq('empresa_id', empresaId).gte('entrada', desde)
      .order('entrada', { ascending: false }).limit(500),
    db.from('empresa_usuarios')
      .select('usuario_id, role, usuarios!empresa_usuarios_usuario_public_fkey(nome, ultimo_acesso)')
      .eq('empresa_id', empresaId).eq('ativo', true),
  ])

  type LinhaRow = {
    id: number; usuario_id: string; entrada: string; ultimo_sinal: string
    saida: string | null; fim_por: string | null; usuarios: Embed<{ nome: string | null }>
  }

  const sessoes: SessaoAcesso[] = ((linhas ?? []) as unknown as LinhaRow[]).map((l) => {
    // Sem saída explícita, o fim é o último sinal: a pessoa fechou a aba. Sem
    // isso a maioria das sessões ficaria "em aberto" e a duração seria inútil.
    const fim = l.saida ?? l.ultimo_sinal
    const aberta = !l.saida && Date.now() - new Date(l.ultimo_sinal).getTime() < 10 * 60_000
    return {
      id: l.id,
      usuario: one(l.usuarios)?.nome ?? '—',
      entrada: l.entrada,
      fim,
      minutos: Math.max(1, Math.round((new Date(fim).getTime() - new Date(l.entrada).getTime()) / 60000)),
      aberta,
      comoTerminou: aberta ? 'aberta'
        : l.fim_por === 'logout' ? 'saiu'
        : l.fim_por === 'inatividade' ? 'parou de usar'
        : 'fechou a aba',
    }
  })

  type MembroRow = { usuario_id: string; role: string | null; usuarios: Embed<{ nome: string | null; ultimo_acesso: string | null }> }
  const resumo: ResumoUsuario[] = ((membros ?? []) as unknown as MembroRow[]).map((m) => {
    const u = one(m.usuarios)
    const minhas = sessoes.filter((s) => s.usuario === (u?.nome ?? '—'))
    return {
      nome: u?.nome ?? '—',
      papel: m.role ?? '',
      ultimoAcesso: u?.ultimo_acesso ?? null,
      sessoes: minhas.length,
      minutos: minhas.reduce((soma, s) => soma + s.minutos, 0),
    }
  }).sort((a, b) => b.minutos - a.minutos)

  return { sessoes, resumo }
}
