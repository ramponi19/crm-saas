import type { Classification, RawMessage } from "@/types/zapintel";

/**
 * ⚠ NÃO EXISTE `allText` AQUI, E A AUSÊNCIA É A REGRA.
 *
 * Havia. A classificação lia o texto dos DOIS lados, e o estrago era medível:
 * 133 leads marcados como "cliente", 33 compradores de verdade; 27 deles
 * marcados por palavra que só a LOJA tinha falado, e 9 só por endereço
 * ("endereço completo" foi dito 49 vezes pela loja contra 8 pelo cliente).
 *
 * O campo saiu do tipo, e não só da regra: assim o compilador impede que uma
 * regra futura volte a classificar o cliente pelo que o vendedor disse. Quem
 * precisar do texto da loja para OUTRA coisa que crie outra entrada, com nome
 * próprio, e justifique.
 */
interface ClassifyInput {
  /** Só o que o CLIENTE falou. Ver o aviso acima. */
  leadText: string;
  leadMsgs: number;
  storeMsgs: number;
  daysInactive: number;
  messages: RawMessage[];
  /**
   * Trocas de turno nas PRIMEIRAS 24 H da conversa.
   *
   * Medido contra as vendas em 10/10/2026, é a variável que mais separa
   * comprador de curioso — e a única que sobreviveu ao corte contra
   * vazamento. Ver o cabeçalho de `scripts/calibrar-zapintel.mts`.
   */
  trocasInicio: number;
}

/**
 * ⚠ AQUI HAVIA UMA REGRA `CUSTOMER_KW`, E ELA FOI REMOVIDA EM 10/10/2026.
 *
 * Ela marcava o lead como CLIENTE por palavra no texto — e lia o texto dos
 * DOIS lados, loja inclusive. Medido contra as vendas de verdade:
 *
 *     133 leads marcados como cliente ... 33 compraram de fato
 *     gatilho n1: "imei" ............... 101 leads
 *     marcados por palavra que so a LOJA falou ... 27
 *     so por endereco ("rua ", "endereco completo") ... 9
 *
 * "imei" e pergunta de COTACAO DE TROCA — o oposto de venda fechada. E
 * "endereco completo" foi dito 49 vezes pela loja contra 8 pelo cliente.
 *
 * Quem comprou agora vem da ponte venda->conversa (`zapintel_venda_lead`),
 * aplicada em `montarPainel`. Fato nao se adivinha por palavra-chave quando
 * existe a tabela que registra o fato.
 */
const CONFIRMED_KW = ["combinado","confirmado","blza","blz","fechar","vou levar","pode separar","quero esse","reserva pra mim","me manda o pix","qual o pix","aceita pix","link de pagamento"];
const HOT_KW = ["quanto fica no pix","me manda o pix","qual a chave","18x","12x","nota fiscal","garantia","parcelado","saúde da bateria","disponível","tem em estoque","pronta entrega","entrega hoje","entrega amanhã","pode ser","pode sim","quando posso","vou levar","reserva","quanto fica"];
const WARM_KW = ["gostaria de saber","qual o valor","quanto está","tem o modelo","quais modelos","gostaria de","tenho interesse","me interesso","interessante","queria saber"];
const LOST_KW = ["não vou mais","desisti","não preciso mais","comprei em outro","comprei no mercado","passei","foi pra outro","não quis","cancela","cancelar"];
const NOTIFICATION_TPL = ["notification_template","vi o anúncio do iphone. tenho interesse"];

export function classifyLead({ leadText, leadMsgs, storeMsgs, daysInactive, messages, trocasInicio }: ClassifyInput): Classification {
  const lt = leadText.toLowerCase();

  // Lost
  if (LOST_KW.some(k => lt.includes(k))) return "lost";

  // Unqualified: only template / no real engagement
  const isOnlyTemplate = messages.filter(m => !m.isStore).every(m =>
    NOTIFICATION_TPL.some(t => m.body.toLowerCase().includes(t)) || m.body.trim().length < 5
  );
  if (leadMsgs === 0 || isOnlyTemplate) return "unqualified";
  if (leadMsgs <= 1 && storeMsgs <= 1) return "unqualified";

  // Score buy signals
  const hotHits = HOT_KW.filter(k => lt.includes(k)).length;
  const confirmedHits = CONFIRMED_KW.filter(k => lt.includes(k)).length;

  /**
   * CONVERSA FUNDA NO PRIMEIRO DIA — o gatilho que a medicao acrescentou.
   *
   * Taxa de compra por trocas de turno nas primeiras 24 h, contra a base de
   * 1,60%:
   *
   *     ate 4 ....... 1,11%   (0,69x)
   *     5 a 14 ...... 1,07%   (0,67x)
   *     15 a 29 ..... 3,66%   (2,29x)
   *     30 ou mais .. 12,24%  (7,65x)
   *
   * Sobrevive ao corte contra vazamento: e medido so no primeiro dia, antes
   * de qualquer desfecho. (Sobre a conversa INTEIRA o numero era 8,44x, mas
   * aquilo era circular — quem compra conversa muito PORQUE comprou.)
   *
   * Vem antes das palavras-chave de proposito: ir e voltar quinze vezes com a
   * loja no primeiro dia diz mais do que ter dito "18x" — que, medido, nao
   * separa nada (21% de quem comprou contra 19% de quem nao comprou).
   */
  if (trocasInicio >= 15) return "hot";

  if (confirmedHits >= 2 || hotHits >= 4) return "hot";
  if (hotHits >= 2 && leadMsgs >= 3) return "hot";
  if (hotHits >= 1 && confirmedHits >= 1) return "hot";

  // Stalled: had engagement but gone very quiet
  if (daysInactive > 14 && hotHits >= 1) return "stalled";
  if (daysInactive > 21 && leadMsgs >= 3) return "stalled";

  // Follow-up: light engagement, needs a nudge
  if (hotHits === 0 && leadMsgs >= 1 && daysInactive >= 3) return "followup";

  // Warm: genuine interest
  const warmHits = WARM_KW.filter(k => lt.includes(k)).length;
  if (warmHits >= 1 || (leadMsgs >= 2 && hotHits >= 1)) return "warm";
  if (leadMsgs >= 2) return "warm";

  return "followup";
}
