/**
 * O CANAL PEDIDO PARA RESPONDER É DESTA EMPRESA E DESTA LOJA? (13/11/2026)
 *
 * O card e a Comunicação passam a mandar `canalId` — o canal da conversa em que o cliente
 * escreveu (lib/canais/resolver-canal.ts no app). O id vem do navegador, então a Edge confere
 * antes de usar: mesma empresa do negócio, ativo, da loja do negócio ou da rede (filial nula),
 * e do tipo que a ação envia. Recusa com 409 e mensagem clara; nunca troca por outro canal em
 * silêncio. Puro, para o teste (canal-resposta.test.ts).
 */
export type TipoCanal = "whatsapp" | "instagram" | "messenger";

export interface CanalConferido {
  id: number;
  empresa_id: number;
  tipo: string;
  filial_id: number | null;
  status: string;
}

export type Conferencia =
  | { ok: true }
  | { ok: false; status: number; codigo: string; erro: string };

export function conferirCanalDeResposta(
  canal: CanalConferido | null,
  negocio: { empresa_id: number; filial_id: number | null },
  tipo: TipoCanal,
): Conferencia {
  if (!canal || canal.empresa_id !== negocio.empresa_id) {
    return { ok: false, status: 409, codigo: "canal_de_outra_empresa", erro: "Este canal não é desta empresa. Recarregue a conversa e escolha de novo por onde responder." };
  }
  if (canal.filial_id != null && canal.filial_id !== negocio.filial_id) {
    return { ok: false, status: 409, codigo: "canal_de_outra_loja", erro: "Este canal é de outra loja. Responda pelo canal desta loja." };
  }
  if (canal.tipo !== tipo) {
    return { ok: false, status: 409, codigo: "canal_de_outro_tipo", erro: `O canal escolhido não é ${tipo === "whatsapp" ? "WhatsApp" : tipo === "instagram" ? "Instagram" : "Messenger"}.` };
  }
  if (canal.status !== "ativo") {
    return { ok: false, status: 409, codigo: "canal_inativo", erro: "Este canal está desconectado. Reconecte em Canais ou responda por outro." };
  }
  return { ok: true };
}

/**
 * O id do cliente NA CONTA que vai enviar (Instagram e Messenger: o id é por conta). A da
 * própria conta; senão a de antes de as identidades guardarem a conta (nula). A identidade de
 * OUTRA conta nunca: é exatamente o `(#100) No matching user found`.
 */
export function destinoNaConta(
  identidades: { external_id: string; canal_id: number | null }[],
  canalId: number,
): string | null {
  return identidades.find((i) => i.canal_id === canalId)?.external_id
    ?? identidades.find((i) => i.canal_id == null)?.external_id
    ?? null;
}
