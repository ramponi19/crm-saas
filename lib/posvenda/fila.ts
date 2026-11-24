/**
 * A FILA DO PÓS-VENDA (C7 bloco 2, 24/11/2026) — regras puras, usadas pela página e pelos testes.
 * docs/design-pos-venda.md §2.5.2. Universal: nada de régua, texto ou loja de uma empresa aqui; o texto da mensagem é
 * o roteiro do passo (configuração da empresa), com as variáveis trocadas.
 */
import { diasEntre, diaNoFuso } from '@/lib/datas'
import { linkWhatsApp } from '@/lib/whatsapp-link'

export type GrupoFila = 'atrasados' | 'hoje' | 'proximos'
export type TipoAcao = 'whatsapp' | 'ligacao' | 'pesquisa' | 'tarefa_interna'

export interface ItemPosVenda {
  id: number
  negocioId: number | null
  filialId: number | null
  /** Dia previsto no fuso da empresa (YYYY-MM-DD). */
  previsto: string
  grupo: GrupoFila
  /** Dias de atraso (0 se não está atrasado). */
  atraso: number
  cliente: string
  telefone: string | null
  /** O que a pessoa comprou (produto do negócio; senão a categoria da venda), com a condição. */
  produto: string | null
  /** Dias desde a venda (null sem data). */
  diasDaVenda: number | null
  passo: string
  tipo: TipoAcao
  mensagem: string
  regua: string | null
  responsavelId: string
  responsavel: string | null
  loja: string | null
  tentativas: number
  /** Por onde falar com o cliente (decidirContato). */
  contato: ContatoDoPasso
  /** Mensagem que saiu pelo app do celular da loja desde o dia do passo (sugere "feito"). */
  ecoApp?: EcoDoApp | null
}

/**
 * POR ONDE FALAR COM O CLIENTE (24/11/2026, pedido do Lucas). Na ordem:
 *   nexus      há conversa do contato num WhatsApp conectado da loja: abre a conversa DENTRO do Nexus, com a mensagem
 *              no campo de envio (fica registrada; a resposta entra pelo roteamento do pós-venda);
 *   modelo     a mesma conversa, mas é API oficial e a janela de 24 h da Meta está fechada: só modelo aprovado
 *              (abre a lista das categorias liberadas para o pós-venda, com o modelo do passo já escolhido; D8 revista);
 *   app_loja   janela fechada e sem modelo, ou sem conversa, num número em COEXISTÊNCIA (o app WhatsApp Business do
 *              celular da loja usa o mesmo número): wa.me com o texto, "use no celular da loja"; a mensagem volta ao
 *              Nexus pelo eco (smb_message_echoes) e a fila sugere marcar o passo como feito;
 *   ligar      janela fechada e sem modelo, ou sem conversa, sem coexistência: copiar a mensagem ou ligar (o wa.me abriria
 *              o WhatsApp PESSOAL de quem clica — decisão do Lucas de 24/11/2026: não oferecer);
 *   sem_numero sem conversa e sem telefone válido.
 */
export type ModoContato = 'nexus' | 'modelo' | 'app_loja' | 'ligar' | 'sem_numero'
export interface ContatoDoPasso { modo: ModoContato; href: string | null; aviso: string | null
  /** Telefone para o "Ligar" (só dígitos), quando há um válido. */
  telefone?: string | null
  /** A conversa no WhatsApp da loja (modos nexus e modelo): a mensagem depois da nota vai por ela. */
  conversaId?: number | null }
export interface ConversaDoCanal {
  conversaId: number
  /** tipo do canal (whatsapp, instagram…) e se é a API oficial da Meta (tem WABA). */
  canalTipo: string
  oficial: boolean
  ultimaRecebida: string | null
  /** O canal da conversa está em coexistência (o mesmo número roda no app do celular da loja). */
  coexistencia?: boolean
}
export const JANELA_META_MS = 24 * 60 * 60 * 1000

/**
 * O modelo do passo. Convenção dos modelos do pós-venda (dita na tela de Configurações): {{1}} = primeiro nome do
 * cliente, {{2}} = produto comprado. Os valores vão no endereço (v1, v2) e o modal já os preenche.
 */
export interface ModeloDoPasso { id: number | null; categorias: string[]; variaveis?: string[] }

export const AVISO_APP_LOJA = 'Janela de 24 h fechada: use no celular da loja (a mensagem volta para o Nexus)'
export const AVISO_LIGAR = 'Janela de 24 h fechada e sem modelo: ligue ou copie a mensagem'

export function decidirContato(conversa: ConversaDoCanal | null, telefone: string | null | undefined, mensagem: string, agora: Date,
                               modelo: ModeloDoPasso = { id: null, categorias: ['UTILITY'] },
                               opcoes: { appDaLoja?: boolean } = {}): ContatoDoPasso {
  const tel = (telefone ?? '').replace(/\D/g, '')
  const fone = tel.length >= 10 ? tel : null
  // Sem modelo (ou sem conversa): pelo app do celular da loja, se o número está em coexistência; senão ligar/copiar.
  const semModelo = (aviso: string): ContatoDoPasso => {
    const wa = opcoes.appDaLoja ? linkWhatsApp(telefone, mensagem) : null
    if (wa) return { modo: 'app_loja', href: wa, aviso: AVISO_APP_LOJA, telefone: fone, conversaId: conversa?.conversaId ?? null }
    if (fone) return { modo: 'ligar', href: null, aviso, telefone: fone, conversaId: conversa?.conversaId ?? null }
    return { modo: 'sem_numero', href: null, aviso: 'Sem WhatsApp da loja e sem telefone válido', telefone: null }
  }
  if (conversa && conversa.canalTipo === 'whatsapp') {
    const ultima = conversa.ultimaRecebida ? new Date(conversa.ultimaRecebida).getTime() : null
    if (conversa.oficial && (ultima == null || agora.getTime() - ultima > JANELA_META_MS)) {
      if (!modelo.id) return semModelo(AVISO_LIGAR)
      const cat = (modelo.categorias.length ? modelo.categorias : ['UTILITY']).join(',')
      const vs = (modelo.variaveis ?? []).map((v, i) => `&v${i + 1}=${encodeURIComponent(v)}`).join('')
      return { modo: 'modelo', conversaId: conversa.conversaId, telefone: fone,
               href: `/comunicacao?c=${conversa.conversaId}&modelo=posvenda&cat=${cat}&m=${modelo.id}${vs}`,
               aviso: 'Janela de 24 h fechada: vai o modelo do passo' }
    }
    const t = mensagem.trim()
    return { modo: 'nexus', conversaId: conversa.conversaId, telefone: fone, href: `/comunicacao?c=${conversa.conversaId}${t ? `&texto=${encodeURIComponent(t)}` : ''}`, aviso: null }
  }
  return semModelo('Sem conversa no WhatsApp da loja: ligue ou copie a mensagem')
}

/**
 * ECO DO APP DA LOJA (coexistência): a mensagem que saiu pelo celular da loja para o cliente desde o dia do passo. A fila
 * SUGERE marcar o passo como feito (decisão do Lucas de 24/11/2026: não marca sozinha). Só passos de hoje ou atrasados.
 */
export interface EcoDoApp { em: string; texto: string }
export function ecoDoPasso(ecos: { em: string; texto: string | null }[], previstoDia: string, fuso: string): EcoDoApp | null {
  const doDia = ecos.filter((e) => diaNoFuso(new Date(e.em), fuso) >= previstoDia).sort((a, b) => b.em.localeCompare(a.em))
  const e = doDia[0]
  return e ? { em: e.em, texto: (e.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) } : null
}

/** Atrasado (antes de hoje), hoje, ou nos próximos dias. */
export function grupoDoDia(previsto: string, hoje: string): GrupoFila {
  if (previsto < hoje) return 'atrasados'
  if (previsto === hoje) return 'hoje'
  return 'proximos'
}

/**
 * "D+7 Experiência": o dia do passo na frente do título. Se o título já começa com o dia ("D+7 …"), não repete.
 */
export function rotuloDoPasso(diaOffset: number | null | undefined, titulo: string,
  extra: { ancora?: string | null; ocorrencia?: number | null } = {}): string {
  const t = (titulo ?? '').trim()
  const vez = (extra.ocorrencia ?? 1) > 1 ? ` · ${extra.ocorrencia}ª vez` : ''
  // Passo por data do ano, data de campo, uso ou repetição: o "D+" da venda não diz nada; vale o título.
  if ((extra.ancora ?? 'venda') !== 'venda' || (extra.ocorrencia ?? 1) > 1) return `${t}${vez}`
  if (diaOffset == null || /^D\s*\+\s*\d+/i.test(t)) return t
  return `D+${diaOffset} ${t}`.trim()
}

/** Primeiro nome, para a mensagem ("Ana Paula Souza" → "Ana"). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

export interface VariaveisMensagem {
  nome?: string | null
  produto?: string | null
  loja?: string | null
  vendedor?: string | null
  /** Campos personalizados (negócio, depois contato) para {{campo:chave}}. */
  campos?: Record<string, unknown> | null
}

/**
 * O roteiro do passo com as variáveis trocadas: {{nome}} (primeiro nome), {{produto}}, {{loja}}, {{vendedor}} e
 * {{campo:chave}} (campo personalizado do negócio ou do contato, 24/11/2026: placa, quilometragem, número de série…).
 * Variável sem valor some sem deixar espaço duplo; variável desconhecida fica como está (a empresa vê e corrige).
 */
export function montarMensagem(roteiro: string | null | undefined, v: VariaveisMensagem): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(v.nome),
    produto: (v.produto ?? '').trim(),
    loja: (v.loja ?? '').trim(),
    vendedor: primeiroNome(v.vendedor),
  }
  return (roteiro ?? '')
    .replace(/\{\{\s*(nome|produto|loja|vendedor)\s*\}\}/gi, (_, k: string) => valores[k.toLowerCase()] ?? '')
    .replace(/\{\{\s*campo:([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => textoDoCampo(v.campos?.[k.toLowerCase()]))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.!?])/g, '$1')
    .trim()
}

/** "iPhone 15 Pro · Seminovo": o produto (ou a categoria) e a condição, como a empresa chama. */
export function descricaoDaCompra(produto: string | null | undefined, categoria: string | null | undefined,
                                  condicao: string | null | undefined, rotuloUsado = 'Usado'): string | null {
  const nome = (produto ?? '').trim() || (categoria ?? '').trim()
  const cond = condicao === 'usado' || condicao === 'seminovo' ? rotuloUsado : condicao === 'novo' ? 'Novo' : ''
  const partes = [nome, cond].filter(Boolean)
  return partes.length ? partes.join(' · ') : null
}

/** Dias inteiros entre a venda e hoje (no fuso da empresa); null sem data. */
export function diasDesdeAVenda(diaVenda: string | null | undefined, hoje: string): number | null {
  if (!diaVenda || !/^\d{4}-\d{2}-\d{2}$/.test(diaVenda)) return null
  return Math.max(0, diasEntre(diaVenda, hoje))
}

/** "hoje", "1 dia", "12 dias". */
export function textoDias(n: number): string {
  if (n === 0) return 'hoje'
  return n === 1 ? '1 dia' : `${n} dias`
}

/**
 * Ordem da fila: atrasados primeiro (o mais antigo no topo), depois hoje e os próximos, pela data. No mesmo dia fica a
 * ordem de chegada (a consulta já vem pela hora prevista; o sort é estável).
 */
export function ordenarFila<T extends { grupo: GrupoFila; previsto: string }>(itens: T[]): T[] {
  const peso: Record<GrupoFila, number> = { atrasados: 0, hoje: 1, proximos: 2 }
  return [...itens].sort((a, b) => peso[a.grupo] - peso[b.grupo] || a.previsto.localeCompare(b.previsto))
}

/** Valor de campo personalizado como texto: número no formato brasileiro, data dd/mm/aaaa, lista com vírgulas. */
export function textoDoCampo(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (Array.isArray(v)) return v.map(textoDoCampo).filter(Boolean).join(', ')
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
    return m ? `${m[3]}/${m[2]}/${m[1]}` : v.trim()
  }
  return ''
}
