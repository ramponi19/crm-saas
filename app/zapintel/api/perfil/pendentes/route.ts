import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { zapintelAcesso, lojaVisivel } from '@/lib/zapintel/ctx'
import { buscarTudo } from '@/lib/zapintel/conversas'
import { rastrDb } from '@/lib/rastreamento/db'
import { VERSAO_DO_PERFIL } from '@/lib/zapintel/perfil'
import { iaDoCrmLigada } from '@/lib/zapintel/ia'
import { lerCachePendentes, gravarCachePendentes } from '@/lib/zapintel/cache-pendentes'

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
 *
 * ══ FALHA NÃO É "EM DIA" (17/10/2026) ══════════════════════════════════════
 *
 * Antes, um erro na consulta de `leads` era tratado como lista vazia, e o robô
 * dizia "Análises de IA em dia" — falso. E a função do banco já estourou o
 * tempo (grupo de erro da Vercel desde 14/10): ela relê todas as mensagens da
 * empresa a cada chamada (inventário de 17/10, D1 e D2). Agora qualquer falha
 * responde 200 com `indisponivel: true` e o motivo vai para o log JSON
 * (`zapintel.pendentes.falha`) e para o Sentry (`modulo=zapintel`). A tela diz
 * "Não foi possível verificar as análises pendentes", nunca "em dia".
 *
 * ══ CACHE DE 60 s ═════════════════════════════════════════════════════════
 *
 * O robô reconta a cada abertura do chat. Por empresa + lojas visíveis, a
 * resposta fica 60 s na memória da instância (`zapintel.pendentes.cache` no
 * log quando serve dela). Falha não entra no cache. `?atualizar=1` pula o cache
 * — é o que o robô usa ao terminar um lote, para não mostrar a fila antiga.
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

type Pendente = {
  leadId: number; nome: string; filial: string | null; temFicha: boolean
  geradoEm: string | null; novas: number; ultima: string; lojaDeve: boolean
}
type Resposta = { desatualizadas: Pendente[]; semAnalise: Pendente[]; iaDisponivel: boolean; indisponivel: false }

class FalhaDePendentes extends Error {
  motivo: 'timeout' | 'erro_rpc' | 'erro_leads'
  constructor(motivo: 'timeout' | 'erro_rpc' | 'erro_leads', mensagem: string) { super(mensagem); this.motivo = motivo }
}

function falhou(e: unknown, empresaId: number, userId: string) {
  const f = e instanceof FalhaDePendentes ? e : new FalhaDePendentes('erro_rpc', e instanceof Error ? e.message : String(e))
  console.error(JSON.stringify({ evento: 'zapintel.pendentes.falha', motivo: f.motivo, empresa_id: empresaId, user_id: userId, erro: f.message }))
  if (typeof Sentry.captureException === 'function') {
    Sentry.captureException(f, { tags: { modulo: 'zapintel', rota: 'perfil/pendentes', motivo: f.motivo, empresa_id: String(empresaId) } })
  }
  return NextResponse.json({ indisponivel: true, motivo: f.motivo, desatualizadas: [], semAnalise: [], iaDisponivel: false })
}

export async function GET(req: Request) {
  const acesso = await zapintelAcesso()
  if (!acesso) {
    return NextResponse.json({ erro: 'Sem acesso ao ZapIntel (só dono, admin ou empresa com o complemento ativo).' }, { status: 403 })
  }
  const { empresaId, userId } = acesso
  const chave = `${empresaId}:${[...acesso.lojas].sort((a, b) => a - b).join(',')}`
  const pular = new URL(req.url).searchParams.get('atualizar') === '1'
  const guardado = pular ? null : lerCachePendentes<Resposta>(chave)
  if (guardado) {
    console.log(JSON.stringify({ evento: 'zapintel.pendentes.cache', empresa_id: empresaId, idade_ms: guardado.idadeMs }))
    return NextResponse.json(guardado.resposta)
  }

  const db = rastrDb()
  try {
    // Paginado e em ordem: a API devolve no máximo 1.000 linhas por chamada e
    // corta calada. Hoje a fila tem dezenas, mas na próxima troca de
    // VERSAO_DO_PERFIL todas as ~1.800 fichas ficam pendentes de uma vez — e o
    // robô diria "1.000", escondendo o resto.
    const [data, iaDisponivel] = await Promise.all([
      buscarTudo<Linha>((de, ate) =>
        db.rpc('zapintel_analises_pendentes', { p_empresa: empresaId, p_versao: VERSAO_DO_PERFIL })
          .order('lead_id').range(de, ate)),
      iaDoCrmLigada(),
    ]).catch((e: Error) => {
      throw new FalhaDePendentes(/statement timeout|canceling statement|57014/i.test(e.message) ? 'timeout' : 'erro_rpc', e.message)
    })

    // Vendedor só vê as lojas dele — a mesma regra das telas (`zapintelAcesso`).
    let visiveis: Set<number> | null = null
    if (data.length) {
      const ids = data.map((l) => Number(l.lead_id))
      const lojas = new Map<number, number | null>()
      for (let i = 0; i < ids.length; i += 500) {
        const { data: ls, error } = await db.from('leads').select('id, filial_id')
          .eq('empresa_id', empresaId).in('id', ids.slice(i, i + 500))
        // Erro aqui NÃO é "nenhum visível": era isso que fazia o robô dizer "em dia".
        if (error) throw new FalhaDePendentes('erro_leads', error.message)
        for (const l of ls ?? []) lojas.set(Number(l.id), l.filial_id as number | null)
      }
      visiveis = new Set(ids.filter((id) => lojas.has(id) && lojaVisivel(acesso, lojas.get(id))))
    }

    const linhas: Pendente[] = data.filter((l) => visiveis?.has(Number(l.lead_id))).map((l) => ({
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

    const resposta: Resposta = {
      desatualizadas: linhas.filter((l) => l.temFicha),
      semAnalise: linhas.filter((l) => !l.temFicha),
      iaDisponivel,
      indisponivel: false,
    }
    gravarCachePendentes(chave, resposta)
    return NextResponse.json(resposta)
  } catch (e) {
    return falhou(e, empresaId, userId)
  }
}
