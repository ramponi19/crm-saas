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
 *
 * São **2,76 s de CPU por cálculo** — o maior consumidor do CRM inteiro. O teto
 * de 4 h dá 5.217 cálculos no mês, para tudo.
 *
 * ══ A REGRA, E ELA É SIMPLES ═══════════════════════════════════════════════
 *
 * **Abrir a tela nunca calcula. Só o botão calcula.**
 *
 * Qualquer leitura devolve o que está guardado, tenha ele a idade que tiver.
 * Quem decide pagar os 2,76 s é uma pessoa clicando em "Sincronizar agora" —
 * e aí o cálculo acontece na hora, sem janela nenhuma para esperar.
 *
 * Houve uma versão intermediária, no mesmo dia, com recálculo automático a
 * cada 10 min. Funcionava, mas tinha o defeito de todo automatismo pago por
 * tempo: gastava igual estando a loja movimentada ou parada, e ninguém via a
 * conta correr. O Lucas preferiu trocar o automático por saber a data — e é
 * por isso que `calculadoEm` agora aparece na tela em vez de ficar só no JSON.
 *
 * ══ O QUE ISSO EXIGE DA TELA ═══════════════════════════════════════════════
 *
 * Que ela DIGA de quando é o número, sempre e sem rodeio. Painel que pode ter
 * dias de idade e se apresenta como "agora" é exatamente o defeito que este
 * módulo inteiro veio consertar — antes por truncamento, depois por canal de
 * tempo real que não recebia nada. A barra lateral mostra a data, e a cor dela
 * envelhece junto.
 */

/**
 * Piso entre dois cálculos pedidos na mão.
 *
 * O botão não espera janela, mas o dedo repete — e dois cliques seguidos
 * custariam 5,5 s de CPU para produzir o mesmo número. Um minuto resolve, e
 * ninguém percebe.
 */
export const JANELA_FORCADO_MS = 60_000

/**
 * A VERSÃO DO CÁLCULO. **Suba isto sempre que a conta mudar.**
 *
 * Como o cache nunca expira por tempo, código novo não mudaria a tela: o
 * painel seguiria mostrando a matemática velha até alguém clicar em
 * "Sincronizar agora", calado. É o mesmo modo de falha que este módulo já teve
 * duas vezes — análise truncada em 23/09 e canal de tempo real que não recebia
 * nada —, as duas em silêncio.
 *
 * Com a versão, o deploy que muda a conta invalida o cache sozinho: a primeira
 * abertura depois dele paga um cálculo, e as seguintes voltam a ser de graça.
 *
 * Histórico:
 *   v1  10/10/2026  ticket, conversão e ciclo medidos — fim do TICKET_MEDIO = 5200
 *   v2  10/10/2026  taxa de fechamento medida no pipeline; "objeção mais cara"
 *                   virou contagem de leads travados (o 0,6 era invenção)
 *
 * (v2 nasceu de esquecer de subir a v1: a tela mostrou " leads travados" sem
 * número, porque o cache tinha o formato velho. O mecanismo funcionou — quem
 * falhou fui eu em não usá-lo. Fica o lembrete: mudou a conta, sobe a versão.)
 *   v3  10/10/2026  ficha por lead e o ranking de frases antes do silêncio
 */
export const VERSAO_DO_CALCULO = 'v3'

/** O carimbo do cálculo guardado. */
export interface Marca {
  /** Maior id de mensagem que entrou no cálculo guardado. */
  ultimaMensagem: number
  mensagens: number
  calculadoEm: string
  /** Versão do cálculo que produziu este painel. Ver VERSAO_DO_CALCULO. */
  versao: string
}

/** O painel guardado, como texto, pronto para virar corpo de resposta. */
export async function painelDoCache(
  db: SupabaseClient,
  empresaId: number,
): Promise<{ texto: string; marca: Marca } | null> {
  const { data, error } = await db
    .from('zapintel_painel')
    .select('painel, ultima_mensagem, mensagens, calculado_em, versao')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const l = data as {
    painel: string; ultima_mensagem: number; mensagens: number; calculado_em: string; versao: string
  }
  return {
    texto: l.painel,
    marca: {
      ultimaMensagem: Number(l.ultima_mensagem) || 0,
      mensagens: Number(l.mensagens) || 0,
      calculadoEm: l.calculado_em,
      versao: l.versao,
    },
  }
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
      versao: VERSAO_DO_CALCULO,
      calculado_em: new Date().toISOString(),
    },
    { onConflict: 'empresa_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * O cache serve, ou é para calcular?
 *
 * Sem cache nenhum não há escolha: calcula (é a primeira vez da empresa).
 * Com cache, serve SEMPRE — a idade não importa, porque quem decide atualizar
 * é a pessoa, não o relógio. A única exceção é o clique, e mesmo ele respeita
 * o piso de um minuto.
 */
export function cacheServe(marca: Marca | null, forcado: boolean): boolean {
  if (!marca) return false
  // Painel feito por uma conta que não existe mais não serve, por mais novo
  // que seja — senão código novo subiria e a tela seguiria na matemática
  // velha, calada. Ver VERSAO_DO_CALCULO.
  if (marca.versao !== VERSAO_DO_CALCULO) return false
  if (!forcado) return true
  return Date.now() - new Date(marca.calculadoEm).getTime() < JANELA_FORCADO_MS
}
