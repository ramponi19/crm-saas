// ============================================================================
// Reenvio da Meta: reconhecer o MESMO webhook antes de processá-lo de novo.
//
// A Meta reentrega o evento quando não recebe 200 a tempo. Pacote de sincronização
// (> 10 KB) leva ~1 min na Edge, então ela reentrega sem parar — o canal de
// Jaguariúna recebeu o mesmo pacote 418 vezes desde 13/10/2026. O hash do corpo bruto
// identifica a reentrega; a tabela ops.webhook_recebidos (via webhook_reenvio) lembra
// os hashes por 24 h. Separado do index.ts para poder ser testado sozinho.
// ============================================================================

/** Acima disto o pacote é "grande": o hash é gravado ANTES de processar. */
export const LIMITE_GRANDE = 10_000;

/** SHA-256 em hexadecimal dos bytes exatos do corpo (o mesmo texto que a assinatura cobre). */
export async function hashCorpo(corpoCru: string): Promise<string> {
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(corpoCru));
  return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tamanho em bytes (UTF-8), não em caracteres: é o que a Meta manda no Content-Length. */
export function tamanhoCorpo(corpoCru: string): number {
  return new TextEncoder().encode(corpoCru).length;
}

/**
 * Conta da Meta que originou o evento, para registro: phone_number_id no WhatsApp,
 * id da Página/conta no Messenger e no Instagram. Null quando não dá para saber.
 */
export function contaDoEvento(body: Record<string, unknown>): string | null {
  const entry = (body.entry as Record<string, unknown>[] | undefined)?.[0];
  if (!entry) return null;
  const valor = ((entry.changes as Record<string, unknown>[] | undefined)?.[0]?.value) as Record<string, unknown> | undefined;
  const fone = (valor?.metadata as Record<string, unknown> | undefined)?.phone_number_id;
  return String(fone ?? entry.id ?? "") || null;
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Pergunta ao banco se o corpo já foi recebido. `gravar` registra o hash na mesma ida.
 * Erro de banco NÃO bloqueia: devolve "não é reenvio" e a Edge processa como antes —
 * perder a proteção contra reenvio é melhor do que perder uma mensagem.
 */
export async function jaRecebido(
  rpc: Rpc, hash: string, tamanho: number, conta: string | null, gravar: boolean,
): Promise<boolean> {
  const { data, error } = await rpc("webhook_reenvio", {
    p_hash: hash, p_tamanho: tamanho, p_conta: conta, p_gravar: gravar,
  });
  if (error) { console.error("webhook_reenvio:", error.message); return false; }
  return data === true;
}

/** Chave do Direct em ops.webhook_recebidos (a mesma tabela do hash, prefixo próprio). */
export const chaveMid = (mid: string) => `mid:${mid}`;

/**
 * O MESMO DIRECT EM DUAS ENTREGAS (22/10/2026): é a primeira vez que este mid chega?
 *
 * O Instagram entrega o mesmo Direct pelos dois conectores (Página e login do Instagram),
 * com corpos diferentes — o hash não pega. As duas requisições criavam cada uma o seu
 * contato e o seu negócio (6509/6510, 6528/6529, 6555/6556). webhook_mid_novo guarda o
 * mid por 60 s e devolve TRUE só para a primeira entrega.
 *
 * Erro de banco devolve TRUE (processar): duplicar ainda é melhor do que perder a
 * mensagem, e o banco também trava a identidade (migração 20261023000200).
 */
export async function primeiraEntrega(rpc: Rpc, mid: string, conta: string | null): Promise<boolean> {
  const { data, error } = await rpc("webhook_mid_novo", { p_mid: mid, p_conta: conta });
  if (error) { console.error("webhook_mid_novo:", error.message); return true; }
  return data !== false;
}

/**
 * Esquece o hash de um pacote que NÃO foi processado (erro de banco no meio), para
 * que o reenvio da Meta seja processado em vez de descartado. Melhor esforço: se o
 * banco ainda estiver fora, o hash fica e expira em 24 h.
 */
export async function esquecer(rpc: Rpc, hash: string): Promise<void> {
  const { error } = await rpc("webhook_reenvio_esquecer", { p_hash: hash });
  if (error) console.error("webhook_reenvio_esquecer:", error.message);
}

/**
 * Erro de banco num ponto em que seguir em frente PERDE o evento. O handler
 * responde 500 e a Meta reenvia — o contrário do "200 mesmo em erro", que vale para
 * evento problemático (dado ruim) e não para banco indisponível.
 *
 * 20/10/2026 11:07–11:09: com o PostgREST devolvendo 503, a busca do canal "não
 * achava" o canal, o evento virava órfão e a Edge respondia 200. 97 eventos
 * (mensagens, ecos e Instagram) foram descartados e a Meta nunca reenviou.
 */
export class ErroDeBanco extends Error {
  constructor(mensagem: string) { super(mensagem); this.name = "ErroDeBanco"; }
}

/**
 * O erro diz que o BANCO está fora — e não que o dado é ruim?
 *
 * 04/11/2026: com o canal já em cache, o banco caindo no meio de um pacote fazia a
 * Edge responder 200 depois de ~105 s e as mensagens se perdiam (5 de 5; 14 de 40
 * num pacote grande). Só a busca do canal virava 500. Agora a gravação da mensagem
 * (e o que ela precisa antes: achar ou criar o lead) também vira ErroDeBanco quando
 * isto devolve true. Dado ruim (violação, valor inválido) continua sendo só log: 500
 * por evento problemático faria a Meta reenviar em loop.
 */
export function bancoIndisponivel(
  erro: { message?: string; code?: string } | null | undefined, status?: number | null,
): boolean {
  if (!erro) return false;
  if (status === 0 || status === 502 || status === 503 || status === 504) return true;
  const codigo = String(erro.code ?? "");
  // PostgREST sem conexão / sem cache de schema; Postgres derrubando ou sem conexões.
  if (/^PGRST00[0-3]$/.test(codigo)) return true;
  if (["57P01", "57P02", "57P03", "53300", "08000", "08001", "08003", "08006"].includes(codigo)) return true;
  return /fetch failed|failed to fetch|network|ECONNREFUSED|ECONNRESET|schema cache|timed? ?out/i.test(String(erro.message ?? ""));
}
