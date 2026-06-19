// ─── Clientes ───────────────────────────────────────────────
export interface Cliente {
  id: number
  nome: string
  email: string | null
  telefone: string | null
  cpf_cnpj: string | null
  cpf_validado: boolean | null
  cnpj_validado: boolean | null
  data_nascimento: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  tipo_cliente: string | null
  instagram: string | null
  origem_cliente: string | null
  observacoes: string | null
  estado_civil: string | null
  profissao: string | null
  nacionalidade: string | null
  ativo: boolean
  usuario_id: string | null
  created_at: string
}

// ─── Produtos / Estoque ──────────────────────────────────────
export interface Produto {
  id: number
  nome: string
  marca_id: number | null
  categoria_id: number | null
  subcategoria_id: number | null
  cores: string[] | null
  armazenamentos: string[] | null
  codigos: string | null
  categoria_tipo: string | null
  ativo: boolean
  created_at: string
  // joins
  marca_nome?: string
  categoria_nome?: string
}

export interface InventarioUnidade {
  id: number
  produto_id: number
  imei: string | null
  imei2: string | null
  numero_serie: string | null
  bateria: string | null
  condicao: 'novo' | 'seminovo' | 'usado' | null
  cor: string | null
  armazenamento: string | null
  preco_custo: number | null
  preco_venda: number | null
  fornecedor_id: number | null
  observacoes: string | null
  imagem_url: string | null
  status: 'disponivel' | 'reservado' | 'vendido' | 'assistencia' | null
  usuario_id: string | null
  ativo: boolean
  anatel_resultado: string | null
  tipo: string | null
  estado: string | null
  custo_reparo: number | null
  inventario_unidade_id: string | null
  cliente_id: number | null
  fotos_urls: string | null
  created_at: string
  // joins
  produto_nome?: string
  marca_nome?: string
}

// ─── Vendas / PDV ────────────────────────────────────────────
export interface Venda {
  id: number
  cliente_id: number | null
  vendedor_id: string | null
  valor_venda: number
  valor_custo: number | null
  lucro: number | null
  forma_pagamento: string | null
  parcelas: number | null
  canal_venda: string | null
  desconto_valor: number | null
  desconto_motivo: string | null
  desconto_aprovado_por: string | null
  observacoes: string | null
  usuario_id: string | null
  data_venda: string
  created_at: string
  status: string | null
  numero_serie: string | null
  comissao: number | null
  produto_id: number | null
  // joins
  cliente_nome?: string
  produto_nome?: string
}

export interface VendaPagamento {
  id: number
  venda_id: number
  forma_pagamento: string
  valor_pago: number
  bandeira_cartao: string | null
  parcelas: number | null
  valor_com_juros: number | null
  created_at: string
}

export interface TaxasPagamento {
  id: number
  forma_pagamento: string
  bandeira_cartao: string | null
  parcelas: number | null
  taxa_percentual: number | null
}

// ─── Assistência ─────────────────────────────────────────────
export interface Assistencia {
  id: number
  tipo: string | null
  protocolo: string | null
  cliente_id: number | null
  produto_id: number | null
  usuario_id: string | null
  responsavel_tecnico_id: string | null
  imei_serial: string | null
  defeito_relatado: string | null
  estado_entrada: string | null
  parecer_tecnico: string | null
  orcamento_valor: number | null
  celular_reserva_fornecido: boolean | null
  modelo_reserva: string | null
  dentro_garantia: boolean | null
  dias_garantia_restantes: number | null
  status: string | null
  observacoes: string | null
  data_entrada: string
  created_at: string
  inventario_unidade_id: string | null
  // joins
  cliente_nome?: string
  produto_nome?: string
  tecnico_nome?: string
}

// ─── Compras ─────────────────────────────────────────────────
export interface PedidoCompra {
  id: number
  fornecedor_id: number | null
  descricao: string | null
  valor_total: number | null
  status: string | null
  observacoes: string | null
  usuario_id: string | null
  data_pedido: string
  created_at: string
  // joins
  fornecedor_nome?: string
}

export interface Fornecedor {
  id: number
  nome: string
  // pode ter mais campos
}
