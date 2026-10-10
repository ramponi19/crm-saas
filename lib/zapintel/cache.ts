import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * O PAINEL JÁ CALCULADO — PORQUE CALCULAR TEM PREÇO, E O PREÇO É CONTADO.
 *
 * ══ O QUE ACONTECEU EM 09/10/2026 ══════════════════════════════════════════
 *
 * A Vercel mandou aviso de 75% do plano free. O teto é **4 horas de Active CPU
 * por mês**, para TODOS os projetos da conta juntos, e estourar não cobra: ele
 * **pausa os projetos**. O CRM sai do ar.
 *
 * Medido no painel da Vercel, nas 12 h seguintes à estreia do painel novo:
 *
 *     /zapintel/api/painel ....... 87 chamadas ....... 4 min de CPU
 *     /  (landing) ............... 742 chamadas ...... 56 s
 *     /zapintel/api/pulso ........ 410 chamadas ...... 19 s
 *
 * São **2,76 s de CPU por abertura de tela** — o maior consumidor do CRM
 * inteiro, sozinho quase metade do CPU de função do dia. O teto de 4 h dá
 * 5.217 aberturas no mês. Com a tela recalculando a cada mensagem nova, uma
 * única aba aberta 8 horas gastaria o mês em 11 dias.
 *
 * ══ O CONSERTO, EM DUAS PARTES ═════════════════════════════════════════════
 *
 * 1. **Abrir a tela não calcula nada.** O resultado fica guardado em
 *    `zapintel_painel`, um registro por empresa, e a rota devolve o texto como
 *    veio — sem `JSON.parse`, sem `JSON.stringify`. De 2,76 s para dezenas de
 *    milissegundos.
 *
 * 2. **Quem decide recalcular é o servidor, não a aba.** Antes cada aba tinha
 *    seu próprio relógio: cinco telas abertas eram cinco recálculos da mesma
 *    empresa. Agora a janela mora aqui, e cinco telas são um recálculo só.
 *
 * ══ POR QUE 10 MINUTOS, E NÃO "TEMPO REAL" ═════════════════════════════════
 *
 * Porque o número cabe ou não cabe. Com recálculo a cada 10 min, 10 horas de
 * movimento dão 60 recálculos/dia = 166 s de CPU/dia ≈ 1,4 h/mês — dentro do
 * teto, com folga para o resto do CRM. A 1 minuto seriam 600/dia = 28 h/mês:
 * sete vezes o teto do time inteiro.
 *
 * O que NÃO se perde: a tela continua sabendo na hora que chegou mensagem (o
 * pulso custa uma linha) e DIZ isso, em vez de mostrar número velho calado. E
 * quem não quer esperar clica em atualizar — pessoa clicando é raro,
 * cronômetro não é, e por isso só o clique fura a janela.
 */

/** Janela mínima entre dois recálculos da MESMA empresa. Ver o cabeçalho. */
export const JANELA_MS = 10 * 60_000

/**
 * Piso quando alguém pede "atualizar agora".
 *
 * A janela existe contra cronômetro, não contra gente. Mas o clique também
 * repete — basta a mão insistir — então sobra um piso curto, que impede a
 * repetição sem fazer ninguém esperar de verdade.
 */
export const JANELA_FORCADO_MS = 60_000

/** O que a tela precisa saber sem baixar o painel inteiro. */
export interface Marca {
  /** Maior id de mensagem que entrou no cálculo guardado. */
  ultimaMensagem: number
  mensagens: number
  calculadoEm: string
  /** Quando o servidor aceita recalcular de novo (epoch ms). */
  proximoEm: number
}

const marcaDaLinha = (l: { ultima_mensagem: number; mensagens: number; calculado_em: string }): Marca => ({
  ultimaMensagem: Number(l.ultima_mensagem) || 0,
  mensagens: Number(l.mensagens) || 0,
  calculadoEm: l.calculado_em,
  proximoEm: new Date(l.calculado_em).getTime() + JANELA_MS,
})

/**
 * O maior id de mensagem da empresa.
 *
 * Sai pelo índice da chave primária em milissegundos. `count` exato custa 1,7 s
 * nesta tabela (medido) — mais que ler o painel inteiro — e cairia se uma
 * mensagem fosse apagada, fazendo um painel velho parecer em dia.
 */
export async function ultimaMensagemDoBanco(db: SupabaseClient, empresaId: number): Promise<number> {
  const { data, error } = await db
    .from('lead_mensagens')
    .select('id')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.id as number | undefined) ?? 0
}

/**
 * Só os carimbos do cache — **nunca** a coluna `painel`.
 *
 * O pulso chama isto a cada batida. Trazer o blob junto seria 1,75 MB a cada
 * 45 s por aba aberta: 2,8 GB por dia de trabalho, mais da metade do egress
 * mensal do plano free do Supabase, para responder "mudou?".
 */
export async function marcaDoCache(db: SupabaseClient, empresaId: number): Promise<Marca | null> {
  const { data, error } = await db
    .from('zapintel_painel')
    .select('ultima_mensagem, mensagens, calculado_em')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? marcaDaLinha(data as never) : null
}

/** O painel guardado, como texto, pronto para virar corpo de resposta. */
export async function painelDoCache(
  db: SupabaseClient,
  empresaId: number,
): Promise<{ texto: string; marca: Marca } | null> {
  const { data, error } = await db
    .from('zapintel_painel')
    .select('painel, ultima_mensagem, mensagens, calculado_em')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { texto: (data as { painel: string }).painel, marca: marcaDaLinha(data as never) }
}

/** Guarda o painel recém-calculado. `upsert` porque recalcular é o caso normal. */
export async function guardarPainel(
  db: SupabaseClient,
  empresaId: number,
  texto: string,
  ultimaMensagem: number,
  mensagens: number,
  ms: number,
): Promise<void> {
  const { error } = await db.from('zapintel_painel').upsert(
    {
      empresa_id: empresaId,
      painel: texto,
      ultima_mensagem: ultimaMensagem,
      mensagens,
      ms,
      calculado_em: new Date().toISOString(),
    },
    { onConflict: 'empresa_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * O cache serve, ou é hora de calcular de novo?
 *
 * Três motivos para servir o que já existe, e a ordem importa:
 *
 *  1. **Nada mudou.** Nenhuma mensagem entrou depois do cálculo guardado — o
 *     painel não seria diferente, só mais caro.
 *  2. **Mudou, mas faz pouco tempo.** É a janela: a tela mostra o número de
 *     alguns minutos atrás e DIZ que há mensagem nova esperando.
 *  3. **Pediram na mão, e já tinham pedido agora há pouco.** Ver
 *     `JANELA_FORCADO_MS`.
 */
export function cacheServe(marca: Marca | null, ultimaNoBanco: number, forcado: boolean): boolean {
  if (!marca) return false
  if (marca.ultimaMensagem >= ultimaNoBanco) return true
  const idade = Date.now() - new Date(marca.calculadoEm).getTime()
  return idade < (forcado ? JANELA_FORCADO_MS : JANELA_MS)
}
