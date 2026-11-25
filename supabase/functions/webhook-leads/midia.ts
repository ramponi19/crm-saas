/**
 * NOVAS TENTATIVAS E PRAZO DA MÍDIA (25/11/2026) — puro, sem banco nem rede, para o teste Deno.
 *
 * Em 25/11 o Storage respondeu 520 a um áudio do WhatsApp e a Edge desistiu na primeira: a mensagem ficou
 * "[audio]" sem arquivo. Agora cada passo (consulta à Meta, download, upload) tenta até 2 vezes mais quando a
 * falha é passageira — 5xx, 429 ou tempo esgotado — esperando 0,5 s e depois 1,5 s. Falha que não passa
 * sozinha (4xx, arquivo grande demais, página no lugar do arquivo) não repete.
 *
 * O upload repete com o arquivo que já está na memória: **não baixa de novo**.
 *
 * As esperas são curtas de propósito: a Meta reenvia o webhook quando o 200 demora, e o reenvio era o que
 * duplicava arquivo no bucket (11/09). Duas esperas somam 2 s no pior caso.
 */
export const ESPERAS_PADRAO_MS = [500, 1500];

/** O resultado de UMA tentativa. `transitorio` = vale tentar de novo. */
export type Tentativa<T> =
  | { ok: true; valor: T }
  | { ok: false; transitorio: boolean; motivo: string };

export type Final<T> = Tentativa<T> & { tentativas: number };

/** HTTP que costuma passar sozinho: 5xx (inclusive 520 da Cloudflare) e 429 (limite de taxa). */
export function statusTransitorio(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * O erro do Storage é passageiro? O supabase-js entrega objetos diferentes conforme a versão
 * (StorageApiError com `status`/`statusCode`, StorageUnknownError só com a mensagem "HTTP 520 error").
 * Na dúvida sem número nenhum, trata como passageiro: repetir um upload com `upsert` no mesmo caminho é
 * inofensivo, e desistir cedo perde o arquivo.
 */
export function erroDeStorageTransitorio(erro: unknown): boolean {
  const e = (erro ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown; name?: unknown };
  const n = Number(e.status ?? e.statusCode);
  if (Number.isFinite(n) && n > 0) return statusTransitorio(n);
  const msg = String(e.message ?? "");
  const http = msg.match(/HTTP (\d{3})/);
  if (http) return statusTransitorio(Number(http[1]));
  return true;
}

/** Erro de rede ou prazo esgotado (fetch abortado) — sempre passageiro. */
export function erroDeRede(e: unknown): Tentativa<never> {
  const nome = (e as { name?: string } | null)?.name ?? "";
  return {
    ok: false, transitorio: true,
    motivo: nome === "AbortError" || nome === "TimeoutError" ? "tempo esgotado" : `rede: ${(e as Error)?.message ?? e}`,
  };
}

/** Roda `tentar` e repete (no máximo esperas.length vezes) enquanto a falha for passageira. */
export async function comNovasTentativas<T>(
  tentar: () => Promise<Tentativa<T>>,
  esperas: number[] = ESPERAS_PADRAO_MS,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Final<T>> {
  let ultima: Tentativa<T> = { ok: false, transitorio: false, motivo: "não tentou" };
  for (let i = 0; i <= esperas.length; i++) {
    try {
      ultima = await tentar();
    } catch (e) {
      ultima = erroDeRede(e);
    }
    if (ultima.ok || !ultima.transitorio || i === esperas.length) return { ...ultima, tentativas: i + 1 };
    await dormir(esperas[i]);
  }
  return { ...ultima, tentativas: esperas.length + 1 };
}

/**
 * Até quando a Meta deixa baixar a mídia: **7 dias** contados da mensagem (documentação da Cloud API:
 * "media IDs in webhooks expire after 7 days"). `timestamp` é o do webhook, em segundos; sem ele, agora.
 */
export const DIAS_DA_MIDIA_NA_META = 7;
export function prazoDaMidia(timestamp: unknown, agora: Date = new Date()): string {
  const s = Number(timestamp);
  const base = Number.isFinite(s) && s > 0 ? new Date(s * 1000) : agora;
  return new Date(base.getTime() + DIAS_DA_MIDIA_NA_META * 86_400_000).toISOString();
}
