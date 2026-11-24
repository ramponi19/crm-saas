/**
 * COMO O CRM NOMEIA UMA LOJA E UM NÚMERO (23/11/2026).
 *
 * A tela de Canais dizia a loja por "nome · cidade" e a de modelos só pelo nome. Na JM a loja de
 * Mogi está cadastrada com o nome "JM Store Importados" e a cidade "Mogi Guaçu" num campo à parte:
 * a tela de modelos mostrava "JM Store Importados ·2028", sem dizer Mogi. Agora as duas usam esta
 * regra. Puro (sem servidor): vale no navegador e na rota.
 */

export interface LojaRotulavel { nome: string; cidade?: string | null }

/** "Nome · Cidade"; sem cidade, ou com a cidade já no nome, só o nome. */
export function rotuloDaLoja(loja: LojaRotulavel): string {
  const nome = (loja.nome ?? '').trim()
  const cidade = (loja.cidade ?? '').trim()
  if (!cidade) return nome
  const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return sem(nome).includes(sem(cidade)) ? nome : `${nome} · ${cidade}`
}

/** "+55 19 99886-2028 · JM Store" → "2028"; sem número no nome, o final do id da Meta. */
export function finalDoNumero(nome: string | null, externalId: string | null): string {
  const d = (nome ?? '').split('·')[0].replace(/\D/g, '')
  if (d.length >= 4) return d.slice(-4)
  const e = (externalId ?? '').replace(/\D/g, '')
  return e.length >= 4 ? e.slice(-4) : '?'
}

/** "JM Store Importados · Mogi Guaçu ·2028". Loja nula = número da empresa inteira. */
export function rotuloDoNumeroNaLoja(loja: LojaRotulavel | null, final: string, semLoja = 'Empresa'): string {
  return `${loja ? rotuloDaLoja(loja) : semLoja} ·${final}`
}
