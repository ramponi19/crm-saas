/**
 * O MENU DA TELA DE CONFIGURAÇÕES (navegação nova, 21/10/2026).
 *
 * Antes eram dois menus para parametrizar a loja: o /admin (19 itens) e as doze
 * abas de /admin/configuracoes, com Funis, Modelos e Integrações aparecendo nos
 * dois (relatório 02, item 6). Agora é uma tela só, com um menu lateral próprio em
 * quatro seções — Perfil, Área de trabalho, IA, Integrações e canais —, e cada
 * item é a tela de antes, com o componente de antes.
 *
 * O que era LEITURA no /admin (Visão geral, Conversão, Meta da empresa) foi para
 * Insights, e as automações (cadências, distribuição, scoring, modelos, gatilhos)
 * para o grupo Automações do menu principal — ver lib/menu.ts. Decisão do Lucas.
 *
 * Pura: quem chama diz o papel, o segmento e se o ZapIntel está ligado.
 * Seção sem item não aparece (Perfil e IA só mostram o que existe hoje).
 */

export interface ItemConfig { href: string; label: string }
export interface GrupoConfig { label?: string; itens: ItemConfig[] }
export interface SecaoConfig { id: 'perfil' | 'trabalho' | 'ia' | 'integracoes'; label: string; grupos: GrupoConfig[] }

/**
 * Onde foi parar cada aba da antiga /admin/configuracoes. Serve aos 308 (link
 * salvo com `?aba=`) e ao índice /configuracoes.
 */
export const DESTINO_DA_ABA: Record<string, string> = {
  pagamentos: '/configuracoes/pagamentos',
  taxas: '/configuracoes/taxas',
  sla: '/configuracoes/sla',
  funis: '/configuracoes/funis',
  motivos: '/configuracoes/motivos',
  automacoes: '/automacoes',
  contrato: '/configuracoes/contrato',
  troca: '/configuracoes/troca',
  horario: '/configuracoes/horario',
  modelos: '/respostas',
  notificacoes: '/configuracoes/perfil',
  dados: '/configuracoes/dados',
  portais: '/configuracoes/portais',
  'veiculos-portais': '/configuracoes/portais',
  cardapio: '/configuracoes/cardapio',
  agendamento: '/configuracoes/agendamento',
  integracoes: '/configuracoes/integracoes',
}

export function secoesDeConfiguracoes({ isAdmin, abasDoSegmento, zapintel }: {
  isAdmin: boolean
  /** ids de `SEGMENTOS[seg].abasExtraConfiguracoes` (portais, cardapio, agendamento...) */
  abasDoSegmento: string[]
  zapintel: boolean
}): SecaoConfig[] {
  const tem = (id: string) => abasDoSegmento.includes(id)
  const perfil: SecaoConfig = {
    id: 'perfil', label: 'Perfil',
    // Idioma e senha não existem como tela hoje: ficam de fora até existirem.
    grupos: [{ itens: [{ href: '/configuracoes/perfil', label: 'Notificações e ausência' }] }],
  }
  if (!isAdmin) return [perfil]

  const trabalho: SecaoConfig = {
    id: 'trabalho', label: 'Área de trabalho',
    grupos: [
      { label: 'Empresa', itens: [
        { href: '/configuracoes/empresa', label: 'Minha empresa' },
        { href: '/configuracoes/lojas', label: 'Lojas' },
        { href: '/configuracoes/aparencia', label: 'Aparência' },
        { href: '/configuracoes/menu', label: 'Menu do CRM' },
        // A Central mora fora de /configuracoes (a equipe também vê a grade), mas o
        // dono a procura aqui, junto do Menu do CRM.
        { href: '/modulos', label: 'Central de módulos' },
      ] },
      { label: 'Usuários', itens: [
        { href: '/configuracoes/usuarios', label: 'Usuários' },
        { href: '/configuracoes/permissoes', label: 'Permissões' },
      ] },
      { label: 'Vendas e atendimento', itens: [
        { href: '/configuracoes/funil', label: 'Etapas do funil' },
        { href: '/configuracoes/funis', label: 'Funis' },
        { href: '/configuracoes/sla', label: 'SLA de atendimento' },
        { href: '/configuracoes/motivos', label: 'Motivos de perda' },
        { href: '/configuracoes/horario', label: 'Horário' },
        ...(tem('agendamento') ? [{ href: '/configuracoes/agendamento', label: 'Agendamento' }] : []),
      ] },
      { label: 'Loja', itens: [
        { href: '/configuracoes/pagamentos', label: 'Meios de pagamento' },
        { href: '/configuracoes/taxas', label: 'Taxas' },
        { href: '/configuracoes/troca', label: 'Troca' },
        { href: '/configuracoes/contrato', label: 'Contrato' },
        { href: '/configuracoes/documentos', label: 'Documentos' },
        ...(tem('cardapio') ? [{ href: '/configuracoes/cardapio', label: 'Cardápio' }] : []),
        { href: '/configuracoes/dados', label: 'Exportar dados' },
      ] },
      { label: 'Faturamento', itens: [{ href: '/configuracoes/faturamento', label: 'Plano' }] },
    ],
  }
  // IA: o que existe hoje para o lojista é o ZapIntel (área própria). O assistente
  // só tem configuração no superadmin.
  const ia: SecaoConfig = { id: 'ia', label: 'IA', grupos: [{ itens: zapintel ? [{ href: '/zapintel', label: 'ZapIntel' }] : [] }] }
  const integracoes: SecaoConfig = {
    id: 'integracoes', label: 'Integrações e canais',
    grupos: [{ itens: [
      { href: '/configuracoes/integracoes', label: 'Canais e integrações' },
      ...(tem('portais') || tem('veiculos-portais') ? [{ href: '/configuracoes/portais', label: 'Portais' }] : []),
    ] }],
  }
  return [perfil, trabalho, ia, integracoes].filter((s) => s.grupos.some((g) => g.itens.length > 0))
}

/** Primeira tela que esta pessoa pode abrir em Configurações. */
export function primeiraDeConfiguracoes(secoes: SecaoConfig[]): string {
  const trabalho = secoes.find((s) => s.id === 'trabalho')
  return (trabalho ?? secoes[0]).grupos[0].itens[0].href
}
