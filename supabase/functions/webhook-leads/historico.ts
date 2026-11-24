/**
 * QUEM FALOU NUMA MENSAGEM DO HISTÓRICO DA COEXISTÊNCIA (23/11/2026).
 *
 * O evento `history` traz o número do canal em `value.metadata.display_phone_number`; cada mensagem traz `from`.
 * `from` igual ao número do canal = a loja mandou ("enviada"); qualquer outro = o cliente ("recebida").
 * `to` nunca vem no histórico (13/10), e os metadados de cada bloco (`history[].metadata`) só têm `phase`,
 * `progress` e `chunk_order` — ler o número de lá deixava tudo "recebida" (Aletrini, 19/11).
 */
export function direcaoNoHistorico(numeroDoCanal: string, de: unknown): "enviada" | "recebida" {
  const loja = String(numeroDoCanal ?? "").replace(/\D/g, "");
  const remetente = String(de ?? "").replace(/\D/g, "");
  return loja && remetente === loja ? "enviada" : "recebida";
}

/** O número do canal no evento `history`: `value.metadata.display_phone_number`. */
export function numeroDoCanalNoEvento(value: Record<string, unknown> | undefined): string {
  const meta = value?.metadata as Record<string, unknown> | undefined;
  return String(meta?.display_phone_number ?? "").replace(/\D/g, "");
}
