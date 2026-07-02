/**
 * Importador de imóveis a partir do XML do site/sistema da imobiliária
 * (padrão OLX / Canal Pro — ZAP/VivaReal). O site continua a FONTE da verdade;
 * o CRM importa (upsert por código). Parser tolerante baseado em tags.
 *
 * Obs: v1 cobre o formato OLX/Canal Pro (<Imoveis><Imovel>…). Feeds em outros
 * formatos (ex.: VivaReal ListingDataFeed) precisam de mapeamento adicional —
 * ajustamos quando virmos o feed real do cliente.
 */

export interface ImovelImportado {
  codigo: string | null
  titulo: string | null
  tipo: string
  finalidade: string
  descricao: string | null
  valor_venda: number | null
  valor_locacao: number | null
  valor_condominio: number | null
  valor_iptu: number | null
  area_util: number | null
  area_total: number | null
  quartos: number | null
  suites: number | null
  banheiros: number | null
  vagas: number | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  latitude: number | null
  longitude: number | null
  fotos: string[]
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()

/** Primeiro valor de qualquer uma das tags informadas dentro do bloco. */
function tag(block: string, ...names: string[]): string | null {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'))
    if (m && m[1] != null) {
      const v = decode(m[1])
      if (v !== '') return v
    }
  }
  return null
}

const toNum = (v: string | null): number | null => {
  if (v == null) return null
  const n = Number(v.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const toInt = (v: string | null): number | null => {
  const n = toNum(v)
  return n == null ? null : Math.round(n)
}

const TIPO_MAP: Record<string, string> = {
  apartamento: 'apartamento', apto: 'apartamento', casa: 'casa', terreno: 'terreno', lote: 'terreno',
  comercial: 'comercial', sala: 'sala', loja: 'comercial', galpao: 'galpao', 'galpão': 'galpao',
  cobertura: 'cobertura', sitio: 'sitio', 'sítio': 'sitio', chacara: 'sitio', fazenda: 'sitio',
}
const normTipo = (v: string | null): string => {
  const k = (v ?? '').toLowerCase().trim()
  return TIPO_MAP[k] ?? (k || 'apartamento')
}
const normFinalidade = (v: string | null): string => {
  const k = (v ?? '').toLowerCase()
  if (k.includes('loca') || k.includes('alug')) return k.includes('venda') ? 'ambos' : 'locacao'
  return 'venda'
}

/** Extrai as URLs de foto de um bloco <Imovel>. */
function extrairFotos(block: string): string[] {
  const urls = [...block.matchAll(/<(?:URLArquivo|URL|Foto|Imagem)[^>]*>([\s\S]*?)<\/(?:URLArquivo|URL|Foto|Imagem)>/gi)]
    .map(m => decode(m[1]))
    .filter(u => /^https?:\/\//i.test(u))
  return Array.from(new Set(urls))
}

/** Parseia o XML e retorna a lista de imóveis normalizados. */
export function parseFeedImoveis(xml: string): ImovelImportado[] {
  const blocos = [...xml.matchAll(/<Imovel\b[\s\S]*?<\/Imovel>/gi)].map(m => m[0])
  return blocos.map(b => ({
    codigo: tag(b, 'CodigoImovel', 'CodigoCliente', 'Codigo', 'ListingID', 'clientListingId'),
    titulo: tag(b, 'TituloImovel', 'Titulo', 'Title'),
    tipo: normTipo(tag(b, 'TipoImovel', 'Tipo', 'SubTipoImovel')),
    finalidade: normFinalidade(tag(b, 'Finalidade', 'TransactionType')),
    descricao: tag(b, 'Observacao', 'Descricao', 'Description'),
    valor_venda: toNum(tag(b, 'PrecoVenda', 'ValorVenda', 'ListPrice')),
    valor_locacao: toNum(tag(b, 'PrecoLocacao', 'ValorLocacao', 'RentalPrice')),
    valor_condominio: toNum(tag(b, 'ValoresCondominio', 'ValorCondominio', 'PrecoCondominio')),
    valor_iptu: toNum(tag(b, 'ValorIPTU', 'PrecoIPTU', 'IPTU')),
    area_util: toNum(tag(b, 'AreaUtil', 'AreaPrivativa', 'LivingArea')),
    area_total: toNum(tag(b, 'AreaTotal', 'TotalArea')),
    quartos: toInt(tag(b, 'QtdDormitorios', 'Dormitorios', 'Quartos', 'Bedrooms')),
    suites: toInt(tag(b, 'QtdSuites', 'Suites', 'Suítes')),
    banheiros: toInt(tag(b, 'QtdBanheiros', 'Banheiros', 'Bathrooms')),
    vagas: toInt(tag(b, 'QtdVagas', 'Vagas', 'Garagens', 'Garage')),
    cep: tag(b, 'CEP', 'ZipCode'),
    logradouro: tag(b, 'Endereco', 'Logradouro', 'Address'),
    numero: tag(b, 'Numero', 'StreetNumber'),
    bairro: tag(b, 'Bairro', 'Neighborhood'),
    cidade: tag(b, 'Cidade', 'City'),
    uf: tag(b, 'UF', 'Estado', 'State'),
    latitude: toNum(tag(b, 'Latitude')),
    longitude: toNum(tag(b, 'Longitude')),
    fotos: extrairFotos(b),
  }))
}
