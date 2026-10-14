import { NextResponse } from 'next/server'
import { zapintelEmpresa } from '@/lib/zapintel/ctx'
import { rastrDb } from '@/lib/rastreamento/db'
import { VERSAO_DO_PERFIL } from '@/lib/zapintel/perfil'
import { iaDoCrmLigada } from '@/lib/zapintel/ia'

/**
 * QUAIS FICHAS FICARAM PARA TRÁS — SEM PERGUNTAR NADA À IA.
 *
 * Pedido do Lucas em 14/10/2026: *"se nao toda vez que abrir o zapintel a ia
 * vai analisar tudo consumindo token sem precisar"*. A IA só escreve quando
 * alguém aperta o botão; esta rota é o que diz ONDE o botão faz falta.
 *
 * É uma consulta só (`zapintel_analises_pendentes`), que compara no banco os
 * três números guardados com cada ficha com os da conversa de agora. Nenhuma
 * mensagem atravessa a rede, e a função da Vercel quase não gasta CPU — o que
 * importa num plano em que o teto de CPU já foi assunto.
 *
 * A empresa vem da sessão, não da URL: a função do banco só é executável pelo
 * service role, e quem escolhe de que empresa ler é esta rota.
 */
export const dynamic = 'force-dynamic'

type Linha = {
  lead_id: number
  nome: string | null
  filial: string | null
  tem_ficha: boolean
  gerado_em: string | null
  mensagens_na_ficha: number | null
  mensagens_agora: number
  ultima: string
  loja_deve: boolean | null
}

export async function GET() {
  const { empresaId } = await zapintelEmpresa()

  const [{ data, error }, iaDisponivel] = await Promise.all([
    rastrDb().rpc('zapintel_analises_pendentes', { p_empresa: empresaId, p_versao: VERSAO_DO_PERFIL }),
    iaDoCrmLigada(),
  ])
  if (error) {
    console.error('zapintel/perfil/pendentes:', error.message)
    return NextResponse.json({ erro: 'Não consegui contar agora.' }, { status: 500 })
  }

  const linhas = ((data ?? []) as Linha[]).map((l) => ({
    leadId: Number(l.lead_id),
    nome: l.nome || 'Sem nome',
    filial: l.filial,
    temFicha: l.tem_ficha,
    geradoEm: l.gerado_em,
    // Pode ser negativo: mensagem apagada, ou lead mesclado. Quem lê a lista
    // só precisa saber que mudou; o número é o "quanto", quando faz sentido.
    novas: l.tem_ficha ? Math.max(0, l.mensagens_agora - (l.mensagens_na_ficha ?? 0)) : l.mensagens_agora,
    ultima: l.ultima,
    lojaDeve: !!l.loja_deve,
  }))
  // Quem está esperando a loja primeiro; depois, a conversa mais recente.
  linhas.sort((a, b) => (Number(b.lojaDeve) - Number(a.lojaDeve)) || (a.ultima < b.ultima ? 1 : -1))

  return NextResponse.json({
    desatualizadas: linhas.filter((l) => l.temFicha),
    semAnalise: linhas.filter((l) => !l.temFicha),
    iaDisponivel,
  })
}
