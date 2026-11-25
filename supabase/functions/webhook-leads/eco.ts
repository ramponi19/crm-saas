/**
 * ECO DA COEXISTÊNCIA (mensagem que a loja mandou pelo app do celular): em qual negócio da LOJA DO CANAL ela é gravada.
 *
 * 1. o negócio ativo e aberto da loja; senão o ativo (como sempre foi);
 * 2. (registrarEcho) cliente conhecido com negócio ativo só em outra loja: core_negocio_do_canal (como sempre foi);
 * 3. NOVO (24/11/2026, ok do Lucas): o cliente só tem negócios ARQUIVADOS nesta loja (ex.: venda antiga que está no
 *    pós-venda). A mensagem fica registrada na conversa dele, presa ao negócio mais recente DESTA loja, sem reabrir
 *    nem criar negócio. Antes ela era descartada (18 clientes da JM com venda estavam assim).
 * Só negócio da mesma loja do canal: preso a negócio de outra loja, o mensagem_registrar abriria um negócio aqui.
 */
export interface NegocioDoEco { id: number; ativo: boolean; status: string }

/** Passo 1: o negócio ativo da loja (o aberto primeiro). */
export function negocioAtivoDoEco(daLoja: NegocioDoEco[]): number | null {
  return (daLoja.find((n) => n.ativo && n.status === "aberto") ?? daLoja.find((n) => n.ativo))?.id ?? null;
}

/** Passo 3: o negócio mais recente da loja, mesmo arquivado (a lista vem em ordem de id). Não reabre nada. */
export function negocioArquivadoDoEco(daLoja: NegocioDoEco[]): number | null {
  return daLoja.reduce<number | null>((maior, n) => (maior == null || n.id > maior ? n.id : maior), null);
}
