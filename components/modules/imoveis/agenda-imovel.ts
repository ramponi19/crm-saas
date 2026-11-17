/**
 * O que o módulo Imóveis põe na Agenda (17/11/2026, regra "o ramo só dentro do seu módulo").
 *
 * A Agenda é genérica; com Imóveis ligado, o compromisso pode apontar um imóvel, ganha o tipo
 * "vistoria" (etapa do funil imobiliário, entre contrato e entrega de chaves) e o exemplo do
 * título fala de visita ao imóvel. Só constantes: a página (servidor) e a tela (navegador)
 * importam daqui, e só usam com o módulo ligado.
 */

/** Embed do imóvel no select de `visitas` (só com Imóveis ligado). */
export const EMBED_IMOVEL_DA_VISITA = 'imoveis:imoveis_imoveis(titulo, codigo, bairro)'

/** O tipo de compromisso que só existe onde há imóvel. Valor do banco: `visitas_tipo_check`. */
export const TIPO_VISTORIA = { v: 'vistoria', l: 'Vistoria' }

export const EXEMPLO_COMPROMISSO_IMOVEL = 'Ex: Visita ao imóvel'

export const ROTULO_IMOVEL_DO_COMPROMISSO = 'Imóvel'
