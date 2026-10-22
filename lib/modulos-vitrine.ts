/**
 * MÓDULO DESLIGADO = VITRINE, NÃO REDIRECT (etapa 0, 21/10/2026).
 *
 * Quem abria /agenda numa loja sem o módulo caía no dashboard com uma faixa
 * amarela — e não ficava sabendo o que perdia. Agora a rota mostra o que o
 * módulo faz e leva ao tile dele na Central de Módulos (22/10/2026).
 *
 * Arquivo só de dados, sem import de tela: o proxy lê `temVitrine` a cada rota.
 *
 * NÚMEROS ILUSTRATIVOS, e a tela diz isso com todas as letras. Vitrine com
 * número que parece da loja seria exatamente o "número com cara de calculado"
 * que a etapa 0 tirou do painel.
 */
export interface VitrineModulo {
  nome: string
  /** Uma frase: o que o módulo faz, no idioma do balcão. */
  frase: string
  numeros: [NumeroIlustrativo, NumeroIlustrativo, NumeroIlustrativo]
}

interface NumeroIlustrativo { valor: string; rotulo: string }

export const VITRINES: Record<string, VitrineModulo> = {
  '/agenda': {
    nome: 'Agenda',
    frase: 'Visitas e atendimentos marcados num calendário só, com o lead e o responsável de cada horário.',
    numeros: [
      { valor: '6', rotulo: 'compromissos no dia' },
      { valor: '2', rotulo: 'aguardando confirmação do cliente' },
      { valor: '14h', rotulo: 'próximo horário livre da equipe' },
    ],  },
  '/executivo': {
    nome: 'Executivo',
    frase: 'O painel do dono: quanto entrou, quanto ainda vai entrar, quem está produzindo e de onde vêm os negócios que fecham.',
    numeros: [
      { valor: 'R$ 412 mil', rotulo: 'vendido no mês' },
      { valor: 'R$ 38 mil', rotulo: 'de comissão a receber' },
      { valor: '23%', rotulo: 'dos fechamentos vieram do mesmo canal' },
    ],  },
  '/gestao-leads': {
    nome: 'Gestão de Leads',
    frase: 'Mostra o lead que parou — sem resposta, sem próximo passo — e quem precisa cobrar, antes que ele esfrie.',
    numeros: [
      { valor: '37', rotulo: 'leads parados há mais de 7 dias' },
      { valor: '12', rotulo: 'esperando resposta da loja' },
      { valor: 'R$ 46 mil', rotulo: 'em negociação parada' },
    ],
  },
}

export function temVitrine(href: string): boolean {
  return Object.prototype.hasOwnProperty.call(VITRINES, href)
}
